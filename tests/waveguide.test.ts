import { describe, it, expect } from 'vitest';
import { Waveguide } from '../src/dsp/tract/waveguide';
import { uniformTube, sectionsFromGeometry, AreaFunction, N_SECTIONS } from '../src/dsp/tract/areaFunction';
import { buildNasal, portArea, NasalSides } from '../src/dsp/tract/nasal';
import { formants, transferMagnitudes } from '../src/dsp/tract/acoustics';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { VOWELS, PHONEMES } from '../src/dsp/speech/phonemes';
import { MRI_VOWELS, mriAreaFunction } from '../src/dsp/data/mri';
import { getFFT } from '../src/dsp/util/fft';
import { C_SOUND } from '../src/dsp/constants';
import { VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { note, rmsDb } from './helpers';

/** Peaks of the waveguide's impulse response (lip + nostril flow) in Hz. */
function waveguidePeaks(af: AreaFunction, velum = 0, fmax = 4000, nose?: NasalSides, lossless = false, nasalLoss?: number): number[] {
  const fs = (N_SECTIONS * C_SOUND) / af.length;
  const nasal = buildNasal(af.dx, 1, portArea(velum, 0, 1), Math.round(0.43 * N_SECTIONS) - 1, undefined, nose);
  const wg = new Waveguide(N_SECTIONS, nasal.areas.length, nasal.coupling);
  if (lossless) { wg.lossParams.base = 0; wg.lossParams.narrow = 0; wg.lossParams.nasal = 0; wg.walls = false; }
  if (nasalLoss !== undefined) wg.lossParams.nasal = nasalLoss;
  wg.setGeometry(af, nasal, fs, 1);
  wg.rg = 1;
  const n = 1 << 15;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    wg.glottalInjection = i === 0 ? 1000 : 0;
    wg.step();
    re[i] = wg.lipFlow + wg.nosFlow;
  }
  getFFT(n).transform(re, im);
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  const peaks: number[] = [];
  for (let k = 2; k < n / 2 - 2; k++) {
    const f = (k * fs) / n;
    if (f > fmax) break;
    if (f < 100) continue;
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > mag[k - 2] && mag[k] >= mag[k + 2]) {
      const a = Math.log(mag[k - 1]), b = Math.log(mag[k]), c = Math.log(mag[k + 1]);
      const d = (0.5 * (a - c)) / (a - 2 * b + c);
      peaks.push(((k + d) * fs) / n);
    }
  }
  return peaks;
}

describe('real-time Kelly-Lochbaum waveguide', () => {
  it('uniform tube resonances agree with the reference model', () => {
    const af = uniformTube(17.5, 3);
    const wgp = waveguidePeaks(af);
    const ref = formants(af, {}).map((f) => f.f);
    note('KL uniform 17.5 cm', wgp.slice(0, 4).map((x) => x.toFixed(0)).join(' / ') + ` Hz (reference ${ref.slice(0, 4).map((x) => x.toFixed(0)).join(' / ')})`);
    for (let k = 0; k < 3; k++) expect(Math.abs(wgp[k] - ref[k]) / ref[k]).toBeLessThan(0.03);
  });

  it('articulated vowels: waveguide formants match the reference within a few percent', () => {
    for (const v of ['i', 'a', 'u', 'ɛ', 'o']) {
      const a = { ...DEFAULT_ARTICULATORS, ...VOWELS[v].art };
      const af = sectionsFromGeometry(computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH));
      const wgp = waveguidePeaks(af);
      const ref = formants(af, {}).map((f) => f.f);
      note(`KL vs reference /${v}/`, `${wgp.slice(0, 3).map((x) => x.toFixed(0)).join('/')} vs ${ref.slice(0, 3).map((x) => x.toFixed(0)).join('/')} Hz`);
      for (let k = 0; k < 3; k++) {
        const near = wgp.reduce((best, x) => (Math.abs(x - ref[k]) < Math.abs(best - ref[k]) ? x : best), Infinity);
        expect(Math.abs(near - ref[k]) / ref[k]).toBeLessThan(0.05);
      }
    }
  });

  it('measured MRI shapes: waveguide formants match the reference too', () => {
    let worst = 0;
    for (const v of MRI_VOWELS) {
      const af = mriAreaFunction(v);
      const wgp = waveguidePeaks(af);
      const ref = formants(af, {}).map((f) => f.f);
      for (let k = 0; k < 3; k++) {
        const near = wgp.reduce((best, x) => (Math.abs(x - ref[k]) < Math.abs(best - ref[k]) ? x : best), Infinity);
        worst = Math.max(worst, Math.abs(near - ref[k]) / ref[k]);
      }
    }
    note('KL vs reference on MRI shapes', `worst F1-F3 difference ${(100 * worst).toFixed(1)} % over 11 vowels`);
    expect(worst).toBeLessThan(0.05);
  });

  it('nasal murmur: the lowest resonance of /m n ŋ/ agrees in both models, low as measured', () => {
    // the bony nasal walls hardly yield: about 250-300 Hz in men (Stevens 1998);
    // soft walls, like the cheeks, would push it to about 390 Hz. With the
    // wall losses of the reference the two models agree closely; the extra
    // damping of the mucosa that sets the level of the hum (DEFAULT_LOSSES)
    // widens the resonance and moves its peak up a little.
    const rows: string[] = [];
    for (const ph of ['m', 'n', 'ŋ']) {
      const af = sectionsFromGeometry(computeGeometry({ ...DEFAULT_ARTICULATORS, ...PHONEMES[ph].art }, DEFAULT_ANATOMY, DEFAULT_TEETH));
      const same = waveguidePeaks(af, 1, 4000, undefined, false, 1)[0];
      const wg = waveguidePeaks(af, 1)[0];
      const ref = formants(af, { velum: 1 })[0].f;
      rows.push(`/${ph}/ ${same.toFixed(0)} (${wg.toFixed(0)} damped) vs ${ref.toFixed(0)}`);
      expect(Math.abs(same / ref - 1)).toBeLessThan(0.02);
      expect(Math.abs(wg / ref - 1)).toBeLessThan(0.06);
      expect(ref).toBeLessThan(340);
    }
    note('nasal murmur, waveguide vs reference', `lowest resonance ${rows.join(', ')} Hz`);
  });

  it('opening the velum adds nasal resonances and changes the spectrum', () => {
    const a = { ...DEFAULT_ARTICULATORS, ...VOWELS.a.art };
    const af = sectionsFromGeometry(computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH));
    const oral = formants(af, { velum: 0 });
    const nasal = formants(af, { velum: 1 });
    expect(nasal.length).toBeGreaterThan(oral.length - 1);
    // the lowest resonance shifts when the nose is coupled
    expect(Math.abs(nasal[0].f - oral[0].f)).toBeGreaterThan(20);
  });
});

describe('left and right nasal passages', () => {
  // an /m/ with the velum fully lowered, as the transfers below open the port
  const m = sectionsFromGeometry(computeGeometry({ ...DEFAULT_ARTICULATORS, ...PHONEMES.m.art, velum: 1 }, DEFAULT_ANATOMY, DEFAULT_TEETH));
  const open: NasalSides = { cycle: 0, nostrilLeft: 1, nostrilRight: 1 };
  /** peaks and dips of the transfer to lips + nostrils */
  const extrema = (nose: NasalSides, losses = true) => {
    const fr: number[] = [];
    for (let f = 100; f <= 4000; f += 10) fr.push(f);
    const mag = transferMagnitudes(m, fr, { velum: 1, nose, losses });
    const poles: number[] = [], zeros: number[] = [];
    for (let i = 1; i < fr.length - 1; i++) {
      if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1]) poles.push(fr[i]);
      if (mag[i] < mag[i - 1] && mag[i] <= mag[i + 1]) zeros.push(fr[i]);
    }
    return { poles, zeros };
  };
  const inBand = (x: number[], a: number, b: number) => x.filter((f) => f >= a && f < b).length;

  it('unequal passages add a pole-zero pair that equal ones lack (Dang et al. 1994)', () => {
    // the new pair lies close to the zero of the merged passages; the piriform
    // fossae bring the two together, and with the losses the pair is only a
    // shoulder on the slope: look for it in the lossless structure
    const eq = extrema(open, false), un = extrema({ ...open, cycle: 0.6 }, false);
    const pair = un.poles.filter((f) => f >= 1500 && f < 3000 && !eq.poles.some((g) => Math.abs(g - f) < 60));
    note('nasal cycle', `/m/ with one passage congested (cycle 0.6): new resonance at ${pair.join(', ')} Hz with its antiresonance; first resonance ${eq.poles[0]} -> ${un.poles[0]} Hz`);
    expect(inBand(un.poles, 1500, 3000)).toBe(inBand(eq.poles, 1500, 3000) + 1);
    expect(inBand(un.zeros, 1500, 3000)).toBe(inBand(eq.zeros, 1500, 3000) + 1);
  });

  it('a pinched nostril turns its passage into a closed side branch: a new low antiresonance', () => {
    const eq = extrema(open), pin = extrema({ ...open, nostrilLeft: 0 });
    note('pinched nostril', `/m/ with the left nostril pinched: first resonance ${eq.poles[0]} -> ${pin.poles[0]} Hz, new antiresonance at ${pin.zeros[0]} Hz`);
    expect(inBand(eq.zeros, 100, 700)).toBe(0);
    expect(inBand(pin.zeros, 100, 700)).toBe(1);
    expect(pin.poles[0]).toBeLessThan(eq.poles[0] - 30);
  });

  it('the waveguide follows the reference with a congested side and a half-pinched nostril', () => {
    const nose: NasalSides = { cycle: -0.5, nostrilLeft: 1, nostrilRight: 0.4 };
    // lossless; a pole almost cancelled by a zero (sinus and closed mouth,
    // near 700 Hz) leaves a peak too small to matter: within 30 dB only
    const all = formants(m, { velum: 1, nose, losses: false }, 3000);
    const top = Math.max(...all.map((f) => f.amp));
    const ref = all.filter((f) => f.amp > top * 10 ** (-30 / 20)).map((f) => f.f);
    const wg = waveguidePeaks(m, 1, 3000, nose, true);
    let worst = 0;
    for (const f of ref) worst = Math.max(worst, Math.min(...wg.map((g) => Math.abs(g / f - 1))));
    note('asymmetric nose, waveguide vs reference', `/m/, congested left side, right nostril 40 % open: ${ref.length} resonances below 3 kHz, worst difference ${(100 * worst).toFixed(2)} %`);
    expect(ref.length).toBeGreaterThan(5);
    expect(worst).toBeLessThan(0.01);
  });

  it('with both nostrils pinched a held /m/ has nowhere to send its air, and the hum dies', () => {
    const hum = (pinched: boolean) => {
      const p = defaultParams();
      p.articulators = { ...p.articulators, ...PHONEMES.m.art };
      p.voicing = true; p.phonate = true;
      if (pinched) { p.anatomy.nostrilLeft = 0; p.anatomy.nostrilRight = 0; }
      const e = new VoiceEngine(48000, p);
      e.snapArticulators(); e.snapPressure();
      const x = new Float32Array(48000);
      for (let i = 0; i < x.length; i += 128) e.process(x.subarray(i, i + 128), 128);
      return { level: rmsDb(x.subarray(24000)), t: e.telemetry() };
    };
    const a = hum(false), b = hum(true);
    note('pinched nose', `held /m/: nasal airflow ${a.t.uNose.toFixed(0)} -> ${b.t.uNose.toFixed(0)} cm^3/s, mouth pressure ${(b.t.po / 980).toFixed(1)} cmH2O (the lungs' 8), the hum ${b.level - a.level < -60 ? 'silent' : `${(b.level - a.level).toFixed(0)} dB`}`);
    expect(b.t.uNose).toBeLessThan(5);
    expect(b.level).toBeLessThan(a.level - 20);
  });
});
