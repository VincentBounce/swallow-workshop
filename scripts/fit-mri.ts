/**
 * Fits the articulatory vowel targets to two references at once: the formants
 * of MALE_TARGETS (Peterson & Barney) and the shape of the area functions
 * measured by MRI (Story 2008). The formant term keeps the vowel where
 * listeners expect it; the shape term chooses, among the many tract shapes
 * with those formants, the one closest to a real tract. No vowel may be
 * narrower than the measured one (it would hiss and throttle the airflow),
 * and the tract length and jaw opening stay near the measured and typical
 * values.
 *   npx tsx scripts/fit-mri.ts [vowel,...] [--shape=1] [--profiles] [--write]
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, ARTICULATOR_RANGES, Articulators } from '../src/dsp/tract/types';
import { VOWELS } from '../src/dsp/speech/phonemes';
import { MALE_TARGETS } from '../src/dsp/data/vowels';
import { MRI_VOWELS, shapeDistance, narrowestAbove } from '../src/dsp/data/mri';
import { nelderMead } from '../src/dsp/util/optimize';

const shapeArg = process.argv.find((x) => x.startsWith('--shape='));
const W_SHAPE = shapeArg ? Number(shapeArg.slice(8)) : 1;

// lip rounding stays as it is: it is a phonological choice, and the MRI lip
// openings (supine speaker, lips hard to segment) are left out of the shape
const keys: (keyof Articulators)[] = ['jaw', 'tongueX', 'tongueY', 'lipOpen', 'lipProtrude', 'tongueRoot'];
const steps = [0.12, 0.25, 0.25, 0.1, 0.2, 0.3];
const regScale = [0.6, 1.2, 1.2, 0.5, 1.0, 1.0];

/** typical incisor openings expressed as jaw values (about 1.7 cm at jaw = 1) */
const JAW_TYPICAL: Record<string, number> = {
  i: 0.25, 'ɪ': 0.35, e: 0.35, 'ɛ': 0.55, 'æ': 0.85, 'ɑ': 0.9, 'ɔ': 0.65, o: 0.4, 'ʊ': 0.3, u: 0.22, 'ʌ': 0.6,
};

function evaluate(a: Articulators) {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const af = sectionsFromGeometry(g);
  // the engine looks for the turbulent constriction on the fine grid
  let fine = Infinity;
  for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6) fine = Math.min(fine, g.hits[i].area);
  return { f: formants(af, {}, 4000).map((x) => x.f), areas: af.areas, length: af.length, narrowest: fine };
}

const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const which = arg ? arg.split(',') : MRI_VOWELS.map((v) => v.ipa);
const results: Record<string, Partial<Articulators>> = {};
let sumBefore = 0, sumAfter = 0;
for (const v of which) {
  const mri = MRI_VOWELS.find((m) => m.ipa === v);
  const target = MALE_TARGETS[v];
  const ph = VOWELS[v];
  if (!mri || !target || !ph) continue;
  const floor = narrowestAbove(mri.areas, mri.dx);
  const mriLength = mri.areas.length * mri.dx;
  const base: Articulators = { ...DEFAULT_ARTICULATORS, ...ph.art };
  const x0 = keys.map((k) => base[k] as number);
  // rounded vowels keep their lips forward; unrounded ones may spread them as
  // far as for /s/
  const ranges = { ...ARTICULATOR_RANGES, lipOpen: [-0.05, ARTICULATOR_RANGES.lipOpen[1]] as [number, number], lipProtrude: [base.lipRound >= 0.5 ? 0.4 : -0.35, 1] as [number, number] };
  const toArt = (x: number[]): Articulators => {
    const a = { ...base };
    keys.forEach((k, i) => {
      const [lo, hi] = ranges[k];
      (a[k] as number) = Math.min(hi, Math.max(lo, x[i]));
    });
    return a;
  };
  const cost = (x: number[]): number => {
    const e = evaluate(toArt(x));
    if (e.f.length < 3) return 50;
    const w = [1.0, 1.0, 0.25];
    let c = 0;
    for (let k = 0; k < 3; k++) c += w[k] * Math.log(e.f[k] / target[k]) ** 2;
    const s = shapeDistance(e.areas, mri.areas);
    const tight = e.narrowest < floor ? (Math.log(e.narrowest / floor) / 0.1) ** 2 : 0;
    let reg = 0;
    x.forEach((xi, i) => { reg += ((xi - x0[i]) / regScale[i]) ** 2; });
    let pen = 0;
    keys.forEach((k, i) => {
      const [lo, hi] = ranges[k];
      if (x[i] < lo) pen += (lo - x[i]) ** 2 * 10;
      if (x[i] > hi) pen += (x[i] - hi) ** 2 * 10;
    });
    const lenErr = Math.log(e.length / mriLength) / 0.04;
    const jt = JAW_TYPICAL[v];
    const jawPen = jt !== undefined ? ((x[0] - jt) / 0.15) ** 2 : 0;
    // a formant error of 3 % costs as much as a shape distance of 0.3
    return (c / 0.03 ** 2) * 0.09 + W_SHAPE * s * s + 0.06 * lenErr * lenErr + 0.02 * jawPen + 0.002 * reg + pen + tight;
  };
  const e0 = evaluate(base);
  // several starting points for the root: a low back tongue with the root far
  // back closes the pharynx, a local minimum the simplex cannot leave
  const iRoot = keys.indexOf('tongueRoot');
  let res = { x: x0, fx: Infinity, iters: 0 };
  for (const r0 of [x0[iRoot], -0.6, 0.3, 1.0]) {
    const start = x0.slice(); start[iRoot] = r0;
    let r = nelderMead(cost, start, steps, 500, 1e-8);
    r = nelderMead(cost, r.x, steps.map((s) => s * 0.5), 500, 1e-9);
    if (r.fx < res.fx) res = r;
  }
  const best = toArt(res.x);
  const e1 = evaluate(best);
  const out: Partial<Articulators> = {};
  keys.forEach((k) => { (out[k] as number) = Math.round((best[k] as number) * 1000) / 1000; });
  results[v] = out;
  const s0 = shapeDistance(e0.areas, mri.areas), s1 = shapeDistance(e1.areas, mri.areas);
  sumBefore += s0; sumAfter += s1;
  const fmt = (f: number[]) => f.slice(0, 3).map((x) => x.toFixed(0)).join('/');
  console.log(`${v}: target ${target.join('/')}  before ${fmt(e0.f)} shape ${s0.toFixed(2)} L ${e0.length.toFixed(1)} min ${e0.narrowest.toFixed(2)}  after ${fmt(e1.f)} shape ${s1.toFixed(2)} L ${e1.length.toFixed(1)} min ${e1.narrowest.toFixed(2)} (MRI ${mriLength.toFixed(1)} cm, min ${floor.toFixed(2)})  ${JSON.stringify(out)}`);
}
console.log(`mean shape distance: before ${(sumBefore / which.length).toFixed(3)}, after ${(sumAfter / which.length).toFixed(3)}`);

if (process.argv.includes('--write')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const path = new URL('../src/dsp/speech/phonemes.ts', import.meta.url);
  let src = readFileSync(path, 'utf-8');
  for (const [v, art] of Object.entries(results)) {
    const merged: Partial<Articulators> = { ...VOWELS[v].art, ...art };
    const order = ['jaw', 'tongueX', 'tongueY', 'tongueRoot', 'lipOpen', 'lipRound', 'lipProtrude'] as (keyof Articulators)[];
    const obj = '{ ' + order.filter((k) => merged[k] !== undefined).map((k) => `${k}: ${merged[k]}`).join(', ') + ' }';
    const re = new RegExp(`(V\\('${v}', )\\{[^}]*\\}`, 'u');
    if (!re.test(src)) throw new Error(`vowel ${v} not found`);
    src = src.replace(re, `$1${obj}`);
  }
  writeFileSync(path, src);
  console.log('updated', path.pathname);
}
