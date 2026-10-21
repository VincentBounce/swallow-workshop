/**
 * Fits the articulatory vowel targets so that the frequency-domain reference
 * model lands on the adult-male reference formants (Peterson & Barney 1952).
 *   npx tsx scripts/tune-vowels.ts [vowel,vowel,...]
 * Prints the fitted articulators; paste them into src/dsp/speech/phonemes.ts.
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, ARTICULATOR_RANGES, Articulators } from '../src/dsp/tract/types';
import { VOWELS } from '../src/dsp/speech/phonemes';
import { MALE_TARGETS } from '../src/dsp/data/vowels';
import { nelderMead } from '../src/dsp/util/optimize';

const keys: (keyof Articulators)[] = ['jaw', 'tongueX', 'tongueY', 'lipOpen', 'lipRound', 'lipProtrude'];
const steps = [0.12, 0.25, 0.25, 0.1, 0.2, 0.2];
const regScale = [0.6, 1.2, 1.2, 0.5, 1.0, 1.0];

function evalFormants(a: Articulators): number[] {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const af = sectionsFromGeometry(g);
  return formants(af, {}, 4000).map((f) => f.f);
}

const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const which = arg ? arg.split(',') : Object.keys(MALE_TARGETS);
const results: Record<string, Partial<Articulators>> = {};
/** typical incisor openings expressed as jaw values (about 1.7 cm at jaw = 1) */
const JAW_TYPICAL: Record<string, number> = {
  i: 0.25, 'ɪ': 0.35, e: 0.35, 'ɛ': 0.55, 'æ': 0.85, a: 0.95, 'ɑ': 0.9, 'ɔ': 0.65, o: 0.4, 'ʊ': 0.3, u: 0.22, 'ʌ': 0.6, 'ə': 0.4,
};
for (const v of which) {
  const target = MALE_TARGETS[v];
  const ph = VOWELS[v];
  if (!target || !ph) continue;
  const base: Articulators = { ...DEFAULT_ARTICULATORS, ...ph.art };
  const x0 = keys.map((k) => base[k] as number);
  const toArt = (x: number[]): Articulators => {
    const a = { ...base };
    keys.forEach((k, i) => {
      const [lo, hi] = ARTICULATOR_RANGES[k];
      const lo2 = k === 'lipOpen' ? -0.05 : lo;
      (a[k] as number) = Math.min(hi, Math.max(lo2, x[i]));
    });
    return a;
  };
  const cost = (x: number[]): number => {
    const f = evalFormants(toArt(x));
    if (f.length < 3) return 50;
    const w = [1.0, 1.0, 0.25];
    let c = 0;
    for (let k = 0; k < 3; k++) c += w[k] * Math.log(f[k] / target[k]) ** 2;
    let reg = 0;
    x.forEach((xi, i) => { reg += ((xi - x0[i]) / regScale[i]) ** 2; });
    // penalise leaving the allowed range
    let pen = 0;
    keys.forEach((k, i) => {
      const [lo, hi] = ARTICULATOR_RANGES[k];
      if (x[i] < lo) pen += (lo - x[i]) ** 2 * 10;
      if (x[i] > hi) pen += (x[i] - hi) ** 2 * 10;
    });
    const jt = JAW_TYPICAL[v];
    const jawPen = jt !== undefined ? ((x[0] - jt) / 0.15) ** 2 : 0;
    return c + 0.004 * reg + 0.01 * jawPen + pen;
  };
  const before = evalFormants(base);
  const res = nelderMead(cost, x0, steps, 260, 1e-7);
  const best = toArt(res.x);
  const after = evalFormants(best);
  const out: Partial<Articulators> = {};
  keys.forEach((k) => { (out[k] as number) = Math.round((best[k] as number) * 100) / 100; });
  results[v] = out;
  console.log(
    `${v}: target ${target.join('/')}  before ${before.slice(0, 3).map((x) => x.toFixed(0)).join('/')}  after ${after.slice(0, 3).map((x) => x.toFixed(0)).join('/')}  ` +
    JSON.stringify(out),
  );
}

if (process.argv.includes('--write')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const path = new URL('../src/dsp/speech/phonemes.ts', import.meta.url);
  let src = readFileSync(path, 'utf-8');
  for (const [v, art] of Object.entries(results)) {
    const re = new RegExp(`(V\\('${v}', )\\{[^}]*\\}`, 'u');
    const obj = '{ ' + Object.entries(art).map(([k, x]) => `${k}: ${x}`).join(', ') + ' }';
    src = src.replace(re, `$1${obj}`);
  }
  writeFileSync(path, src);
  console.log('updated', path.pathname);
}
