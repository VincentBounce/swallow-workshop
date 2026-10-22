/**
 * Fits the articulatory vowel targets so that the frequency-domain reference
 * model lands on the adult-male reference formants (Peterson & Barney 1952).
 *   npx tsx scripts/tune-vowels.ts [vowel,vowel,...] [--keys=jaw,tongueX,...] [--minarea=0.3] [--write]
 * --minarea keeps the narrowest passage (more than 2.6 cm above the glottis)
 * at least that wide, in cm^2, so that the vowel neither hisses nor throttles
 * the airflow.
 * Prints the fitted articulators; paste them into src/dsp/speech/phonemes.ts.
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, ARTICULATOR_RANGES, Articulators } from '../src/dsp/tract/types';
import { VOWELS } from '../src/dsp/speech/phonemes';
import { MALE_TARGETS } from '../src/dsp/data/vowels';
import { nelderMead } from '../src/dsp/util/optimize';

const ALL: Partial<Record<keyof Articulators, [number, number]>> = {
  jaw: [0.12, 0.6], tongueX: [0.25, 1.2], tongueY: [0.25, 1.2], tongueRoot: [0.3, 1.0], lipOpen: [0.1, 0.5], lipRound: [0.2, 1.0], lipProtrude: [0.2, 1.0],
};
const keysArg = process.argv.find((a) => a.startsWith('--keys='));
const keys = (keysArg ? keysArg.slice(7).split(',') : ['jaw', 'tongueX', 'tongueY', 'lipOpen', 'lipRound', 'lipProtrude']) as (keyof Articulators)[];
const steps = keys.map((k) => ALL[k]![0]);
const regScale = keys.map((k) => ALL[k]![1]);

const minArg = process.argv.find((a) => a.startsWith('--minarea='));
const MIN_AREA = minArg ? Number(minArg.slice(10)) : 0;

function narrowest(a: Articulators): number {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  let m = Infinity;
  for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6) m = Math.min(m, g.hits[i].area);
  return m;
}

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
    const ij = keys.indexOf('jaw');
    const jawPen = jt !== undefined && ij >= 0 ? ((x[ij] - jt) / 0.15) ** 2 : 0;
    const nar = MIN_AREA > 0 ? narrowest(toArt(x)) : Infinity;
    const tight = nar < MIN_AREA ? (Math.log(nar / MIN_AREA) / 0.1) ** 2 : 0;
    return c + 0.004 * reg + 0.01 * jawPen + pen + 0.01 * tight;
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
    const merged: Partial<Articulators> = { ...VOWELS[v].art, ...art };
    const order = ['jaw', 'tongueX', 'tongueY', 'tongueRoot', 'lipOpen', 'lipRound', 'lipProtrude'] as (keyof Articulators)[];
    const obj = '{ ' + order.filter((k) => merged[k] !== undefined && (k !== 'tongueRoot' || merged[k] !== 0)).map((k) => `${k}: ${merged[k]}`).join(', ') + ' }';
    src = src.replace(re, `$1${obj}`);
  }
  writeFileSync(path, src);
  console.log('updated', path.pathname);
}
