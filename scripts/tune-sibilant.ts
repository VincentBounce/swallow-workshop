/**
 * Fits a held sibilant to the spectrum measured on real speakers: the peak and
 * the spectral mean of its noise (Jongman et al. 2000: /ʃ/ peak about 3.8 kHz
 * and mean 4.2 kHz over both sexes, lower for men; /s/ mean 6.1 kHz), and
 * little energy below 2 kHz. The search runs on the frequency-domain model:
 * the transfer from the incisors to the radiated pressure, with the jet
 * resistances, times the obstacle source spectrum (a first-order low-pass at
 * 0.15 v / slit height). It starts from several tongue-tip placements, keeps
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
import { kineticResistances } from '../src/dsp/aero/aero';
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
  let narrow = Infinity, at = 0;
  for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6 && g.hits[i].area < narrow) { narrow = g.hits[i].area; at = g.s[i]; }
  let exitS = at;
  for (let i = 0; i <= g.lastRay; i++) { if (g.s[i] <= at) continue; if (g.hits[i].area > 2.2 * Math.max(narrow, 1e-3)) { exitS = g.s[i]; break; } }
  return { g, narrow, at, toTeeth: g.teethPos - exitS };
}

/** Predicted radiated power spectrum (frequency model) and its measures. */
function predict(a: Articulators) {
  const { g, narrow, at, toTeeth } = geometry(a);
  const af = sectionsFromGeometry(g);
  // Bernoulli orifices in series: intraoral pressure and jet speed
  const ac = Math.max(narrow, 1e-3);
  const po = (ps * ag * ag) / (ag * ag + ac * ac);
  const v = Math.sqrt((2 * po) / RHO);
  const dh = 2 * Math.sqrt(ac / Math.PI);
  const vt = toTeeth < 5 * dh ? v : (v * 5 * dh) / toTeeth;
  const width = dh + 0.22 * toTeeth;
  const fc = (0.15 * vt) / Math.max(Math.min(g.slit.height, width), 0.05);
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
  return { peak: pk, mean: m1 / m0, low: 10 * Math.log10(lo / nlo / (mid / nmid)), narrow, toTeeth, lips: g.lipArea, fc };
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
const cost = (x: number[]) => {
  const m = predict(toArt(x));
  let c = (Math.log(m.peak / PEAK) / 0.1) ** 2 + (Math.log(m.mean / MEAN) / 0.05) ** 2;
  if (m.low > -10) c += ((m.low + 10) / 3) ** 2; // little below 2 kHz
  if (m.narrow > 0.22) c += ((m.narrow - 0.22) / 0.02) ** 2; // still a fricative
  if (m.narrow < 0.1) c += ((0.1 - m.narrow) / 0.02) ** 2; // but not a closure
  if (m.lips < 0.5) c += ((0.5 - m.lips) / 0.1) ** 2; // lips rounded, not closed
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

const fmt = (m: { peak: number; mean: number; low: number }) => `peak ${m.peak.toFixed(0)} mean ${m.mean.toFixed(0)} low ${m.low.toFixed(1)} dB`;
const p0 = predict(base);
console.log(`${ph} now:    predicted ${fmt(p0)} narrowest ${p0.narrow.toFixed(2)} toTeeth ${p0.toTeeth.toFixed(2)} | rendered ${fmt(render(base))}`);
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
  console.log(`  start tip ${tx}/${ty}: cost ${r.fx.toFixed(3)} ${fmt(m)} narrowest ${m.narrow.toFixed(2)} toTeeth ${m.toTeeth.toFixed(2)} lips ${m.lips.toFixed(2)} fc ${m.fc.toFixed(0)}`);
  if (r.fx < best.fx) best = r;
}
const a = toArt(best.x);
const out: Partial<Articulators> = {};
keys.forEach((k) => { (out[k] as number) = Math.round((a[k] as number) * 1000) / 1000; });
const p1 = predict(a), r1 = render(a);
console.log(`${ph} fitted: predicted ${fmt(p1)} narrowest ${p1.narrow.toFixed(2)} toTeeth ${p1.toTeeth.toFixed(2)} | rendered ${fmt(r1)} level ${r1.level.toFixed(1)} dB re /a/`);
console.log(JSON.stringify(out));
