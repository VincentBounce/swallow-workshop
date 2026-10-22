import { useEffect, useState, useSyncExternalStore } from 'react';
import { AudioBridge, StreamBlock } from '../audio/audioEngine';
import type { Telemetry } from '../dsp/engine/engine';
import { defaultParams, EngineParams, Score } from '../dsp/engine/params';
import { Articulators } from '../dsp/tract/types';
import { computeGeometry, TractGeometry } from '../dsp/tract/geometry';
import { AreaFunction, sectionsFromGeometry, resampleTube } from '../dsp/tract/areaFunction';
import { formants, Formant } from '../dsp/tract/acoustics';
import { noseOf, portArea } from '../dsp/tract/nasal';
import { loadEnglishLexicon, englishLexiconSize } from '../dsp/speech/english';
import { NaturalnessOptions, NATURAL_ALL } from '../dsp/speech/sequencer';

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
  audioOn: boolean;
  /** text currently spoken and its score */
  speaking: Score | null;
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

class Store {
  params: EngineParams = defaultParams();
  ui: UiState = {
    lang: initialLang(), mode: 'lab', chapter: 0, controlTab: 'source', viewTab: 'chart', specWindow: 30, mel: false,
    field: 'pressure', envelope: true, showHarmonics: true, standing: 0, freeze: false, micOn: false, audioOn: false,
    speaking: null, info: null, numbers: false,
    speech: { text: '', lang: 'en', rate: 1, accent: 5, natural: { ...NATURAL_ALL } },
    lexicon: 'idle',
  };
  telemetry: Telemetry | null = null;
  telemetryTime = 0;
  readonly audio = new AudioBridge();
  readonly ring = { out: new Float32Array(RING), flow: new Float32Array(RING), noise: new Float32Array(RING), w: 0, total: 0 };
  private listeners = new Set<() => void>();
  private version = 0;

  constructor() {
    this.ui.speech = { ...this.ui.speech, text: DEFAULT_SPEECH_TEXT[this.ui.lang], lang: this.ui.lang };
    this.params.phonate = false;
    this.params.articulators = { ...this.params.articulators, ...{ jaw: 0.94, tongueX: 0.06, tongueY: -0.83, lipOpen: 0.5, lipProtrude: 0.04 } };
    this.audio.onTelemetry = (t) => { this.telemetry = t; this.telemetryTime = performance.now(); if (this.ui.speaking && !t.playing) this.setUi({ speaking: null }); };
    this.audio.onStream = (s) => this.pushStream(s);
    this.audio.onState = (r) => { if (r !== this.ui.audioOn) this.setUi({ audioOn: r }); };
  }

  private clipTimer = 0;
  private clipFeeding = false;

  /**
   * Plays an offline-rendered clip and feeds it to the analysis views at the
   * real-time rate (the live voice is silenced meanwhile).
   */
  async playClip(samples: Float32Array, fs: number, flow?: Float32Array): Promise<void> {
    this.setParams((p) => { p.phonate = false; });
    await this.audio.playClip(samples, fs, () => { this.clipFeeding = false; });
    window.clearInterval(this.clipTimer);
    this.clipFeeding = true;
    const block = 1024;
    let pos = 0;
    const t0 = performance.now();
    this.clipTimer = window.setInterval(() => {
      const due = Math.min(samples.length, Math.floor(((performance.now() - t0) / 1000) * fs));
      while (pos + block <= due) {
        const out = samples.subarray(pos, pos + block);
        this.pushStream({ out, flow: flow ? flow.subarray(pos, pos + block) : new Float32Array(block), noise: new Float32Array(block) }, true);
        pos += block;
      }
      if (pos + block > samples.length) { window.clearInterval(this.clipTimer); this.clipFeeding = false; }
    }, 15);
  }

  private pushStream(s: StreamBlock, fromClip = false): void {
    if (this.ui.freeze) return;
    if (this.clipFeeding && !fromClip) return;
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

  setParams(mut: (p: EngineParams) => void): void {
    const o = this.params;
    const p: EngineParams = {
      ...o,
      articulators: { ...o.articulators }, anatomy: { ...o.anatomy }, teeth: { ...o.teeth }, source: { ...o.source },
      noise: { ...o.noise, user: { ...o.noise.user, curve: o.noise.user.curve.slice() } }, tubeAreas: o.tubeAreas.slice(),
    };
    mut(p);
    this.params = p;
    this.audio.setParams(p);
    this.emit();
  }

  setArticulators(a: Partial<Articulators>): void { this.setParams((p) => { Object.assign(p.articulators, a); }); }

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

  async startAudio(): Promise<void> {
    try {
      await this.audio.start(this.params);
      this.setUi({ audioOn: this.audio.running });
    } catch (e) {
      this.setUi({ info: String(e) });
    }
  }

  async toggleAudio(): Promise<void> {
    if (this.audio.running) { await this.audio.suspend(); this.setUi({ audioOn: false }); }
    else await this.startAudio();
  }

  async speak(score: Score): Promise<void> {
    if (!this.audio.running) await this.startAudio();
    this.audio.playScore(score);
    this.setUi({ speaking: score });
  }

  stopSpeaking(): void { this.audio.stopScore(); this.setUi({ speaking: null }); }

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

  /** Current articulators (smoothed ones from the engine when it runs). */
  currentArticulators(): Articulators {
    const t = this.telemetry;
    if (t && this.ui.audioOn && performance.now() - this.telemetryTime < 500) return t.articulators;
    return this.params.articulators;
  }

  /** Geometry, area function and formants of the current shape (cached). */
  derived(): { geom: TractGeometry; af: AreaFunction; formants: Formant[] } {
    const a = this.currentArticulators();
    const p = this.params;
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

export function useParams(): EngineParams { return useStore((s) => s.params); }
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
