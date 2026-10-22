/**
 * Fits a held sibilant to the spectrum measured on real speakers: the peak and
 * the spectral mean of its noise (Jongman et al. 2000: /ʃ/ peak about 3.8 kHz
 * and mean 4.2 kHz over both sexes, lower for men; /s/ mean 6.1 kHz), and
 * little energy below 2 kHz. The search runs on the frequency-domain model:
 * the transfer from the incisors to the radiated pressure, with the jet
 * resistances, times the obstacle source spectrum (a first-order low-pass at
 * 0.15 v / slit height, with the jet of the engine: its speed at the teeth
 * from the hydraulic diameter and the width of the passage). It starts from several tongue-tip placements, keeps
 * a fricative passage at its place and open lips, then renders the winner
 * with the engine (the two agree within about 1 dB per band).
 *   npx tsx scripts/tune-sibilant.ts ʃ 3000 4000 [--keys=tipX,tipY,...]
 */
import { renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { sourceTransferMagnitudes } from '../src/dsp/tract/acoustics';
import { Aero, kineticResistances, newJetInfo } from '../src/dsp/aero/aero';
import { DEFAULT_ANATOMY, DEFAULT_TEETH, ARTICULATOR_RANGES, Articulators } from '../src/dsp/tract/types';
import { RHO, C_SOUND, CMH2O } from '../src/dsp/constants';
import { bandPower, rmsDb, spectralCentroid, spectralPeak } from '../tests/helpers';
import { nelderMead } from '../src/dsp/util/optimize';

const [ph = 'ʃ', peakArg = '3000', meanArg = '4000'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PEAK = Number(peakArg), MEAN = Number(meanArg);
const keysArg = process.argv.find((a) => a.startsWith('--keys='));
const keys = (keysArg ? keysArg.slice(7).split(',') : ['tipX', 'tipY', 'tongueX', 'groove', 'jaw', 'lipOpen', 'lipRound', 'lipProtrude']) as (keyof Articulators)[];
const fs = 48000;
const P = PHONEMES[ph];
const base: Articulators = { ...defaultParams().articulators, ...P.art };
const params = defaultParams();
const ps = params.source.ps * CMH2O;
// steady glottal opening of a voiceless fricative (as in the engine)
const ag = params.source.chink + 0.55 * P.abduction;

const freqs: number[] = [];
for (let f = 300; f <= 11000; f += 25) freqs.push(f);

function geometry(a: Articulators) {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  // the narrowest passage as the engine finds it, the incisal slit included
  let narrow = Infinity, at = 0, perimeter = 0, width = 0;
  for (let i = 0; i <= g.lastRay; i++) {
    const h = g.hits[i];
    if (g.s[i] >= 2.6 && h.area < narrow) { narrow = h.area; at = g.s[i]; perimeter = h.perimeter; width = h.width; }
  }
  if (g.slit.area < narrow && g.teethPos > 0) { narrow = g.slit.area; at = g.teethPos; perimeter = g.slit.perimeter; width = g.slit.width; }
  let exitS = at;
  for (let i = 0; i <= g.lastRay; i++) { if (g.s[i] <= at) continue; if (g.hits[i].area > 2.2 * Math.max(narrow, 1e-3)) { exitS = g.s[i]; break; } }
  // the narrowest passage further back (the tongue body against the palate):
  // if it is nearly as narrow, a small movement moves the constriction there
  let back = Infinity;
  for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6 && g.s[i] < exitS - 1.2) back = Math.min(back, g.hits[i].area);
  return { g, narrow, at, perimeter, width, toTeeth: g.teethPos - exitS, back, channel: exitS - at };
}

/** Predicted radiated power spectrum (frequency model) and its measures. */
function predict(a: Articulators) {
  const { g, narrow, at, perimeter, width, toTeeth, back, channel } = geometry(a);
  const af = sectionsFromGeometry(g);
  // Bernoulli orifices in series: intraoral pressure and jet speed
  const ac = Math.max(narrow, 1e-3);
  const aero = new Aero();
  aero.po = (ps * ag * ag) / (ag * ag + ac * ac);
  const jet = aero.jet(ac, toTeeth, g.slit.height, newJetInfo(), perimeter, width);
  const v = jet.v;
  const fc = jet.fcObstacle;
  const r = kineticResistances(af.areas, ac * v, new Float64Array(af.areas.length), Math.floor(at / af.dx), narrow).map((x) => x * RHO * C_SOUND);
  // the engine injects the obstacle source at the exit of the incisor section
  const m = sourceTransferMagnitudes(af, af.teethIndex + 1, freqs, { glottalImpedance: 5, resistances: r });
  const pw = freqs.map((f, i) => ((m[i] * f) ** 2 / (1 + (f / fc) ** 2)) * ((f * f) / (f * f + 200 * 200)));
  let m1 = 0, m0 = 0, lo = 0, nlo = 0, mid = 0, nmid = 0, pk = 0, pv = -1;
  freqs.forEach((f, i) => {
    if (f >= 1000) { m1 += f * pw[i]; m0 += pw[i]; }
    if (f >= 700 && f < 1800) { lo += pw[i]; nlo++; }
    if (f >= 2000 && f < 3500) { mid += pw[i]; nmid++; }
    if (f >= 800) {
      let s = 0;
      for (let j = Math.max(0, i - 10); j <= Math.min(freqs.length - 1, i + 10); j++) s += pw[j];
      if (s > pv) { pv = s; pk = f; }
    }
  });
  return { peak: pk, mean: m1 / m0, low: 10 * Math.log10(lo / nlo / (mid / nmid)), narrow, toTeeth, lips: g.lipArea, fc, reach: jet.vAtTeeth / Math.max(v, 1), back, channel };
}

/** The same measures on the rendered sound (as in tests/noise.test.ts). */
function render(a: Articulators) {
  const p = defaultParams();
  p.articulators = a; p.abduction = P.abduction; p.voicing = P.voiced; p.phonate = true;
  const x = renderOffline(p, 0.6).out.subarray(12000);
  const pa = defaultParams();
  pa.articulators = { ...pa.articulators, ...PHONEMES.a.art }; pa.voicing = true; pa.phonate = true;
  const xa = renderOffline(pa, 0.6).out.subarray(12000);
  return {
    peak: spectralPeak(x, fs, 1500, 11000), mean: spectralCentroid(x, fs, 1000, 11000),
    low: 10 * Math.log10(bandPower(x, fs, 700, 1800) / bandPower(x, fs, 2000, 3500)), level: rmsDb(x) - rmsDb(xa),
  };
}

const toArt = (x: number[]): Articulators => {
  const a = { ...base };
  keys.forEach((k, i) => { const [lo, hi] = ARTICULATOR_RANGES[k]; (a[k] as number) = Math.min(hi, Math.max(lo, x[i])); });
  return a;
};
const x0 = keys.map((k) => base[k] as number);
/** Cost of the posture alone. */
const pointCost = (x: number[]) => {
  const m = predict(toArt(x));
  let c = (Math.log(m.peak / PEAK) / 0.1) ** 2 + (Math.log(m.mean / MEAN) / 0.05) ** 2;
  if (m.low > -10) c += ((m.low + 10) / 3) ** 2; // little below 2 kHz
  if (m.narrow > 0.22) c += ((m.narrow - 0.22) / 0.02) ** 2; // still a fricative
  if (m.narrow < 0.1) c += ((0.1 - m.narrow) / 0.02) ** 2; // but not a closure
  if (m.lips < 0.5) c += ((0.5 - m.lips) / 0.1) ** 2; // lips rounded, not closed
  if (m.reach < 0.9) c += ((0.9 - m.reach) / 0.05) ** 2; // the jet still has its speed at the teeth
  if (m.back < 1.6 * m.narrow) c += ((1.6 * m.narrow - m.back) / (0.1 * m.narrow)) ** 2; // one clear constriction
  if (m.channel > 1) c += ((m.channel - 1) / 0.1) ** 2; // a short one
  // the place: /ʃ/ behind the alveolar ridge, /s/ at it
  const [t0, t1] = ph === 'ʃ' || ph === 'ʒ' ? [0.8, 1.8] : [0, 0.8];
  if (m.toTeeth < t0) c += ((t0 - m.toTeeth) / 0.1) ** 2;
  if (m.toTeeth > t1) c += ((m.toTeeth - t1) / 0.1) ** 2;
  keys.forEach((k, i) => {
    const [lo, hi] = ARTICULATOR_RANGES[k];
    if (x[i] < lo) c += ((lo - x[i]) / 0.05) ** 2;
    if (x[i] > hi) c += ((x[i] - hi) / 0.05) ** 2;
    c += 0.02 * ((x[i] - x0[i]) / 0.5) ** 2;
  });
  return c;
};
// the worst case over small movements of each articulator: the place of the
// narrowest passage must not jump (from the blade to the lips or the tongue
// body) when the posture is approached from a neighbouring sound
const NUDGE = 0.03;
const cost = (x: number[]) => {
  let c = pointCost(x);
  for (let i = 0; i < x.length; i++) {
    for (const d of [-NUDGE, NUDGE]) {
      const y = x.slice();
      y[i] += d;
      c = Math.max(c, pointCost(y));
    }
  }
  return c;
};

const fmt = (m: { peak: number; mean: number; low: number }) => `peak ${m.peak.toFixed(0)} mean ${m.mean.toFixed(0)} low ${m.low.toFixed(1)} dB`;
const p0 = predict(base);
const r0 = render(base);
console.log(`${ph} now:    predicted ${fmt(p0)} narrowest ${p0.narrow.toFixed(2)} toTeeth ${p0.toTeeth.toFixed(2)} reach ${p0.reach.toFixed(2)} | rendered ${fmt(r0)} level ${r0.level.toFixed(1)} dB re /a/`);
// several tip placements: the place of the narrowest passage jumps between the
// blade and the tip, a step the simplex cannot take
let best = { x: x0, fx: cost(x0), iters: 0 };
const iTipX = keys.indexOf('tipX'), iTipY = keys.indexOf('tipY');
for (const [tx, ty] of [[x0[iTipX], x0[iTipY]], [0.2, 1.1], [0.45, 0.8], [0.6, 0.6], [0.3, 1.4]]) {
  const s = x0.slice();
  if (iTipX >= 0) s[iTipX] = tx;
  if (iTipY >= 0) s[iTipY] = ty;
  let r = nelderMead(cost, s, keys.map(() => 0.2), 1500, 1e-7);
  r = nelderMead(cost, r.x, keys.map(() => 0.08), 1500, 1e-8);
  const m = predict(toArt(r.x));
  console.log(`  start tip ${tx}/${ty}: cost ${r.fx.toFixed(3)} ${fmt(m)} narrowest ${m.narrow.toFixed(2)} toTeeth ${m.toTeeth.toFixed(2)} lips ${m.lips.toFixed(2)} fc ${m.fc.toFixed(0)} reach ${m.reach.toFixed(2)} back ${(m.back / m.narrow).toFixed(2)}x channel ${m.channel.toFixed(2)}`);
  if (r.fx < best.fx) best = r;
}
const a = toArt(best.x);
const out: Partial<Articulators> = {};
keys.forEach((k) => { (out[k] as number) = Math.round((a[k] as number) * 1000) / 1000; });
const p1 = predict(a), r1 = render(a);
console.log(`${ph} fitted: predicted ${fmt(p1)} narrowest ${p1.narrow.toFixed(2)} toTeeth ${p1.toTeeth.toFixed(2)} | rendered ${fmt(r1)} level ${r1.level.toFixed(1)} dB re /a/`);
console.log(JSON.stringify(out));
