import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Telemetry } from '../dsp/engine/engine';
import type { EngineParams } from '../dsp/engine/params';
import { computeGeometry, TractGeometry } from '../dsp/tract/geometry';
import { AreaFunction, sectionsFromGeometry, resampleTube } from '../dsp/tract/areaFunction';
import { formants, Formant } from '../dsp/tract/acoustics';
import { noseOf, portArea } from '../dsp/tract/nasal';
import { loadEnglishLexicon, englishLexiconSize } from '../dsp/speech/english';
import { NaturalnessOptions, NATURAL_ALL } from '../dsp/speech/sequencer';
import { voice } from './voice/voice';
import type { StreamBlock } from './voice/sink';

export type Lang = 'it' | 'en';
export type Mode = 'tour' | 'lab';
export type ControlTab = 'source' | 'tract' | 'teeth' | 'noise' | 'speak' | 'melody' | 'ab' | 'machine';
export type ViewTab = 'spectrum' | 'scope' | 'glottis' | 'chart' | 'tube' | 'tract3d';
export type FieldMode = 'pressure' | 'velocity' | 'air';

export interface UiState {
  lang: Lang;
  mode: Mode;
  chapter: number;
  controlTab: ControlTab;
  viewTab: ViewTab;
  /** spectrogram analysis window, ms */
  specWindow: number;
  /** spectrogram as 80-band log-mel */
  mel: boolean;
  field: FieldMode;
  /** show the spectral envelope of the filter on the spectrum */
  envelope: boolean;
  showHarmonics: boolean;
  /** standing waves at the formants in the tube view */
  standing: number;
  freeze: boolean;
  micOn: boolean;
  /** the audio is running (mirrors the voice) */
  audioOn: boolean;
  info: string | null;
  /** show numeric readouts everywhere (plain words otherwise) */
  numbers: boolean;
  /** the speak panel: text, its language, rate, accent strength and naturalness ingredients */
  speech: { text: string; lang: Lang; rate: number; accent: number; natural: NaturalnessOptions };
  /** the American English pronunciation dictionary */
  lexicon: 'idle' | 'loading' | 'ready' | 'error';
}

/** First sentence in the speak panel, in the language of the interface. */
export const DEFAULT_SPEECH_TEXT: Record<Lang, string> = { en: 'a buzz, a hiss and a filter', it: 'la voce è fatta di aria' };

const RING = 1 << 17;
const LANG_KEY = 'voice-workshop.lang';

/**
 * Interface language: English by default; `?lang=it` in the address or the
 * viewer's last choice (kept in this browser) picks Italian.
 */
function initialLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'it' || q === 'en') return q;
  } catch { /* no window (tests) */ }
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    if (v === 'it' || v === 'en') return v;
  } catch { /* storage blocked */ }
  return 'en';
}

/**
 * The state of the interface and of the analysis views. What is heard lives
 * in the voice controller (./voice/voice.ts), the only door to the audio.
 */
class Store {
  ui: UiState = {
    lang: initialLang(), mode: 'lab', chapter: 0, controlTab: 'source', viewTab: 'chart', specWindow: 30, mel: false,
    field: 'pressure', envelope: true, showHarmonics: true, standing: 0, freeze: false, micOn: false, audioOn: false,
    info: null, numbers: false,
    speech: { text: '', lang: 'en', rate: 1, accent: 5, natural: { ...NATURAL_ALL } },
    lexicon: 'idle',
  };
  readonly ring = { out: new Float32Array(RING), flow: new Float32Array(RING), noise: new Float32Array(RING), w: 0, total: 0 };
  private listeners = new Set<() => void>();
  private version = 0;

  constructor() {
    this.ui.speech = { ...this.ui.speech, text: DEFAULT_SPEECH_TEXT[this.ui.lang], lang: this.ui.lang };
    voice.onStream((s) => this.pushStream(s));
    voice.onInfo = (msg) => this.setUi({ info: msg });
    voice.subscribe(() => {
      if (voice.running !== this.ui.audioOn) this.ui = { ...this.ui, audioOn: voice.running };
      this.emit();
    });
  }

  /** Latest telemetry of the engine (may be stale when the audio sleeps: see voice.live()). */
  get telemetry(): Telemetry | null { return voice.telemetry; }

  private pushStream(s: StreamBlock): void {
    if (this.ui.freeze) return;
    const r = this.ring;
    const n = s.out.length;
    for (let i = 0; i < n; i++) {
      const k = (r.w + i) & (RING - 1);
      r.out[k] = s.out[i]; r.flow[k] = s.flow[i]; r.noise[k] = s.noise[i];
    }
    r.w = (r.w + n) & (RING - 1);
    r.total += n;
  }

  /** Copies the last n samples of a ring stream into out (oldest first). */
  readRing(which: 'out' | 'flow' | 'noise', n: number, out?: Float32Array): Float32Array {
    const r = this.ring;
    const res = out ?? new Float32Array(n);
    const src = r[which];
    const start = (r.w - n + RING * 4) & (RING - 1);
    for (let i = 0; i < n; i++) res[i] = src[(start + i) & (RING - 1)];
    return res;
  }

  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getVersion = (): number => this.version;
  private emit(): void { this.version++; for (const l of this.listeners) l(); }

  setUi(u: Partial<UiState>): void {
    if (u.lang && u.lang !== this.ui.lang) {
      try { window.localStorage.setItem(LANG_KEY, u.lang); } catch { /* storage blocked */ }
      // the untouched example sentence follows the interface language
      const sp = this.ui.speech;
      if (!u.speech && sp.text === DEFAULT_SPEECH_TEXT[this.ui.lang]) u = { ...u, speech: { ...sp, text: DEFAULT_SPEECH_TEXT[u.lang], lang: u.lang } };
    }
    this.ui = { ...this.ui, ...u };
    this.emit();
  }

  /** Loads the English pronunciation dictionary once (spelling rules are used until it arrives). */
  async ensureLexicon(): Promise<void> {
    if (englishLexiconSize() > 0) { if (this.ui.lexicon !== 'ready') this.setUi({ lexicon: 'ready' }); return; }
    if (this.ui.lexicon !== 'loading') this.setUi({ lexicon: 'loading' });
    try {
      await loadEnglishLexicon();
      this.setUi({ lexicon: 'ready' });
    } catch {
      this.setUi({ lexicon: 'error' });
    }
  }

  setSpeech(u: Partial<UiState['speech']>): void { this.setUi({ speech: { ...this.ui.speech, ...u } }); }

  // --------------------------------------------------------- derived data

  private geomKey = '';
  private geomCache: { geom: TractGeometry; af: AreaFunction; formants: Formant[] } | null = null;

  /** Geometry, area function and formants of the shape that sounds (cached). */
  derived(): { geom: TractGeometry; af: AreaFunction; formants: Formant[] } {
    const p = voice.sounding();
    const a = p.articulators;
    let key = '';
    for (const k in a) key += (Math.round((a as unknown as Record<string, number>)[k] * 200) / 200) + ',';
    key += JSON.stringify(p.anatomy) + JSON.stringify(p.teeth) + (p.tubeMode ? p.tubeAreas.join(',') + p.tubeLength : '');
    if (key !== this.geomKey || !this.geomCache) {
      this.geomKey = key;
      const geom = computeGeometry(a, p.anatomy, p.teeth);
      let af: AreaFunction = sectionsFromGeometry(geom);
      if (p.tubeMode) af = tubeAreaFunction(p);
      let fm: Formant[] = [];
      try {
        fm = formants(af, { port: portArea(a.velum, p.anatomy.nasalLeak, p.anatomy.scale), scale: p.anatomy.scale, nose: noseOf(p.anatomy) }, 5000, 30);
      } catch { fm = []; }
      this.geomCache = { geom, af, formants: fm };
    }
    return this.geomCache;
  }
}

export function tubeAreaFunction(p: EngineParams, n = 44): AreaFunction {
  const areas = resampleTube(p.tubeAreas, n, new Float64Array(n), 1e-4);
  return { areas, length: p.tubeLength, dx: p.tubeLength / n, teethIndex: n - 3, lipsIndex: n - 2 };
}

export const store = new Store();

/** React binding: re-renders when the store changes and the selected value differs. */
export function useStore<T>(sel: (s: Store) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store));
}

export function useUi(): UiState { return useStore((s) => s.ui); }
export type { Store };

/** Re-renders the component `hz` times per second (0 = never), for live readouts. */
export function useTick(hz: number): void {
  const [, set] = useState(0);
  useEffect(() => {
    if (!hz) return;
    const id = setInterval(() => set((x) => x + 1), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
}
