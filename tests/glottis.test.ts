import { describe, it, expect } from 'vitest';
import { solveLF, rdToTiming, lfFlow, lfDerivative, LFShape } from '../src/dsp/glottis/lf';
import { linearFit } from '../src/dsp/util/math';
import { renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { VOWELS } from '../src/dsp/speech/phonemes';
import { note } from './helpers';

const N = 960; // samples per period, F0 = 100 Hz at 96 kHz: harmonics fall exactly on DFT bins

function period(sh: LFShape, fn: (s: LFShape, t: number) => number): Float64Array {
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = fn(sh, i / N);
  return x;
}

function harmonic(x: Float64Array, k: number): number {
  let re = 0, im = 0;
  for (let i = 0; i < N; i++) {
    re += x[i] * Math.cos((2 * Math.PI * k * i) / N);
    im -= x[i] * Math.sin((2 * Math.PI * k * i) / N);
  }
  return Math.hypot(re, im);
}

function slope(x: Float64Array, f0: number, fa: number, fb: number): number {
  const xs: number[] = [], ys: number[] = [];
  for (let k = 1; k * f0 <= fb; k++) {
    if (k * f0 < fa) continue;
    xs.push(Math.log2(k * f0));
    ys.push(20 * Math.log10(harmonic(x, k)));
  }
  return linearFit(xs, ys)[1];
}

describe('Liljencrants-Fant glottal flow model', () => {
  it('Rd maps to the expected open quotient and asymmetry (Fant 1995)', () => {
    const modal = rdToTiming(1);
    expect(modal.te).toBeGreaterThan(0.6);
    expect(modal.te).toBeLessThan(0.7);
    expect(modal.tp / modal.te).toBeGreaterThan(0.7);
    const pressed = rdToTiming(0.4), breathy = rdToTiming(2.5);
    expect(pressed.te).toBeLessThan(modal.te);
    expect(breathy.te).toBeGreaterThan(modal.te);
    expect(breathy.ta).toBeGreaterThan(modal.ta);
  });

  it('flow returns to zero at the end of the period and the derivative reaches -Ee at te', () => {
    for (const rd of [0.4, 1, 2, 2.7]) {
      const sh = solveLF(rdToTiming(rd));
      expect(Math.abs(lfFlow(sh, 0.999999))).toBeLessThan(1e-6 * sh.upeak + 1e-9);
      expect(lfDerivative(sh, sh.te)).toBeCloseTo(-1, 6);
      // flow peak at tp: derivative crosses zero there
      expect(Math.abs(lfDerivative(sh, sh.tp))).toBeLessThan(1e-6);
    }
  });

  it('flow-derivative spectrum falls about 12 dB/octave at high frequencies (modal voice)', () => {
    const sh = solveLF(rdToTiming(1));
    const e = period(sh, lfDerivative);
    const u = period(sh, lfFlow);
    const se = slope(e, 100, 1000, 5000);
    const su = slope(u, 100, 1000, 5000);
    note('LF Rd=1 spectral slope 1-5 kHz', `derivative ${se.toFixed(1)} dB/oct, flow ${su.toFixed(1)} dB/oct`);
    expect(se).toBeGreaterThan(-14);
    expect(se).toBeLessThan(-10);
    expect(su - se).toBeGreaterThan(-6.5);
    expect(su - se).toBeLessThan(-5.5);
  });

  it('breathier voice (higher Rd) has a stronger fundamental relative to H2 (H1-H2)', () => {
    const h12 = (rd: number) => {
      const e = period(solveLF(rdToTiming(rd)), lfDerivative);
      return 20 * Math.log10(harmonic(e, 1) / harmonic(e, 2));
    };
    const p = h12(0.5), m = h12(1), b = h12(2.5);
    note('LF H1-H2 (derivative)', `Rd 0.5: ${p.toFixed(1)} dB, Rd 1: ${m.toFixed(1)} dB, Rd 2.5: ${b.toFixed(1)} dB`);
    expect(p).toBeLessThan(m);
    expect(m).toBeLessThan(b);
  });
});

describe('self-oscillating two-mass vocal folds', () => {
  function run(q: number, ps: number, auto = false, f0 = 120) {
    const p = defaultParams();
    p.articulators = { ...p.articulators, ...VOWELS.a.art };
    p.phonate = true;
    p.source.model = 'twomass';
    p.source.tensionAuto = auto;
    p.source.q = q;
    p.source.f0 = f0;
    p.source.ps = ps;
    const { out, engine } = renderOffline(p, 1.0);
    let s = 0;
    for (let i = 24000; i < 48000; i++) s += out[i] * out[i];
    return { f0: engine.telemetry().f0, rms: Math.sqrt(s / 24000) };
  }

  it('oscillates from lung pressure alone, and pitch rises with fold tension', () => {
    const lo = run(0.7, 8), mid = run(1.2, 8), hi = run(1.8, 8);
    note('two-mass F0 vs tension Q', `Q 0.7: ${lo.f0.toFixed(0)} Hz, Q 1.2: ${mid.f0.toFixed(0)} Hz, Q 1.8: ${hi.f0.toFixed(0)} Hz`);
    expect(lo.f0).toBeGreaterThan(60);
    expect(mid.f0).toBeGreaterThan(lo.f0 * 1.3);
    expect(hi.f0).toBeGreaterThan(mid.f0 * 1.2);
    expect(lo.rms).toBeGreaterThan(1e-3);
  });

  it('the tension controller follows a target pitch', () => {
    for (const target of [100, 220]) {
      const r = run(1, 8, true, target);
      expect(Math.abs(r.f0 - target) / target).toBeLessThan(0.04);
    }
  });

  it('no airflow, no voice', () => {
    const r = run(1, 0);
    expect(r.rms).toBeLessThan(1e-4);
  });
});
