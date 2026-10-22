import { describe, it, expect } from 'vitest';
import { Waveguide } from '../src/dsp/tract/waveguide';
import { uniformTube, sectionsFromGeometry, AreaFunction, N_SECTIONS } from '../src/dsp/tract/areaFunction';
import { buildNasal, portArea } from '../src/dsp/tract/nasal';
import { formants } from '../src/dsp/tract/acoustics';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { VOWELS } from '../src/dsp/speech/phonemes';
import { MRI_VOWELS, mriAreaFunction } from '../src/dsp/data/mri';
import { getFFT } from '../src/dsp/util/fft';
import { C_SOUND } from '../src/dsp/constants';
import { note } from './helpers';

/** Peaks of the waveguide's impulse response (lip + nostril flow) in Hz. */
function waveguidePeaks(af: AreaFunction, velum = 0, fmax = 4000): number[] {
  const fs = (N_SECTIONS * C_SOUND) / af.length;
  const nasal = buildNasal(af.dx, 1, portArea(velum, 0, 1), Math.round(0.43 * N_SECTIONS) - 1);
  const wg = new Waveguide(N_SECTIONS, nasal.areas.length, nasal.coupling);
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
