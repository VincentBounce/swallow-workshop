import { store, ViewTab, ControlTab } from './store';
import { VOICE_PRESETS } from './presets';
import { voice, mriTube } from './voice/voice';
import type { EngineParams } from '../dsp/engine/params';
import { textToPhones } from '../dsp/speech/g2p';
import { buildScore } from '../dsp/speech/sequencer';
import { DEFAULT_SOURCE, DEFAULT_NOISE } from '../dsp/engine/params';
import { DEFAULT_ANATOMY } from '../dsp/tract/types';
import { transferMagnitudes, AcousticOptions } from '../dsp/tract/acoustics';
import { portArea, noseOf } from '../dsp/tract/nasal';
import { MRI_VOWELS } from '../dsp/data/mri';
import { isVowel } from '../dsp/speech/phonemes';
import { solveLF, rdToTiming, lfDerivative } from '../dsp/glottis/lf';
import type { NaturalnessOptions } from '../dsp/speech/sequencer';

type Bi = { it: string; en: string };
export interface TourAction { label: Bi; run: () => void }
/** The quick controls a Learn step can show under the stage. */
export type QuickId = 'vowels' | 'consonants' | 'fricatives' | 'nasals' | 'pitch' | 'voices' | 'say' | 'mri' | 'nose';
/** A hint the Learn mode draws on the head: the handle to drag, and what to do with it. */
export interface HeadGuide { handle: 'tongue' | 'tip' | 'jaw' | 'lips' | 'velum'; text: Bi }

/**
 * One step of a lesson: one idea in a sentence or two, one view beside the
 * head, the sounds to try (the first is the main one), what to look at, and
 * the explanation on demand. Opening a step is silent: the head takes the
 * step's starting shape and nothing sounds until the reader asks.
 */
export interface Step {
  /** the idea, in a sentence or two */
  text: Bi;
  /** the view beside the head */
  view: ViewTab;
  /** the starting point, set silently when the step opens (posture, voice, view options) */
  setup?: () => void;
  /** the sounds to try, in order */
  try?: TourAction[];
  /** the hand to use: an arrow on the head */
  guide?: HeadGuide;
  /** what to watch or listen for, written on the view */
  look?: Bi;
  /** a strip of controls, when the step is about choosing */
  quick?: QuickId;
  /** the explanation behind it, on demand */
  why?: Bi;
  /** the live numbers behind it (with the Numbers switch on) */
  numbers?: () => Bi;
  /** a tool opened under the step; for the A/B tool, the experiment it starts on */
  tool?: { tab: ControlTab; ab?: string };
}
export interface Lesson { title: Bi; steps: Step[] }

/*
 * Every action of the tour is an explicit choice of the reader, so it takes
 * over whatever was playing (a sentence, a melody, a tube) before it acts.
 */
const set = (mut: (p: EngineParams) => void) => voice.edit(mut, { takeOver: true });
/** A step that follows by itself after a moment (cancelled by the next action). */
let pending: (() => void) | null = null;
const later = (ms: number, fn: () => void) => {
  const id = setTimeout(() => { pending = null; fn(); }, ms);
  pending = () => clearTimeout(id);
};
const clean = () => set((p) => {
  p.source = { ...DEFAULT_SOURCE };
  p.noise = { ...DEFAULT_NOISE, user: { ...p.noise.user, on: false } };
  p.anatomy = { ...DEFAULT_ANATOMY };
  p.voicing = true; p.bypassTract = false; p.tubeMode = false; p.abduction = 0;
});
/** Shapes the head as a phoneme without a sound (where a step starts). */
const pose = (v: string, f0?: number) => voice.holdPhoneme(v, { f0, blow: false });
/** Says a phoneme for a breath. */
const vowel = (v: string, f0?: number) => voice.holdPhoneme(v, { f0 });
const phoneme = (v: string) => voice.holdPhoneme(v);
/** Gives the head as it is a breath of voice. */
const blow = () => set((p) => { p.phonate = true; });
const preset = (id: string) => VOICE_PRESETS.find((x) => x.id === id)!;
/** Speaks a text; resolves 'done' when it has been heard to the end. */
const say = async (text: string, lang: 'it' | 'en') => {
  if (lang === 'en') await store.ensureLexicon();
  const p = voice.manual;
  return voice.speak(buildScore(textToPhones(text, lang), { lang, f0: p.source.f0, ps: Math.max(7, p.source.ps) }), { it: text, en: text });
};
/** Speaks the example in the language of the interface. */
const sayL = (text: Bi) => { const lang = store.ui.lang; return say(text[lang], lang); };
/** Speaks two examples one after the other (the second only if the first was heard to the end). */
const sayTwo = async (a: () => Promise<'done' | 'stopped'>, b: () => Promise<'done' | 'stopped'>) => { if ((await a()) === 'done') await b(); };
/** Glides the pitch (a demonstration): the pitch slider follows and stays at the end value. */
const glide = (from: number, to: number, seconds: number) =>
  void voice.glide(from, to, seconds, { it: `da ${Math.round(from)} a ${Math.round(to)} Hz`, en: `from ${Math.round(from)} to ${Math.round(to)} Hz` });

/** A number with the decimal mark of the language. */
const dec = (x: number, digits: number, l: 'it' | 'en') => (l === 'it' ? x.toFixed(digits).replace('.', ',') : x.toFixed(digits)).replace('-', '−');
const cm = (p: number, l: 'it' | 'en') => dec(p / 980.665, 1, l);
const both = (s: (lang: 'it' | 'en') => string): Bi => ({ it: s('it'), en: s('en') });
/** The first three formants of the current shape (head or tube). */
const formantNumbers = (): Bi => {
  const f = store.derived().formants.slice(0, 3).map((x) => Math.round(x.f));
  return both(() => f.map((v, i) => `F${i + 1} ${v}`).join(' · ') + ' Hz');
};
/** The pitch and where its first harmonics fall. */
const harmonicNumbers = (): Bi => {
  const f0 = store.telemetry?.f0 ?? 0;
  if (f0 <= 0) return { it: 'premi un suono', en: 'play a sound' };
  const h = [1, 2, 3, 4].map((k) => Math.round(k * f0)).join(', ');
  const below = Math.floor(1000 / f0);
  return { it: `F0 ${Math.round(f0)} Hz · armoniche a ${h}… Hz · ${below} sotto 1 kHz`, en: `F0 ${Math.round(f0)} Hz · harmonics at ${h}… Hz · ${below} below 1 kHz` };
};
/** Mouth and lung pressure, pitch and nasal airflow, from the running engine. */
const airNumbers = (): Bi => {
  const t = voice.live();
  if (!t) return { it: 'premi un suono', en: 'play a sound' };
  return both((l) => {
    const f0 = t.f0 > 0 ? `${Math.round(t.f0)} Hz` : l === 'it' ? 'nessuna (corde ferme)' : 'none (folds still)';
    return l === 'it'
      ? `pressione in bocca ${cm(t.po, l)} cmH₂O, nei polmoni ${cm(t.ps, l)} · flusso dal naso ${Math.round(t.uNose)} cm³/s · F0 ${f0}`
      : `mouth pressure ${cm(t.po, l)} cmH₂O, lungs ${cm(t.ps, l)} · nasal airflow ${Math.round(t.uNose)} cm³/s · F0 ${f0}`;
  });
};
/** Loads one of the vowels measured by MRI as the tube, and blows through it. */
const mri = (ipa: string) => {
  const v = MRI_VOWELS.find((m) => m.ipa === ipa);
  if (v) voice.loadTube(v.areas, v.areas.length * v.dx, mriTube(ipa), { takeOver: true });
};
/** Peaks and valleys of the current filter below 3 kHz, nose included. */
let extremaCache: { key: unknown; value: Bi } | null = null;
const peakNumbers = (): Bi => {
  const d = store.derived(), p = voice.sounding();
  if (extremaCache?.key === d) return extremaCache.value;
  const fr: number[] = [];
  for (let f = 100; f <= 3000; f += 10) fr.push(f);
  const port = portArea(voice.sounding().articulators.velum, p.anatomy.nasalLeak, p.anatomy.scale);
  const mag = transferMagnitudes(d.af, fr, { port, scale: p.anatomy.scale, nose: noseOf(p.anatomy) });
  const poles: number[] = [], zeros: number[] = [];
  for (let i = 1; i < fr.length - 1; i++) {
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1]) poles.push(fr[i]);
    if (mag[i] < mag[i - 1] && mag[i] <= mag[i + 1]) zeros.push(fr[i]);
  }
  const value = both((l) => l === 'it'
    ? `picchi ${poles.join(' · ')} Hz; valli ${zeros.join(' · ') || 'nessuna'} Hz`
    : `peaks ${poles.join(' · ')} Hz; valleys ${zeros.join(' · ') || 'none'} Hz`);
  extremaCache = { key: d, value };
  return value;
};
/** Where a side branch swallows the sound: the deepest dip of the filter with the branch relative to without it. */
let valleyCache: { key: unknown; value: { f: number; db: number } } | null = null;
const branchValley = (without: AcousticOptions, lo: number, hi: number): { f: number; db: number } => {
  const d = store.derived(), p = voice.sounding();
  const key = [d, JSON.stringify(without)].join();
  if (valleyCache?.key === key) return valleyCache.value;
  const fr: number[] = [];
  for (let f = lo; f <= hi; f += 10) fr.push(f);
  const port = portArea(voice.sounding().articulators.velum, p.anatomy.nasalLeak, p.anatomy.scale);
  const o: AcousticOptions = { port, scale: p.anatomy.scale, nose: noseOf(p.anatomy) };
  const a = transferMagnitudes(d.af, fr, o), b = transferMagnitudes(d.af, fr, { ...o, ...without });
  let value = { f: 0, db: 0 };
  for (let i = 0; i < fr.length; i++) {
    const db = 20 * Math.log10(a[i] / b[i]);
    if (db < value.db) value = { f: fr[i], db };
  }
  valleyCache = { key, value };
  return value;
};
/** Formants of a lateral and the valley of the cavity behind its tip. */
const lateralNumbers = (): Bi => {
  const f = formantNumbers(), sl = store.derived().af.supralingual;
  if (!sl || sl.at < 0) return both((l) => `${f[l]} · ${l === 'it' ? 'nessuna cavità chiusa dietro la punta' : 'no closed cavity behind the tip'}`);
  const z = branchValley({ supralingual: false }, 2000, 5000);
  return both((l) => `${f[l]} · ${l === 'it' ? 'valle della cavità dietro la punta' : 'valley of the cavity behind the tip'} ${z.f} Hz (${dec(z.db, 0, l)} dB)`);
};
/** Air left in the piriform fossae and the valley they make. */
const piriformNumbers = (): Bi => {
  const pf = store.derived().geom.piriform;
  const z = branchValley({ piriform: false }, 3000, 9000);
  return both((l) => {
    const air = l === 'it' ? `aria in ogni seno ${dec(pf.length, 1, l)} cm su ${dec(pf.full, 1, l)}` : `air in each fossa ${dec(pf.length, 1, l)} of ${dec(pf.full, 1, l)} cm`;
    if (z.db > -1) return `${air} · ${l === 'it' ? 'nessuna valle' : 'no valley'}`;
    return `${air} · ${l === 'it' ? 'la loro valle' : 'their valley'} ${z.f} Hz (${dec(z.db, 0, l)} dB)`;
  });
};
/** H1-H2 of the source pulse at the current Rd: the buzz before the filter. */
const sourceNumbers = (): Bi => {
  const s = voice.sounding().source;
  const sh = solveLF(rdToTiming(s.rd));
  const n = 256;
  const h = (k: number) => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const v = lfDerivative(sh, i / n); re += v * Math.cos((2 * Math.PI * k * i) / n); im -= v * Math.sin((2 * Math.PI * k * i) / n); }
    return Math.hypot(re, im);
  };
  const d = 20 * Math.log10(h(1) / h(2));
  return {
    it: `Rd ${dec(s.rd, 1, 'it')}, fessura ${dec(s.chink, 2, 'it')} cm² · nel ronzio da solo la prima armonica supera la seconda (H1-H2) di ${dec(d, 1, 'it')} dB: circa −2 pressata, 4 normale, 18 soffiata`,
    en: `Rd ${dec(s.rd, 1, 'en')}, chink ${dec(s.chink, 2, 'en')} cm² · in the buzz alone the first harmonic exceeds the second (H1-H2) by ${dec(d, 1, 'en')} dB: about −2 pressed, 4 modal, 18 breathy`,
  };
};
const NO_NATURAL: NaturalnessOptions = { timing: false, intonation: false, micro: false, voiceQuality: false, coarticulation: false };
/** Speaks the example in the language of the interface with some ingredients switched off. */
const sayWithout = async (text: Bi, off: Partial<NaturalnessOptions>) => {
  const lang = store.ui.lang;
  if (lang === 'en') await store.ensureLexicon();
  const p = voice.manual;
  return voice.speak(buildScore(textToPhones(text[lang], lang), { lang, f0: p.source.f0, ps: Math.max(7, p.source.ps), natural: { ...off } }), text);
};
/** Duration of the first vowel of a word, in ms, as the sequencer plans it. */
const vowelMs = (word: string, lang: 'it' | 'en'): number => {
  const sc = buildScore(textToPhones(word, lang), { lang });
  const v = sc.phones.find((q) => isVowel(q.ipa));
  return v ? Math.round(1000 * (v.t1 - v.t0)) : 0;
};
const SENTENCE: Bi = { it: 'la voce è fatta di aria e di un filtro', en: 'every voice is made of air and a filter' };
const spectrum = (o: { harmonics?: boolean; envelope?: boolean } = {}) => store.setUi({ showHarmonics: o.harmonics ?? true, envelope: o.envelope ?? true });

const LESSON_LIST: Lesson[] = [
  {
    title: { it: 'Un ronzio e un filtro', en: 'A buzz and a filter' },
    steps: [
      {
        text: { it: 'Ogni voce è fatta di due ingredienti: un ronzio, che nasce nella laringe, e un filtro, la gola e la bocca, che lo colora.', en: 'Every voice is made of two ingredients: a buzz, born in the larynx, and a filter, the throat and the mouth, that colors it.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        try: [{ label: { it: 'Ascolta una «a»', en: 'Hear an “ah”' }, run: () => vowel('a', 120) }],
        look: { it: 'Le righe sono il ronzio; le colline sopra di loro sono il filtro.', en: 'The spikes are the buzz; the hills over them are the filter.' },
      },
      {
        text: { it: 'Cambia solo il filtro: la lingua si muove, il ronzio resta lo stesso.', en: 'Change only the filter: the tongue moves, the buzz stays the same.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        try: [
          { label: { it: '«a»', en: '“ah”' }, run: () => vowel('a', 120) },
          { label: { it: '«i»', en: '“ee”' }, run: () => vowel('i', 120) },
        ],
        look: { it: 'Le righe restano dove sono, le colline si spostano.', en: 'The spikes stay where they are; the hills move.' },
      },
      {
        text: { it: 'Questa testa è un modello fisico: il suono è calcolato dalla pressione dell’aria in un tubo che cambia forma. Provalo con le mani.', en: 'This head is a physical model: the sound is computed from the air pressure in a tube that changes shape. Try it with your hands.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        guide: { handle: 'tongue', text: { it: 'Trascina la lingua', en: 'Drag the tongue' } },
        look: { it: 'Mentre trascini la voce suona; quando ti fermi, tace dopo un respiro.', en: 'While you drag, the voice sounds; when you stop, it rests after a breath.' },
      },
    ],
  },
  {
    title: { it: 'Onde, armoniche, spettro', en: 'Waves, harmonics, spectrum' },
    steps: [
      {
        text: { it: 'Il suono è fatto di piccole, rapidissime variazioni della pressione dell’aria. In una vocale la stessa forma si ripete più di cento volte al secondo.', en: 'Sound is tiny, fast changes in air pressure. In a vowel the same shape repeats over a hundred times a second.' },
        view: 'scope', setup: () => { clean(); pose('a', 110); },
        try: [{ label: { it: 'Una «a» a 110 Hz', en: 'An “ah” at 110 Hz' }, run: () => vowel('a', 110) }],
        look: { it: 'Ogni ripetizione della forma è un battito delle corde vocali: 110 al secondo.', en: 'Each repeat of the shape is one beat of the vocal folds: 110 a second.' },
      },
      {
        text: { it: 'Ogni forma che si ripete è una somma di sinusoidi: la fondamentale F0, e le armoniche a 2, 3, 4… volte F0. Lo spettro mostra quanto è forte ciascuna.', en: 'Any repeating shape is a sum of sine waves: the fundamental F0, and the harmonics at 2, 3, 4… times F0. The spectrum shows how strong each one is.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 110); spectrum({ envelope: false }); },
        try: [{ label: { it: 'Una «a» a 110 Hz', en: 'An “ah” at 110 Hz' }, run: () => vowel('a', 110) }],
        look: { it: 'Una fila di righe equidistanti, a 110 Hz l’una dall’altra.', en: 'A row of evenly spaced spikes, 110 Hz apart.' },
        numbers: harmonicNumbers,
      },
      {
        text: { it: 'Raddoppia la nota: che cosa succede alle righe?', en: 'Double the pitch: what happens to the spikes?' },
        view: 'spectrum', setup: () => { clean(); pose('a', 110); spectrum({ envelope: false }); },
        try: [
          { label: { it: '110 Hz', en: '110 Hz' }, run: () => vowel('a', 110) },
          { label: { it: '220 Hz', en: '220 Hz' }, run: () => vowel('a', 220) },
        ],
        look: { it: 'Conta le righe sotto 1 kHz, prima e dopo.', en: 'Count the spikes below 1 kHz, before and after.' },
        why: { it: 'Le armoniche stanno sempre a multipli esatti della fondamentale: a 110 Hz sotto 1 kHz ce ne sono 9, a 220 Hz ne restano 4. Raddoppiare la frequenza è salire di un’ottava: le righe si allontanano del doppio, ma senti ancora una «a», perché il filtro non è cambiato.', en: 'The harmonics always sit at exact multiples of the fundamental: at 110 Hz there are 9 below 1 kHz, at 220 Hz only 4 are left. Doubling the frequency is going up an octave: the spikes move twice as far apart, but you still hear an “ah”, because the filter has not changed.' },
        numbers: harmonicNumbers,
      },
    ],
  },
  {
    title: { it: 'La sorgente: le corde vocali', en: 'The source: the vocal folds' },
    steps: [
      {
        text: { it: 'Nella laringe ci sono due piccole pieghe. L’aria dei polmoni le apre, la loro elasticità le richiude: apri, chiudi, apri, chiudi.', en: 'In the larynx sit two small folds. Lung air pushes them apart, their elasticity pulls them back: open, close, open, close.' },
        view: 'glottis', setup: () => { clean(); pose('a', 110); },
        try: [{ label: { it: 'Fai vibrare le corde', en: 'Make the folds vibrate' }, run: () => vowel('a', 110) }],
        look: { it: 'Le corde al rallentatore: ogni apertura lascia uscire uno sbuffo d’aria.', en: 'The folds in slow motion: each opening lets out a puff of air.' },
      },
      {
        text: { it: 'Una fila rapida di sbuffi è il ronzio. Eccolo da solo, senza gola e bocca.', en: 'A fast train of puffs is the buzz. Here it is alone, without the throat and the mouth.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 110); spectrum({ envelope: false }); },
        try: [
          { label: { it: 'Il ronzio da solo', en: 'The buzz alone' }, run: () => { set((p) => { p.bypassTract = true; }); vowel('a', 110); } },
          { label: { it: 'Con il filtro', en: 'With the filter' }, run: () => { set((p) => { p.bypassTract = false; }); vowel('a', 110); } },
        ],
        look: { it: 'Da solo le righe calano piano verso l’alto, senza colline: nessuna vocale.', en: 'Alone, the spikes fall off smoothly, with no hills: no vowel.' },
      },
      {
        text: { it: 'Tendi le corde e vibrano più in fretta: la nota sale e tutte le armoniche la seguono.', en: 'Stretch the folds and they vibrate faster: the pitch rises and every harmonic follows.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 100); spectrum(); },
        try: [{ label: { it: 'Da 100 a 220 Hz', en: 'From 100 to 220 Hz' }, run: () => { vowel('a', 100); glide(100, 220, 2); } }],
        look: { it: 'Le righe si allargano a ventaglio mentre la nota sale.', en: 'The spikes fan out as the pitch rises.' },
      },
      {
        text: { it: 'Voce pressata o soffiata: la stessa nota, un altro colore del ronzio.', en: 'Pressed or breathy voice: the same note, another color of the buzz.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 110); spectrum({ envelope: false }); },
        try: [
          { label: { it: 'Pressata', en: 'Pressed' }, run: () => { clean(); set(preset('pressed').apply); vowel('a', 110); } },
          { label: { it: 'Soffiata', en: 'Breathy' }, run: () => { clean(); set(preset('breathy').apply); vowel('a', 110); } },
        ],
        look: { it: 'Confronta le armoniche alte, sopra i 2 kHz.', en: 'Compare the high harmonics, above 2 kHz.' },
        why: { it: 'Nella voce pressata le corde si chiudono in fretta: ogni sbuffo finisce di colpo, e una fine brusca mette energia nelle armoniche alte. Nella voce soffiata si chiudono piano e mai del tutto: domina la prima armonica, le alte si spengono e l’aria che sfugge aggiunge un fruscio.', en: 'In a pressed voice the folds close fast: each puff ends abruptly, and an abrupt end puts energy into the high harmonics. In a breathy voice they close gently and never fully: the first harmonic dominates, the high ones fade, and the leaking air adds a hiss.' },
        numbers: sourceNumbers,
      },
      {
        text: { it: 'Parlando la nota non sta mai ferma: è l’intonazione. Suonata col solo ronzio si segue la melodia, ma non ci sono parole.', en: 'When we talk the pitch never stays still: that is intonation. Played on the buzz alone you can follow the tune, but there are no words.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 110); },
        tool: { tab: 'melody' },
        look: { it: 'Suona la melodia qui sotto e guarda le righe salire e scendere.', en: 'Play the melody below and watch the stripes rise and fall.' },
      },
    ],
  },
  {
    title: { it: 'Il filtro: gola, bocca e naso', en: 'The filter: throat, mouth and nose' },
    steps: [
      {
        text: { it: 'Sopra la laringe il suono attraversa la gola e la bocca: un tubo d’aria. Come ogni tubo, risuona.', en: 'Above the larynx the sound passes through the throat and the mouth: a tube of air. Like any tube, it resonates.' },
        view: 'tube', setup: () => { clean(); pose('ə', 110); store.setUi({ standing: 1 }); },
        try: [{ label: { it: 'Soffia nel tubo', en: 'Blow through the tube' }, run: () => vowel('ə', 110) }],
        look: { it: 'Le onde che stanno nel tubo: le sue risonanze.', en: 'The waves that fit in the tube: its resonances.' },
      },
      {
        text: { it: 'Le risonanze sono le formanti: i picchi della curva che passa per le punte delle armoniche. F1, F2, F3.', en: 'The resonances are the formants: the peaks of the curve through the tips of the harmonics. F1, F2, F3.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        try: [{ label: { it: 'Una «a»', en: 'An “ah”' }, run: () => vowel('a', 120) }],
        look: { it: 'F1, F2 e F3 sono segnate sui picchi della curva.', en: 'F1, F2 and F3 are marked on the peaks of the curve.' },
        numbers: formantNumbers,
      },
      {
        text: { it: 'Le formanti distinguono le vocali. Apri la mascella: che cosa fa F1?', en: 'The formants tell vowels apart. Open the jaw: what does F1 do?' },
        view: 'chart', setup: () => { clean(); pose('ə', 120); set((p) => { p.articulators.jaw = 0.1; }); },
        guide: { handle: 'jaw', text: { it: 'Apri la mascella', en: 'Open the jaw' } },
        try: [
          { label: { it: 'Mascella quasi chiusa', en: 'Jaw nearly closed' }, run: () => { pose('ə', 120); set((p) => { p.articulators.jaw = 0.1; p.phonate = true; }); } },
          { label: { it: 'Mascella aperta', en: 'Jaw open' }, run: () => set((p) => { p.articulators.jaw = 0.9; p.phonate = true; }) },
        ],
        look: { it: 'Segui il punto giallo sulla mappa: in verticale c’è F1.', en: 'Follow the yellow dot on the map: F1 is the vertical axis.' },
        why: { it: 'Aprendo la mascella la bocca si allarga davanti e la gola si stringe dietro: F1 sale, qui da circa 420 a 620 Hz. In breve, F1 dice quanto è aperta la bocca.', en: 'Opening the jaw widens the mouth in front and narrows the throat behind: F1 goes up, here from about 420 to 620 Hz. Put simply, F1 tells how open the mouth is.' },
        numbers: formantNumbers,
      },
      {
        text: { it: 'Ora la lingua, avanti e indietro: F2 la segue.', en: 'Now the tongue, forward and back: F2 follows it.' },
        view: 'chart', setup: () => { clean(); pose('i', 120); },
        guide: { handle: 'tongue', text: { it: 'Porta la lingua indietro', en: 'Pull the tongue back' } },
        try: [
          { label: { it: '«i»', en: '“ee”' }, run: () => vowel('i', 120) },
          { label: { it: '«u»', en: '“oo”' }, run: () => vowel('u', 120) },
        ],
        look: { it: 'Il punto si sposta in orizzontale: F2 è l’asse orizzontale.', en: 'The dot moves sideways: F2 is the horizontal axis.' },
        why: { it: 'F2 dice quanto è avanti la lingua: alta nella «i», con la lingua contro il palato, bassa nella «u», con la lingua indietro e le labbra arrotondate.', en: 'F2 tells how far forward the tongue is: high in “ee”, with the tongue up against the palate, low in “oo”, with the tongue back and the lips rounded.' },
        numbers: formantNumbers,
      },
      {
        text: { it: 'Arrotonda le labbra su una «i»: il tubo si allunga e la sua uscita si stringe.', en: 'Round your lips on an “ee”: the tube gets longer and its exit narrower.' },
        view: 'spectrum', setup: () => { clean(); pose('i', 120); spectrum(); },
        guide: { handle: 'lips', text: { it: 'Arrotonda le labbra', en: 'Round the lips' } },
        try: [
          { label: { it: '«i» con le labbra distese', en: '“ee” with spread lips' }, run: () => vowel('i', 120) },
          { label: { it: 'Labbra arrotondate', en: 'Lips rounded' }, run: () => set((p) => { p.articulators.lipRound = 1; p.articulators.lipProtrude = 1; p.articulators.lipOpen = 0.05; p.phonate = true; }) },
        ],
        look: { it: 'F2 e F3 scendono, e il suono si scurisce.', en: 'F2 and F3 come down, and the sound darkens.' },
        why: { it: 'Labbra arrotondate e in avanti allungano il tubo: tutte le risonanze scendono, F2 e F3 più di tutte (qui F2 da 2260 a circa 1950 Hz). Lingua di «i» e labbra di «u»: è la «u» francese, la «ü» tedesca.', en: 'Rounded, forward lips lengthen the tube: every resonance goes down, F2 and F3 most (here F2 from 2260 to about 1950 Hz). An “ee” tongue with “oo” lips: the French “u”, the German “ü”.' },
        numbers: formantNumbers,
      },
      {
        text: { it: 'Una parte del filtro è della persona: un bambino ha un tratto più corto, e tutte le sue formanti sono più alte.', en: 'Part of the filter belongs to the person: a child has a shorter tract, so all of its formants are higher.' },
        view: 'spectrum', setup: () => { clean(); pose('a'); spectrum(); },
        try: [
          { label: { it: 'Un uomo', en: 'A man' }, run: () => { set(preset('man').apply); vowel('a'); } },
          { label: { it: 'Un bambino', en: 'A child' }, run: () => { set(preset('child').apply); vowel('a'); } },
        ],
        look: { it: 'La stessa vocale: tutte le colline si spostano in alto.', en: 'The same vowel: every hill moves up.' },
        numbers: formantNumbers,
      },
    ],
  },
  {
    title: { it: 'Due manopole indipendenti', en: 'Two independent knobs' },
    steps: [
      {
        text: { it: 'Tieni fermo il filtro e alza la nota: le armoniche scorrono sotto le stesse colline.', en: 'Keep the filter still and raise the pitch: the harmonics slide under the same hills.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 110); spectrum(); },
        try: [{ label: { it: 'Alza la nota', en: 'Raise the pitch' }, run: () => { vowel('a', 110); glide(110, 260, 2.5); } }],
        look: { it: 'La curva resta ferma, le righe scivolano sotto di lei.', en: 'The curve stays put; the spikes slide under it.' },
      },
      {
        text: { it: 'Tieni ferma la nota e cambia il filtro: stessa nota, altra vocale.', en: 'Keep the pitch still and change the filter: same note, another vowel.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 150); spectrum(); },
        try: [{ label: { it: 'Da «a» a «i»', en: 'From “ah” to “ee”' }, run: () => { vowel('a', 150); later(900, () => phoneme('i')); } }],
        look: { it: 'Le righe restano, la curva cambia forma.', en: 'The spikes stay; the curve changes shape.' },
      },
      {
        text: { it: 'Per questo puoi cantare più in alto e suonare ancora come te: melodia e colore sono due manopole diverse. Confrontale una accanto all’altra.', en: 'That is why you can sing higher and still sound like yourself: melody and color are two different knobs. Compare them side by side.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        tool: { tab: 'ab', ab: 'pitch' },
        look: { it: 'Suona A e B qui sotto e confronta i loro spettri.', en: 'Play A and B below and compare their spectra.' },
      },
    ],
  },
  {
    title: { it: 'Il fruscio', en: 'The hiss' },
    steps: [
      {
        text: { it: 'Non tutti i suoni vengono dalle corde. Per la «s» l’aria passa per una fessura stretta e sbatte sui denti: turbolenza, un fruscio.', en: 'Not every sound comes from the folds. For “s” the air is squeezed through a narrow gap and hits the teeth: turbulence, a hiss.' },
        view: 'spectrum', setup: () => { clean(); pose('s'); spectrum(); },
        try: [{ label: { it: 'Una «s»', en: 'An “s”' }, run: () => phoneme('s') }],
        look: { it: 'Una collina larga sopra i 4 kHz, e nessuna riga: il rumore non ha armoniche.', en: 'A broad hill above 4 kHz, and no spikes: noise has no harmonics.' },
      },
      {
        text: { it: 'Perché la «sc» di «scena» fruscia più in basso della «s»?', en: 'Why does “sh” hiss lower than “s”?' },
        view: 'spectrum', setup: () => { clean(); pose('s'); spectrum(); },
        try: [
          { label: { it: '«s»', en: '“s”' }, run: () => phoneme('s') },
          { label: { it: '«sc» (ʃ)', en: '“sh” (ʃ)' }, run: () => phoneme('ʃ') },
          { label: { it: '«f»', en: '“f”' }, run: () => phoneme('f') },
        ],
        look: { it: 'Dove il fruscio è più forte; e lingua e labbra nella testa.', en: 'Where the hiss is strongest; and the tongue and the lips on the head.' },
        why: { it: 'Il getto sbatte sugli incisivi e il fruscio prende colore dalla cavità tra la lingua e le labbra. Nella «sc» la lingua sta più indietro e le labbra si arrotondano: la cavità è più lunga e risuona più in basso, verso 3 kHz invece dei 4,5 della «s». La «f» fruscia tra labbro e denti, senza cavità davanti: piatta e debole.', en: 'The jet hits the incisors and the hiss takes its color from the cavity between the tongue and the lips. For “sh” the tongue sits further back and the lips round: the cavity is longer and resonates lower, near 3 kHz instead of the 4.5 kHz of “s”. “f” hisses between lip and teeth, with no cavity in front: flat and weak.' },
        numbers: () => ({ it: 'in questo modello: «s» picco 4,5 kHz, baricentro 6,2 kHz; «sc» picco 3,1 kHz, baricentro 4,0 kHz. Parlanti veri (Jongman e coll. 2000): baricentro della «s» circa 6 kHz, della «sc» circa 4', en: 'in this model: “s” peak 4.5 kHz, centroid 6.2 kHz; “sh” peak 3.1 kHz, centroid 4.0 kHz. Real speakers (Jongman et al. 2000): “s” centroid about 6 kHz, “sh” about 4' }),
      },
      {
        text: { it: 'Il fruscio si mescola anche alla voce: in una voce soffiata l’aria scappa tra le corde.', en: 'Noise mixes into the voice too: in a breathy voice air leaks between the folds.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 110); spectrum({ envelope: false }); },
        try: [
          { label: { it: 'Voce normale', en: 'Modal voice' }, run: () => { clean(); vowel('a', 110); } },
          { label: { it: 'Voce soffiata', en: 'Breathy voice' }, run: () => { clean(); set(preset('breathy').apply); vowel('a', 110); } },
        ],
        look: { it: 'Un fruscio leggero riempie gli spazi tra le armoniche.', en: 'A soft hiss fills the gaps between the harmonics.' },
      },
      {
        text: { it: 'E non è costante: pulsa a ogni battito delle corde, più forte quando sono aperte.', en: 'And it is not steady: it pulses with each beat of the folds, strongest while they are open.' },
        view: 'scope', setup: () => { clean(); pose('a', 110); },
        tool: { tab: 'ab', ab: 'pulse' },
        look: { it: 'Suona A e B qui sotto: nell’onda il fruscio pulsato arriva a ondate.', en: 'Play A and B below: in the waveform the pulsed hiss comes in bursts.' },
      },
    ],
  },
  {
    title: { it: 'Le consonanti: chiudere e riaprire il tubo', en: 'Consonants: closing and opening the tube' },
    steps: [
      {
        text: { it: 'Chiudi il tubo del tutto e l’aria si accumula dietro; riaprilo di colpo e scappa in un piccolo scoppio: un’occlusiva, come p, t, k.', en: 'Close the tube completely and the air piles up behind it; open it suddenly and it escapes in a small burst: a stop, like p, t, k.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [{ label: { it: '«papà» e «babbo»', en: '“pop” and “Bob”' }, run: () => void sayTwo(() => sayL({ it: 'papà', en: 'pop' }), () => sayL({ it: 'babbo', en: 'Bob' })) }],
        look: { it: 'Lo scoppio è una riga verticale sottile; il buco prima è la chiusura.', en: 'The burst is a thin vertical line; the gap before it is the closure.' },
      },
      {
        text: { it: 'Conta dove si chiude: le labbra, la punta della lingua, il dorso.', en: 'It matters where it closes: the lips, the tip of the tongue, the back of the tongue.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [{ label: { it: '«pa ta ca»', en: '“pa ta ka”' }, run: () => void sayL({ it: 'pa ta ca', en: 'pa ta ka' }) }],
        look: { it: 'Ogni scoppio ha il suo colore: dove cade la sua energia.', en: 'Each burst has its own color: where its energy falls.' },
      },
      {
        text: { it: 'Chiudi le labbra e continua a dare voce: dove va l’aria?', en: 'Close the lips and keep voicing: where does the air go?' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        guide: { handle: 'lips', text: { it: 'Chiudi le labbra', en: 'Close the lips' } },
        try: [
          { label: { it: '«a»', en: '“ah”' }, run: () => vowel('a', 120) },
          { label: { it: '«b»', en: '“b”' }, run: () => phoneme('b') },
        ],
        look: { it: 'L’indicatore «ronzio» sotto la testa si spegne in pochi decimi di secondo.', en: 'The “buzz” meter under the head fades within a few tenths of a second.' },
        why: { it: 'Con le labbra chiuse la bocca si riempie: in circa due decimi di secondo la pressione arriva a quella dei polmoni, e le corde si fermano perché non resta una differenza di pressione a spingerle. Per questo una «b» vera dura poco.', en: 'With the lips shut the mouth fills up: in about two tenths of a second its pressure reaches the lung pressure, and the folds stop because no pressure difference is left to drive them. That is why a real “b” is short.' },
        numbers: airNumbers,
      },
      {
        text: { it: 'La «t» inglese e quella italiana: conta quando riparte il ronzio.', en: 'The English and the Italian “t”: it matters when the buzz comes back.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [
          { label: { it: '«top» in inglese', en: 'English “top”' }, run: () => void say('top', 'en') },
          { label: { it: '«topo» in italiano', en: 'Italian “topo”' }, run: () => void say('topo', 'it') },
        ],
        look: { it: 'Dopo lo scoppio: una macchia di fruscio prima che tornino le righe delle armoniche?', en: 'After the burst: a patch of hiss before the stripes of the harmonics come back?' },
        why: { it: 'In inglese le corde restano aperte ancora un po’: per 60-80 millisecondi esce solo aria, poi riparte la voce. In italiano si accostano subito e la voce riparte dopo 10-30 millisecondi. È il tempo di attacco della voce (VOT), e da solo basta a far sembrare straniero un accento.', en: 'In English the folds stay apart for a moment: for 60-80 milliseconds only air comes out, then the voice returns. In Italian they come together at once and the voice returns after 10-30 milliseconds. This is the voice onset time (VOT), and on its own it can make an accent sound foreign.' },
        numbers: () => ({ it: 'in questo modello: «t» inglese 77 ms; italiane «p» 12, «t» 21, «c» 25 ms. Parlanti veri: «t» inglese circa 70 ms (Lisker e Abramson 1964); in italiano sotto i 30 ms circa, la «c» più lunga', en: 'in this model: English “t” 77 ms; Italian “p” 12, “t” 21, “k” 25 ms. Real speakers: English “t” about 70 ms (Lisker & Abramson 1964); Italian under about 30 ms, the “k” longest' }),
      },
    ],
  },
  {
    title: { it: 'Il naso: una porta e due strade', en: 'The nose: a door and two passages' },
    steps: [
      {
        text: { it: 'Dietro il palato c’è il velo, una porta verso il naso. Abbassalo e chiudi le labbra: una «m».', en: 'Behind the palate sits the velum, a door to the nose. Lower it and close the lips: an “m”.' },
        view: 'spectrum', setup: () => { clean(); pose('m'); spectrum(); },
        try: [{ label: { it: 'Ronza una «m»', en: 'Hum an “m”' }, run: () => phoneme('m') }],
        look: { it: 'Un ronzio basso e smorzato: un picco forte in basso, poco sopra.', en: 'A low, muffled hum: one strong low peak, little above it.' },
      },
      {
        text: { it: 'Un tubo con una diramazione inghiotte il suono ad alcune frequenze: le valli, le antirisonanze.', en: 'A tube with a side branch swallows the sound at some frequencies: the valleys, the antiresonances.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        guide: { handle: 'velum', text: { it: 'Abbassa il velo', en: 'Lower the velum' } },
        try: [
          { label: { it: '«a»', en: '“ah”' }, run: () => vowel('a', 120) },
          { label: { it: '«a» nasale', en: 'Nasal “ah”' }, run: () => set((p) => { p.articulators.velum = 0.7; p.phonate = true; }) },
        ],
        look: { it: 'Con il velo giù si apre una valle nella curva.', en: 'With the velum down a valley opens in the curve.' },
        numbers: peakNumbers,
      },
      {
        text: { it: 'Tappa il naso mentre ronzi una «m»: l’aria non ha più uscita.', en: 'Pinch the nose while humming an “m”: the air has no way out.' },
        view: 'spectrum', setup: () => { clean(); pose('m'); spectrum(); },
        try: [
          { label: { it: 'Ronza una «m»', en: 'Hum an “m”' }, run: () => phoneme('m') },
          { label: { it: 'Tappa il naso', en: 'Pinch the nose' }, run: () => set((p) => { p.anatomy.nostrilLeft = 0; p.anatomy.nostrilRight = 0; p.phonate = true; }) },
        ],
        look: { it: 'L’indicatore «ronzio» si spegne.', en: 'The “buzz” meter dies.' },
        why: { it: 'Labbra chiuse e naso tappato: in una frazione di secondo la pressione in bocca arriva a quella dei polmoni e le corde si fermano. Prova su di te: ronza e tappati il naso. Per questo con il raffreddore «mamma» diventa quasi «babba».', en: 'Lips closed and nose pinched: within a fraction of a second the mouth pressure reaches the lung pressure and the folds stop. Try it yourself: hum and pinch your nose. That is why with a cold “mommy” turns into something like “bobby”.' },
        numbers: airNumbers,
      },
      {
        text: { it: 'Il naso ha due fosse, quasi mai uguali: ogni poche ore un lato si gonfia e l’altro si sgonfia, il ciclo nasale.', en: 'The nose has two passages, almost never equal: every few hours one side swells while the other shrinks, the nasal cycle.' },
        view: 'spectrum', setup: () => { clean(); pose('m'); spectrum(); },
        try: [
          { label: { it: 'Fosse uguali', en: 'Equal passages' }, run: () => { clean(); phoneme('m'); } },
          { label: { it: 'Lato sinistro congestionato', en: 'Left side congested' }, run: () => set((p) => { p.anatomy.nasalCycle = -0.7; p.anatomy.nostrilLeft = 1; p.phonate = true; }) },
        ],
        look: { it: 'Con le fosse diverse compare un picco nuovo verso 2,2 kHz, con la sua valle.', en: 'With unequal passages a new peak appears near 2.2 kHz, with its valley.' },
        why: { it: 'Due strade di larghezza diversa interferiscono: a certe frequenze le onde arrivano alle narici in fase e si sommano, ad altre in controfase e si cancellano. L’orecchio lo nota appena, ma è uno dei motivi per cui ogni naso suona un po’ diverso.', en: 'Two paths of different width interfere: at some frequencies the waves reach the nostrils in step and add up, at others out of step and cancel. The ear barely notices, but it is one reason why every nose sounds a little different.' },
        numbers: peakNumbers,
      },
      {
        text: { it: 'Nelle parole il velo si apre e si chiude in un attimo.', en: 'In words the velum opens and closes in a moment.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [{ label: { it: '«la mamma e la nonna»', en: '“many men and women”' }, run: () => void sayL({ it: 'la mamma e la nonna', en: 'many men and women' }) }],
        look: { it: 'Le nasali sono i tratti più scuri, con una banda bassa.', en: 'The nasals are the darker stretches, with a low band.' },
      },
    ],
  },
  {
    title: { it: 'Tratti veri, misurati', en: 'Real tracts, measured' },
    steps: [
      {
        text: { it: 'Come si conosce un tratto vocale vero? Con la risonanza magnetica: fetta dopo fetta, l’area del passaggio d’aria dalla laringe alle labbra.', en: 'How do we know a real vocal tract? With magnetic resonance imaging: slice by slice, the area of the air passage from the larynx to the lips.' },
        view: 'tube', setup: () => { clean(); pose('a', 120); },
        try: [
          { label: { it: 'La «i» misurata', en: 'The measured “ee”' }, run: () => mri('i') },
          { label: { it: 'La «ɑ» misurata', en: 'The measured “ɑ”' }, run: () => mri('ɑ') },
          { label: { it: 'La «u» misurata', en: 'The measured “oo”' }, run: () => mri('u') },
        ],
        look: { it: 'Il profilo dalla gola (a sinistra) alle labbra (a destra). Sono 11 vocali di un uomo (Story 2008).', en: 'The profile from the throat (left) to the lips (right). These are 11 vowels of one man (Story 2008).' },
        numbers: formantNumbers,
      },
      {
        text: { it: 'La testa è stata adattata a queste forme. La stessa vocale, due forme:', en: 'The head was fitted to these shapes. The same vowel, two shapes:' },
        view: 'tube', setup: () => { clean(); pose('ɑ', 120); },
        try: [
          { label: { it: 'La «ɑ» misurata', en: 'The measured “ɑ”' }, run: () => mri('ɑ') },
          { label: { it: 'La «ɑ» della testa', en: 'The head’s “ɑ”' }, run: () => { clean(); vowel('ɑ', 120); } },
        ],
        look: { it: 'Confronta i due profili.', en: 'Compare the two profiles.' },
        why: { it: 'Le forme si somigliano ma non sono uguali: la testa è un disegno con 13 comandi, la scansione una persona vera. F1 quasi coincide; F2 e F3 no, perché le vocali della testa sono accordate sulle medie di tanti uomini (Peterson e Barney 1952).', en: 'The shapes are alike but not the same: the head is a drawing with 13 controls, the scan a real person. F1 nearly agrees; F2 and F3 do not, because the head’s vowels are tuned to the averages of many men (Peterson & Barney 1952).' },
        numbers: formantNumbers,
      },
      {
        text: { it: 'La testa costruisce ogni fetta in tre dimensioni: la volta del palato, i denti ai lati, il solco della lingua.', en: 'The head builds every slice in three dimensions: the vault of the palate, the teeth at the sides, the groove of the tongue.' },
        view: 'tract3d', setup: () => { clean(); pose('a', 120); },
        try: [{ label: { it: 'Una «a»', en: 'An “ah”' }, run: () => vowel('a', 120) }],
        look: { it: 'Trascina per girarla, usa la rotella per avvicinarti.', en: 'Drag to turn it, scroll to zoom.' },
      },
      {
        text: { it: 'Nella «l» la punta chiude solo il mezzo: l’aria passa ai due lati della lingua.', en: 'In an “l” the tip closes only the middle: the air flows past both sides of the tongue.' },
        view: 'tract3d', setup: () => { clean(); pose('l'); },
        try: [
          { label: { it: 'Una «l»', en: 'An “l”' }, run: () => phoneme('l') },
          { label: { it: 'Una «n»', en: 'An “n”' }, run: () => phoneme('n') },
        ],
        look: { it: 'Di fronte o dall’alto: due canali d’aria accanto alla linea chiusa.', en: 'From the front or the top: two air channels beside the closed midline.' },
        why: { it: 'I margini della lingua si stringono e si abbassano, e l’aria passa ai lati come l’acqua attorno a un sasso. Dietro il contatto resta una sacca chiusa che inghiotte il suono tra 3 e 4 kHz. Nella «n» i lati restano sigillati e l’aria sale nel naso.', en: 'The margins of the tongue draw in and drop, and the air flows past the sides like water round a stone. Behind the contact a closed pocket is left, which swallows the sound between 3 and 4 kHz. In an “n” the sides stay sealed and the air goes up through the nose.' },
        numbers: lateralNumbers,
      },
      {
        text: { it: 'Ai lati della laringe pendono due tasche cieche, i seni piriformi: inghiottono il suono verso 4,5 kHz.', en: 'Beside the larynx hang two blind pouches, the piriform fossae: they swallow the sound near 4.5 kHz.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        try: [
          { label: { it: 'Seni vuoti', en: 'Empty fossae' }, run: () => { set((p) => { p.anatomy.piriform = 1; }); vowel('a', 120); } },
          { label: { it: 'Pieni d’acqua a metà', en: 'Half full of water' }, run: () => set((p) => { p.anatomy.piriform = 0.5; p.phonate = true; }) },
        ],
        look: { it: 'Passa a 0–10 kHz: la valle verso 4,5 kHz, con l’acqua, salta verso 8 kHz.', en: 'Switch to 0–10 kHz: the valley near 4.5 kHz jumps to near 8 kHz with water.' },
        why: { it: 'Ogni seno è un tubetto chiuso in fondo, profondo circa 2 cm: inghiotte il suono dove un quarto della lunghezza d’onda ci sta dentro. Con l’acqua la colonna d’aria si dimezza e la valle sale. Dang e Honda (1997) lo hanno fatto davvero, su persone vere.', en: 'Each fossa is a little tube closed at the bottom, about 2 cm deep: it swallows the sound where a quarter of the wavelength fits inside. With water the air column is halved and the valley climbs. Dang and Honda (1997) did this for real, on real speakers.' },
        numbers: piriformNumbers,
      },
    ],
  },
  {
    title: { it: 'Lo spettrogramma', en: 'The spectrogram' },
    steps: [
      {
        text: { it: 'Per vedere il suono nel tempo lo si taglia in fette brevi, si prende lo spettro di ognuna e le si mette in fila: il tempo va a destra, la frequenza in alto.', en: 'To see sound over time, cut it into short slices, take the spectrum of each and line them up: time runs to the right, frequency goes up.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [{ label: { it: 'Pronuncia una frase', en: 'Speak a sentence' }, run: () => void sayL({ it: 'la voce è fatta di aria', en: 'a buzz, a hiss and a filter' }) }],
        look: { it: 'Righe sottili: le armoniche. Bande chiare: le formanti. Macchie sfocate: il rumore.', en: 'Thin stripes: the harmonics. Bright bands: the formants. Fuzzy patches: the noise.' },
      },
      {
        text: { it: 'Fette lunghe separano le armoniche ma sfocano gli eventi rapidi; fette corte colgono ogni battito ma fondono le armoniche.', en: 'Long slices separate the harmonics but blur fast events; short slices catch every beat but merge the harmonics.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 40 }); },
        try: [
          { label: { it: 'Fette lunghe (40 ms)', en: 'Long slices (40 ms)' }, run: () => { store.setUi({ specWindow: 40, mel: false }); void sayL({ it: 'sasso', en: 'a hiss' }); } },
          { label: { it: 'Fette corte (4 ms)', en: 'Short slices (4 ms)' }, run: () => { store.setUi({ specWindow: 4, mel: false }); void sayL({ it: 'sasso', en: 'a hiss' }); } },
        ],
        look: { it: 'Con le fette corte compaiono strisce verticali: una per ogni battito delle corde.', en: 'With short slices vertical striations appear: one per beat of the folds.' },
      },
      {
        text: { it: 'Lo spettrogramma mel piega le frequenze come l’orecchio: 80 bande, in scala logaritmica. È quello che leggono le voci sintetiche.', en: 'The mel spectrogram bends frequency like the ear: 80 bands, on a log scale. It is what machine voices read.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ specWindow: 25, mel: true }); },
        try: [{ label: { it: 'Log-mel, 80 bande', en: 'Log-mel, 80 bands' }, run: () => { store.setUi({ specWindow: 25, mel: true }); void sayL({ it: 'un ronzio e un fruscio', en: 'a buzz and a hiss' }); } }],
        look: { it: 'In basso le bande sono strette, in alto larghe: come nell’orecchio.', en: 'The bands are narrow at the bottom and wide at the top: as in the ear.' },
      },
    ],
  },
  {
    title: { it: 'Dai suoni alle frasi', en: 'From sounds to sentences' },
    steps: [
      {
        text: { it: 'Parlare non è infilare suoni: lingua e labbra sono sempre in viaggio, e ogni suono prende un po’ del colore dei vicini. Senza questo, la voce è un robot.', en: 'Speech is not a string of sounds: the tongue and the lips are always travelling, and every sound takes some color from its neighbours. Without it, the voice is a robot.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [
          { label: { it: 'Con tutti gli ingredienti', en: 'With every ingredient' }, run: () => void sayWithout(SENTENCE, {}) },
          { label: { it: 'Da robot', en: 'Robot style' }, run: () => void sayWithout(SENTENCE, NO_NATURAL) },
        ],
        look: { it: 'Ascolta i passaggi tra un suono e l’altro.', en: 'Listen to the joins between the sounds.' },
      },
      {
        text: { it: 'Quale ingrediente manca di più? Toglili uno alla volta.', en: 'Which ingredient do you miss most? Take them away one at a time.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [
          { label: { it: 'Senza melodia', en: 'No melody' }, run: () => void sayWithout(SENTENCE, { intonation: false, micro: false }) },
          { label: { it: 'Senza tempi', en: 'No timing' }, run: () => void sayWithout(SENTENCE, { timing: false }) },
          { label: { it: 'Senza coarticolazione', en: 'No coarticulation' }, run: () => void sayWithout(SENTENCE, { coarticulation: false }) },
        ],
        look: { it: 'Che cosa suona meccanico ogni volta?', en: 'What sounds mechanical each time?' },
        why: { it: 'Di solito manca subito la melodia: su una nota piatta anche suoni perfetti sembrano di un robot. Senza coarticolazione i passaggi saltano; senza i tempi tutto dura uguale, come un metronomo. La naturalezza è la loro somma.', en: 'Most people miss the melody first: on a flat pitch even perfect sounds seem robotic. Without coarticulation the joins jump; without the timing everything lasts the same, like a metronome. Naturalness is their sum.' },
      },
      {
        text: { it: 'Anche i tempi portano significato: quanto dura una vocale?', en: 'Timing carries meaning too: how long does a vowel last?' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [
          { label: { it: '«fato»', en: '“bead”' }, run: () => void sayL({ it: 'fato', en: 'bead' }) },
          { label: { it: '«fatto»', en: '“beat”' }, run: () => void sayL({ it: 'fatto', en: 'beat' }) },
        ],
        look: { it: 'La banda di armoniche della prima vocale: più lunga o più corta?', en: 'The band of harmonics of the vowel: longer or shorter?' },
        why: { it: 'In italiano una vocale accentata in sillaba aperta si allunga («fa-to») e davanti a una doppia si accorcia («fat-to»). In inglese una vocale dura di più davanti a una consonante sonora: «bead» più di «beat». L’orecchio usa queste regole senza accorgersene.', en: 'In Italian a stressed vowel in an open syllable stretches (“fa-to”) and shrinks before a double consonant (“fat-to”). In English a vowel lasts longer before a voiced consonant: “bead” more than “beat”. The ear uses such rules without noticing.' },
        numbers: () => ({
          it: `prima vocale: «fato» ${vowelMs('fato', 'it')} ms, «fatto» ${vowelMs('fatto', 'it')} ms; «bead» ${vowelMs('bead', 'en')} ms, «beat» ${vowelMs('beat', 'en')} ms`,
          en: `first vowel: “fato” ${vowelMs('fato', 'it')} ms, “fatto” ${vowelMs('fatto', 'it')} ms; “bead” ${vowelMs('bead', 'en')} ms, “beat” ${vowelMs('beat', 'en')} ms`,
        }),
      },
      {
        text: { it: 'La melodia cala alla fine di un’affermazione e risale in una domanda sì/no.', en: 'The melody falls at the end of a statement and rises in a yes/no question.' },
        view: 'spectrogram', setup: () => { clean(); pose('a', 120); store.setUi({ mel: false, specWindow: 30 }); },
        try: [
          { label: { it: 'Un’affermazione', en: 'A statement' }, run: () => void sayL({ it: 'piove in città oggi.', en: 'it is raining in the city today.' }) },
          { label: { it: 'Una domanda', en: 'A question' }, run: () => void sayL({ it: 'piove in città oggi?', en: 'is it raining in the city today?' }) },
        ],
        look: { it: 'Alla fine della domanda le righe delle armoniche salgono.', en: 'At the end of the question the stripes of the harmonics go up.' },
      },
    ],
  },
  {
    title: { it: 'Una voce sintetica', en: 'A machine voice' },
    steps: [
      {
        text: { it: 'Un piccolo modello vocale, quello del lavoro «Teacher in the Loop», costruisce una voce con gli stessi ingredienti: una melodia, un ronzio, un fruscio e un filtro.', en: 'A small speech model, the one of the “Teacher in the Loop” paper, builds a voice from the same ingredients: a melody, a buzz, a hiss and a filter.' },
        view: 'spectrum', setup: () => { clean(); pose('a', 120); spectrum(); },
        tool: { tab: 'machine' },
        look: { it: 'Qui sotto la parte del ronzio: nove sinusoidi agganciate alla nota, un rumore leggero, un mix. Il resto è un filtro appreso.', en: 'Below, the buzz part: nine sines locked to the pitch, a soft noise, a mix. The rest is a learned filter.' },
      },
    ],
  },
];

const cancelling = (a: TourAction): TourAction => ({ ...a, run: () => { pending?.(); pending = null; a.run(); } });
export const LESSONS: Lesson[] = LESSON_LIST.map((l) => ({ ...l, steps: l.steps.map((s) => ({ ...s, try: s.try?.map(cancelling) })) }));

/**
 * Opens a step: whatever sounds stops, the view and the tool are the step's,
 * and the head takes the step's starting shape without a sound.
 */
export function openStep(s: Step): void {
  pending?.();
  pending = null;
  voice.stop();
  set((p) => { p.phonate = false; });
  store.setUi({ viewTab: s.view, learnTool: s.tool?.tab ?? null });
  s.setup?.();
}

/** Gives the head as it is a breath of voice (the step without sounds of its own). */
export const breath = blow;
