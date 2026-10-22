/**
 * Fits the posture of a lateral approximant to its measured formants on the
 * frequency-domain model, keeping what makes it a lateral: the tip (or the
 * tongue body, for /ʎ/) closed on the midline, the air flowing through the
 * lateral channels, the supralingual cavity behind the contact as a side
 * branch at least 2 cm long (3.1 cm in Zhang & Espy-Wilson's speaker), and
 * a passage wide enough not to hiss. Adult-male targets: clear
 * /l/ F1 about 350, F3 about 2600 Hz (Narayanan, Alwan & Haker 1997; Zhang &
 * Espy-Wilson 2004); F2 is the colour of the lateral (clear about 1500, dark
 * about 950 Hz). The search starts from the current posture and keeps the
 * best of a few starting tip placements; with --robust each posture is also
 * scored with every articulator nudged, so that the contact does not appear
 * or vanish with a small movement.
 *   npx tsx scripts/tune-lateral.ts l 350 1500 2600 [--keys=jaw,tongueX,...] [--robust]
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_TEETH, DEFAULT_ARTICULATORS, ARTICULATOR_RANGES, Articulators } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { nelderMead } from '../src/dsp/util/optimize';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [ph = 'l'] = args;
const T = args.slice(1, 4).map(Number);
const target = T.length === 3 && T.every((x) => x > 0) ? T : [350, 1500, 2600];
const keysArg = process.argv.find((a) => a.startsWith('--keys='));
const keys = (keysArg ? keysArg.slice(7).split(',') : ['jaw', 'tongueX', 'tongueY', 'tongueRoot', 'tipX', 'tipY', 'lipOpen']) as (keyof Articulators)[];
const robust = process.argv.includes('--robust');
const P = PHONEMES[ph];
const base: Articulators = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...P.art };

function measure(a: Articulators) {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const af = sectionsFromGeometry(g);
  let narrow = Infinity, lateral = 0;
  for (let i = 0; i <= g.lastRay; i++) {
    if (g.s[i] < 2.6) continue;
    narrow = Math.min(narrow, g.hits[i].area);
    lateral = Math.max(lateral, g.hits[i].lateral);
  }
  const sl = af.supralingual;
  let cavity = 0;
  if (sl && sl.at >= 0) for (const x of sl.areas) if (x > 1e-3) cavity += af.dx;
  const f = formants(af, {}, 4000).map((x) => x.f);
  return { f, narrow, lateral, cavity, contact: !!sl && sl.at >= 0 && cavity > 0 };
}

const toArt = (x: number[]): Articulators => {
  const a = { ...base };
  keys.forEach((k, i) => { const [lo, hi] = ARTICULATOR_RANGES[k]; (a[k] as number) = Math.min(hi, Math.max(lo, x[i])); });
  return a;
};
const x0 = keys.map((k) => base[k] as number);

const pointCost = (x: number[]) => {
  const m = measure(toArt(x));
  let c = 0;
  for (let k = 0; k < 3; k++) {
    const f = m.f[k] ?? 0;
    c += f > 0 ? (Math.log(f / target[k]) / (k === 1 ? 0.03 : 0.05)) ** 2 : 100;
  }
  if (!m.contact) c += 50; // a lateral, not an open vowel
  else if (m.cavity < 2) c += ((2 - m.cavity) / 0.3) ** 2; // a cavity as long as measured (about 3 cm)
  if (m.narrow < 0.2) c += ((0.2 - m.narrow) / 0.02) ** 2; // the channels do not hiss
  keys.forEach((k, i) => {
    const [lo, hi] = ARTICULATOR_RANGES[k];
    if (x[i] < lo) c += ((lo - x[i]) / 0.05) ** 2;
    if (x[i] > hi) c += ((x[i] - hi) / 0.05) ** 2;
    c += 0.02 * ((x[i] - x0[i]) / 0.5) ** 2;
  });
  return c;
};
const NUDGE = 0.03;
const cost = (x: number[]) => {
  let c = pointCost(x);
  if (!robust) return c;
  for (let i = 0; i < x.length; i++) {
    for (const d of [-NUDGE, NUDGE]) {
      const y = x.slice();
      y[i] += d;
      c = Math.max(c, pointCost(y));
    }
  }
  return c;
};

const fmt = (m: ReturnType<typeof measure>) =>
  `F ${m.f.slice(0, 3).map((f) => f.toFixed(0)).join('/')} narrowest ${m.narrow.toFixed(2)} lateral ${m.lateral.toFixed(2)} cavity ${m.cavity.toFixed(1)} cm${m.contact ? '' : ' (no contact)'}`;
console.log(`${ph} now:    ${fmt(measure(base))} (target ${target.join('/')})`);
let best = { x: x0, fx: cost(x0), iters: 0 };
const iTipX = keys.indexOf('tipX'), iTipY = keys.indexOf('tipY');
for (const [tx, ty] of [[x0[iTipX], x0[iTipY]], [0.1, 1.5], [0.4, 1.7], [0.25, 1.9]]) {
  const s = x0.slice();
  if (iTipX >= 0 && tx !== undefined) s[iTipX] = tx;
  if (iTipY >= 0 && ty !== undefined) s[iTipY] = ty;
  let r = nelderMead(cost, s, keys.map(() => 0.2), 1500, 1e-7);
  r = nelderMead(cost, r.x, keys.map(() => 0.06), 1500, 1e-8);
  console.log(`  start tip ${tx}/${ty}: cost ${r.fx.toFixed(3)} ${fmt(measure(toArt(r.x)))}`);
  if (r.fx < best.fx) best = r;
}
const a = toArt(best.x);
const out: Partial<Articulators> = {};
keys.forEach((k) => { (out[k] as number) = Math.round((a[k] as number) * 1000) / 1000; });
console.log(`${ph} fitted: ${fmt(measure(a))}`);
console.log(JSON.stringify(out));
