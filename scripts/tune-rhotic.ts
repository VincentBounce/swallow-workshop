/**
 * Fits an articulation to F1/F2/F3 targets with all tongue, tip and lip
 * articulators free (r-coloured vowels need a low F3, which only a palatal or
 * retroflex tip with rounded lips and a narrow pharynx can give).
 *   npx tsx scripts/tune-rhotic.ts 490,1350,1690 [startPhoneme] [jaw,tongueX,...]
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, ARTICULATOR_RANGES, Articulators } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { nelderMead } from '../src/dsp/util/optimize';

const target = (process.argv[2] ?? '490,1350,1690').split(',').map(Number);
const start = process.argv[3] ?? 'ɹ';
const ALL: (keyof Articulators)[] = ['jaw', 'tongueX', 'tongueY', 'tipX', 'tipY', 'lipOpen', 'lipRound', 'lipProtrude'];
const STEP: Record<string, number> = { jaw: 0.1, tongueX: 0.3, tongueY: 0.3, tipX: 0.3, tipY: 0.3, lipOpen: 0.1, lipRound: 0.2, lipProtrude: 0.2 };
// optional third argument: the articulators to fit (comma separated), the others stay at the start phoneme
const keys = (process.argv[4] ? process.argv[4].split(',') : ALL) as (keyof Articulators)[];
const steps = keys.map((k) => STEP[k] ?? 0.2);

function evalFormants(a: Articulators): number[] {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const af = sectionsFromGeometry(g);
  return formants(af, {}, 4000).map((f) => f.f);
}

const base: Articulators = { ...DEFAULT_ARTICULATORS, ...PHONEMES[start].art };
const x0 = keys.map((k) => base[k] as number);
const toArt = (x: number[]): Articulators => {
  const a = { ...base };
  keys.forEach((k, i) => {
    const [lo, hi] = ARTICULATOR_RANGES[k];
    (a[k] as number) = Math.min(hi, Math.max(k === 'lipOpen' ? 0 : lo, x[i]));
  });
  return a;
};
/** Narrowest oral passage on the fine grid of the geometry, as the engine's aerodynamics sees it. */
const minArea = (a: Articulators): number => {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  let m = Infinity;
  for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6) m = Math.min(m, g.hits[i].area);
  if (g.slit.area < m && g.teethPos > 0) m = g.slit.area;
  return m;
};
// an approximant must stay open enough not to hiss: about 0.3 cm^2 (Stevens 1998, glides 0.17-0.3)
const MIN_OPEN = Number(process.env.MIN_OPEN ?? 0.3);
const cost = (x: number[]): number => {
  const a = toArt(x);
  const f = evalFormants(a);
  if (f.length < 3) return 50;
  const w = [1, 1, 2];
  let c = 0;
  for (let k = 0; k < 3; k++) c += w[k] * Math.log(f[k] / target[k]) ** 2;
  const m = minArea(a);
  const pen = m < MIN_OPEN ? ((MIN_OPEN - m) / 0.03) ** 2 : 0;
  let reg = 0;
  x.forEach((xi, i) => { reg += (xi - x0[i]) ** 2; });
  return c + 0.002 * reg + 0.05 * pen;
};
let best = { x: x0, fx: cost(x0) };
for (let r = 0; r < 4; r++) {
  const res = nelderMead(cost, best.x, steps.map((s) => s * (1 - 0.2 * r)), 500, 1e-9);
  if (res.fx < best.fx) best = res;
}
const a = toArt(best.x);
const out: Record<string, number> = {};
keys.forEach((k) => { out[k] = Math.round((a[k] as number) * 1000) / 1000; });
console.log('target', target.join('/'), 'start', evalFormants(base).slice(0, 3).map((v) => v.toFixed(0)).join('/'));
console.log('fit', evalFormants(a).slice(0, 4).map((v) => v.toFixed(0)).join('/'), 'min area', minArea(a).toFixed(3), 'cost', best.fx.toFixed(4));
console.log(JSON.stringify(out));
