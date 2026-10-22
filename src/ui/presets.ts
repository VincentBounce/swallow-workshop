import { EngineParams, Score, ScoreFrame, DEFAULT_SOURCE, DEFAULT_NOISE } from '../dsp/engine/params';
import { PHONEMES } from '../dsp/speech/phonemes';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS } from '../dsp/tract/types';
import { colourCurve, NoiseColour, NOISE_CURVE_POINTS, noiseCurveFreq } from '../dsp/noise/noise';

type Bi = { it: string; en: string };

export interface Preset { id: string; name: Bi; hint: Bi; apply: (p: EngineParams) => void }

const base = (p: EngineParams) => {
  p.source = { ...DEFAULT_SOURCE };
  p.anatomy = { ...DEFAULT_ANATOMY };
  p.noise = { ...DEFAULT_NOISE, user: p.noise.user };
  p.voicing = true;
  p.abduction = 0;
  p.articulators.larynx = 0;
};

/** Speaker presets: source and anatomy together. */
export const VOICE_PRESETS: Preset[] = [
  { id: 'man', name: { it: 'Uomo', en: 'Man' }, hint: { it: 'tratto di 17,5 cm, circa 110 Hz', en: '17.5 cm tract, about 110 Hz' }, apply: (p) => { base(p); p.source.f0 = 110; } },
  {
    id: 'woman', name: { it: 'Donna', en: 'Woman' }, hint: { it: 'tratto più corto (faringe relativamente più corta), circa 210 Hz, un po’ soffiata', en: 'shorter tract (relatively shorter pharynx), about 210 Hz, a little breathy' },
    apply: (p) => { base(p); p.anatomy.scale = 0.87; p.anatomy.pharynx = 0.86; p.source.f0 = 210; p.source.rd = 1.3; p.source.chink = 0.03; p.source.peakArea = 0.09; },
  },
  {
    id: 'child', name: { it: 'Bambino', en: 'Child' }, hint: { it: 'tratto di circa 12,5 cm, circa 290 Hz', en: 'about 12.5 cm tract, about 290 Hz' },
    apply: (p) => { base(p); p.anatomy.scale = 0.72; p.anatomy.pharynx = 0.8; p.source.f0 = 290; p.source.rd = 1.4; p.source.chink = 0.025; p.source.peakArea = 0.06; },
  },
  {
    id: 'deep', name: { it: 'Profonda', en: 'Deep' }, hint: { it: 'tratto lungo, laringe bassa, faringe ampia, circa 80 Hz', en: 'long tract, low larynx, wide pharynx, about 80 Hz' },
    apply: (p) => { base(p); p.anatomy.scale = 1.08; p.anatomy.pharynx = 1.1; p.anatomy.pharynxWidth = 1.2; p.articulators.larynx = -0.8; p.source.f0 = 80; p.source.rd = 0.85; },
  },
  {
    id: 'whisper', name: { it: 'Sussurro', en: 'Whisper' }, hint: { it: 'corde aperte che non vibrano: solo fruscio filtrato', en: 'open folds that do not vibrate: filtered hiss only' },
    apply: (p) => { base(p); p.voicing = false; p.abduction = 0.42; p.noise.aspiration = 4; },
  },
  {
    id: 'creak', name: { it: 'Cricchiata (vocal fry)', en: 'Creak (vocal fry)' }, hint: { it: 'impulsi lenti e irregolari, cicli alterni', en: 'slow, irregular pulses, alternating cycles' },
    apply: (p) => { base(p); p.source.f0 = 48; p.source.rd = 0.45; p.source.diplophonia = 0.55; p.source.jitter = 5; p.source.shimmer = 10; p.source.ps = 5.5; },
  },
  {
    id: 'breathy', name: { it: 'Soffiata', en: 'Breathy' }, hint: { it: 'le corde non chiudono del tutto: fruscio tra le armoniche', en: 'the folds do not close fully: hiss between the harmonics' },
    apply: (p) => { base(p); p.source.chink = 0.12; p.source.rd = 2.2; },
  },
  {
    id: 'pressed', name: { it: 'Pressata', en: 'Pressed' }, hint: { it: 'chiusura rapida e lunga: più armoniche acute', en: 'fast, long closure: stronger high harmonics' },
    apply: (p) => { base(p); p.source.rd = 0.4; p.source.ps = 11; p.source.chink = 0; },
  },
  {
    id: 'raspy', name: { it: 'Rauca', en: 'Raspy' }, hint: { it: 'corde auto-oscillanti asimmetriche: subarmoniche e irregolarità', en: 'asymmetric self-oscillating folds: subharmonics and roughness' },
    apply: (p) => { base(p); p.source.model = 'twomass'; p.source.asym = 0.4; p.source.ps = 10; p.source.f0 = 120; p.source.chink = 0.02; },
  },
];

/** Persistent, person-specific parts of the filter (timbre). */
export const TIMBRE_PRESETS: Preset[] = [
  { id: 'neutral', name: { it: 'Neutro', en: 'Neutral' }, hint: { it: 'anatomia di riferimento', en: 'reference anatomy' }, apply: (p) => { p.anatomy.pharynxWidth = 1; p.anatomy.nasalLeak = 0; p.articulators.larynx = 0; } },
  { id: 'dark', name: { it: 'Scuro', en: 'Dark' }, hint: { it: 'laringe bassa e faringe ampia: formanti più basse', en: 'low larynx and wide pharynx: lower formants' }, apply: (p) => { p.articulators.larynx = -0.9; p.anatomy.pharynxWidth = 1.3; p.anatomy.nasalLeak = 0; } },
  { id: 'bright', name: { it: 'Chiaro', en: 'Bright' }, hint: { it: 'laringe alta e faringe stretta: formanti più alte', en: 'high larynx and narrow pharynx: higher formants' }, apply: (p) => { p.articulators.larynx = 0.7; p.anatomy.pharynxWidth = 0.75; p.anatomy.nasalLeak = 0; } },
  { id: 'nasal', name: { it: 'Nasale', en: 'Nasal' }, hint: { it: 'il velo lascia passare suono nel naso', en: 'the velum lets sound into the nose' }, apply: (p) => { p.anatomy.nasalLeak = 0.7; } },
  { id: 'warm', name: { it: 'Calda', en: 'Warm' }, hint: { it: 'faringe un po’ ampia, laringe un po’ bassa', en: 'slightly wide pharynx, slightly low larynx' }, apply: (p) => { p.articulators.larynx = -0.4; p.anatomy.pharynxWidth = 1.15; p.anatomy.nasalLeak = 0.1; } },
  { id: 'hollow', name: { it: 'Cava', en: 'Hollow' }, hint: { it: 'faringe molto ampia e labbra un po’ arrotondate', en: 'very wide pharynx and slightly rounded lips' }, apply: (p) => { p.anatomy.pharynxWidth = 1.45; p.articulators.lipRound = Math.max(p.articulators.lipRound, 0.35); p.articulators.lipProtrude = Math.max(p.articulators.lipProtrude, 0.3); } },
];

/** Sets the articulators (and glottal setting) of a phoneme. */
export function applyPhoneme(ipa: string, p: EngineParams): void {
  const ph = PHONEMES[ipa];
  if (!ph) return;
  if (ph.manner === 'vowel') {
    const keepLarynx = p.articulators.larynx;
    p.articulators = { ...DEFAULT_ARTICULATORS, ...ph.art, larynx: keepLarynx };
  } else {
    // consonants: start from a neutral vowel so that the articulators the
    // consonant does not control have a sensible position
    const keepLarynx = p.articulators.larynx;
    p.articulators = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...ph.art, larynx: keepLarynx };
  }
  p.abduction = ph.manner === 'stop' ? 0 : ph.abduction;
  p.phonate = true;
}

/** Noise colour presets for the user noise designer. */
export const NOISE_SHAPES: { id: string; name: Bi; curve: () => number[] }[] = [
  ...(['white', 'pink', 'brown', 'blue', 'violet'] as NoiseColour[]).map((c) => ({
    id: c,
    name: {
      it: { white: 'Bianco', pink: 'Rosa', brown: 'Marrone', blue: 'Blu', violet: 'Viola' }[c],
      en: { white: 'White', pink: 'Pink', brown: 'Brown', blue: 'Blue', violet: 'Violet' }[c],
    },
    curve: () => Array.from(colourCurve(c)),
  })),
  { id: 'sss', name: { it: 'Come una «s»', en: 'Like an “s”' }, curve: () => bandCurve(6000, 1.1, 0, -30) },
  { id: 'shh', name: { it: 'Come «sc»', en: 'Like “sh”' }, curve: () => bandCurve(3000, 1.0, 0, -28) },
  { id: 'fff', name: { it: 'Come una «f» (piatto)', en: 'Like an “f” (flat)' }, curve: () => bandCurve(7000, 3, 0, -12) },
  { id: 'band', name: { it: 'Banda stretta 1 kHz', en: 'Narrow band 1 kHz' }, curve: () => bandCurve(1000, 0.35, 0, -40) },
];

/** A curve with a peak at fc (Hz), bandwidth in octaves, peak and floor levels (dB). */
export function bandCurve(fc: number, octaves: number, peak: number, floor: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < NOISE_CURVE_POINTS; i++) {
    const d = Math.log2(noiseCurveFreq(i) / fc) / octaves;
    out.push(floor + (peak - floor) * Math.exp(-0.5 * d * d * 4));
  }
  return out;
}

/** Score following an F0 contour (melody pad, singing); it has no articulators, so the hands keep the tract. */
export function contourScore(points: { t: number; f0: number }[], ps: number, abduction = 0): Score {
  const frames: ScoreFrame[] = [];
  const dur = points.length ? points[points.length - 1].t : 0;
  const FR = 0.005;
  let j = 0;
  for (let t = 0; t <= dur + 0.3; t += FR) {
    while (j < points.length - 2 && points[j + 1].t <= t) j++;
    const a = points[j], b = points[Math.min(j + 1, points.length - 1)];
    const u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    const f0 = a.f0 > 0 && b.f0 > 0 ? a.f0 * Math.pow(b.f0 / a.f0, u) : (u < 0.5 ? a.f0 : b.f0);
    const voiced = f0 > 0;
    frames.push({ t, abduction: voiced ? abduction : 0.6, f0: voiced ? f0 : (points.find((q) => q.f0 > 0)?.f0 ?? 120), ps: t < dur ? ps : 0 });
  }
  return { frames, phones: [{ ipa: '', t0: 0, t1: dur }], duration: dur };
}
