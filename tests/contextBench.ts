import { VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { textToPhones, Lang } from '../src/dsp/speech/g2p';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { portArea, noseOf } from '../src/dsp/tract/nasal';
import { Articulators, ARTICULATOR_KEYS, DEFAULT_ARTICULATORS } from '../src/dsp/tract/types';
import { AREA_CLOSED } from '../src/dsp/constants';

/**
 * Vowels in running speech (scripts/context.ts and tests/context.test.ts): how
 * close each vowel of a sentence gets to the same vowel held on its own.
 * Every sentence is rendered by the real engine; in the middle of each vowel
 * the shape the tract has actually reached is measured: the formants and
 * bandwidths of the mouth and throat alone (the frequency-domain model with
 * the velum shut, since a slightly open port adds a pole-zero pair that a
 * peak picker takes for a formant), the nasal port and the nasal airflow
 * apart, and how far each articulator is from the vowel's own target.
 *
 * The corpus: the examples of the interface, plus sentences full of front
 * vowels between alveolar consonants and of vowels next to nasals, where the
 * tongue tip, the tongue body and the velum have the least time.
 */
export const CONTEXT_CORPUS: [string, Lang][] = [
  ['Every voice you have ever heard is made of just two ingredients.', 'en'],
  ['Is it raining in the city today?', 'en'],
  ['The little button on the water bottle.', 'en'],
  ['A buzz, a hiss and a filter.', 'en'],
  ['Hello there.', 'en'],
  ['He needs a little sleep in the evening.', 'en'],
  ['Sit in the tin seat and listen.', 'en'],
  ['Many men need ten minutes.', 'en'],
  ['La voce è fatta di aria e di un filtro.', 'it'],
  ['Il carro corre sulla strada.', 'it'],
  ['Papà, tutto bene?', 'it'],
  ['Piove in città oggi?', 'it'],
  ['Le idee di Nina sono nitide.', 'it'],
  ['Il vino è nel tinello di Lidia.', 'it'],
  ['Mamma, vieni a vedere la neve!', 'it'],
];

/** Vowels whose second formant the tongue body carries highest (and the nucleus of /eɪ/). */
export const FRONT_VOWELS = new Set(['i', 'ɪ', 'e', 'ɛ', 'eɪ']);
/** Vowels with a low third formant of their own. */
export const RHOTIC_VOWELS = new Set(['ɝ', 'ɚ']);
const NASALS = new Set(['m', 'n', 'ŋ', 'ɲ']);

export interface Token {
  ipa: string; lang: Lang; text: string; ctx: string; dur: number;
  f: number[]; b: number[]; held: number[];
  port: number; nose: number; nearNasal: boolean;
  art: Record<string, number>; miss: Record<string, number>;
}

/** Formants and bandwidths of a posture with the velum shut. */
function oral(a: Articulators): { f: number[]; b: number[] } {
  const p = defaultParams();
  const fm = formants(sectionsFromGeometry(computeGeometry(a, p.anatomy, p.teeth)), { port: AREA_CLOSED, scale: p.anatomy.scale, nose: noseOf(p.anatomy) }, 4000, 25).slice(0, 3);
  return { f: fm.map((x) => x.f), b: fm.map((x) => x.bw) };
}

/** The formants of a posture held still (the vowel on its own). */
const heldCache = new Map<string, number[]>();
function held(ipa: string): number[] {
  let f = heldCache.get(ipa);
  if (f) return f;
  f = oral({ ...DEFAULT_ARTICULATORS, ...PHONEMES[ipa].art }).f;
  heldCache.set(ipa, f);
  return f;
}

/** Every vowel of a sentence, measured in its middle (a diphthong in its nucleus). */
export function measure(text: string, lang: Lang, fs = 48000): Token[] {
  const p = defaultParams();
  const sc = buildScore(textToPhones(text, lang), { lang, f0: p.source.f0 });
  const e = new VoiceEngine(fs, p);
  e.snapArticulators();
  e.snapPressure();
  e.playScore(sc);
  const ph = sc.phones;
  const marks = ph.map((q, i) => ({ q, i })).filter(({ q }) => PHONEMES[q.ipa]?.manner === 'vowel').map(({ q, i }) => {
    const off = !!PHONEMES[q.ipa].offglide;
    return {
      ipa: q.ipa, i, dur: q.t1 - q.t0,
      t: off ? q.t0 + 0.25 * (q.t1 - q.t0) : 0.5 * (q.t0 + q.t1),
      ctx: `${ph[i - 1]?.ipa ?? '#'}_${ph[i + 1]?.ipa ?? '#'}`,
      nearNasal: NASALS.has(ph[i - 1]?.ipa ?? '') || NASALS.has(ph[i + 1]?.ipa ?? ''),
    };
  });
  const n = Math.round((sc.duration + 0.1) * fs);
  const out = new Float32Array(128);
  const tokens: Token[] = [];
  let k = 0;
  for (let i = 0; i < n && k < marks.length; i += 128) {
    e.process(out, 128);
    const t = (i + 128) / fs;
    while (k < marks.length && marks[k].t <= t) {
      const m = marks[k++];
      const tel = e.telemetry();
      const a = tel.articulators;
      const fm = oral(a);
      const target = { ...DEFAULT_ARTICULATORS, ...PHONEMES[m.ipa].art } as unknown as Record<string, number>;
      const now = a as unknown as Record<string, number>;
      tokens.push({
        ipa: m.ipa, lang, text, ctx: m.ctx, dur: m.dur,
        f: fm.f, b: fm.b, held: held(m.ipa),
        port: portArea(a.velum, p.anatomy.nasalLeak, p.anatomy.scale), nose: tel.uNose, nearNasal: m.nearNasal,
        art: Object.fromEntries(ARTICULATOR_KEYS.map((q) => [q, now[q]])),
        miss: Object.fromEntries(ARTICULATOR_KEYS.map((q) => [q, now[q] - target[q]])),
      });
    }
  }
  return tokens;
}

const share = (ts: Token[], f: (t: Token) => boolean) => (100 * ts.filter(f).length) / Math.max(1, ts.length);
export const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const pct = (xs: number[], q: number) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN; };

/** The numbers the vowels in running speech are judged by. */
export function summary(tokens: Token[]): Record<string, number> {
  const front = tokens.filter((t) => FRONT_VOWELS.has(t.ipa));
  const nonRhotic = tokens.filter((t) => !RHOTIC_VOWELS.has(t.ipa));
  const oral = tokens.filter((t) => !t.nearNasal);
  const ratio = front.map((t) => t.f[1] / t.held[1]);
  return {
    'front F2 / held (mean)': avg(ratio),
    'front F2 / held (10th pct)': pct(ratio, 0.1),
    'F3 of non-rhotic vowels, 10th pct (Hz)': pct(nonRhotic.map((t) => t.f[2]), 0.1),
    // /u/ held has an F3 of its own near 2250 Hz: what tells an r-coloured
    // vowel is an F3 below the vowel's own
    'non-rhotic vowels with F3 < 2300 Hz, /u/ aside (%)': share(nonRhotic.filter((t) => t.ipa !== 'u'), (t) => t.f[2] < 2300),
    'non-rhotic vowels with F3 150 Hz below held (%)': share(nonRhotic, (t) => t.f[2] < t.held[2] - 150),
    'F1 / held, all vowels (mean)': avg(tokens.map((t) => t.f[0] / t.held[0])),
    'tongue body miss |dX|+|dY| (mean)': avg(tokens.map((t) => Math.abs(t.miss.tongueX) + Math.abs(t.miss.tongueY))),
    'tip height at vowel middles (mean)': avg(tokens.map((t) => t.art.tipY)),
    'tip height at vowel middles (90th pct)': pct(tokens.map((t) => t.art.tipY), 0.9),
    'port, oral vowels away from nasals (mean cm2)': avg(oral.map((t) => t.port)),
    'port, oral vowels away from nasals (max cm2)': Math.max(0, ...oral.map((t) => t.port)),
    'port, vowels next to a nasal (mean cm2)': avg(tokens.filter((t) => t.nearNasal).map((t) => t.port)),
  };
}
