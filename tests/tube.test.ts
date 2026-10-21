import { describe, it, expect } from 'vitest';
import { uniformTube } from '../src/dsp/tract/areaFunction';
import { formants, standingWave } from '../src/dsp/tract/acoustics';
import { note } from './helpers';

describe('frequency-domain tube model', () => {
  it('uniform 17.5 cm tube, closed at the glottis, ideal open end: 500/1500/2500 Hz', () => {
    const af = uniformTube(17.5, 3);
    const f = formants(af, { losses: false, radiation: 'ideal' });
    note('uniform 17.5 cm, lossless, ideal end', f.slice(0, 3).map((x) => x.f.toFixed(1)).join(' / ') + ' Hz');
    expect(f[0].f).toBeCloseTo(500, -0.5);
    expect(Math.abs(f[0].f - 500)).toBeLessThan(3);
    expect(Math.abs(f[1].f - 1500)).toBeLessThan(6);
    expect(Math.abs(f[2].f - 2500)).toBeLessThan(10);
  });

  it('with wall/viscous/thermal losses and lip radiation stays near the quarter-wave pattern', () => {
    const af = uniformTube(17.5, 3);
    const f = formants(af, {});
    note('uniform 17.5 cm, lossy + piston radiation',
      f.slice(0, 4).map((x) => `${x.f.toFixed(0)} (B=${x.bw.toFixed(0)})`).join(' / ') + ' Hz');
    // radiation adds an end correction (~0.8 r) that lowers the resonances slightly;
    // yielding walls raise F1 a little (Fant 1960; Sondhi & Schroeter 1987)
    expect(f[0].f).toBeGreaterThan(470);
    expect(f[0].f).toBeLessThan(530);
    expect(f[1].f).toBeGreaterThan(1400);
    expect(f[1].f).toBeLessThan(1530);
    expect(f[2].f).toBeGreaterThan(2350);
    expect(f[2].f).toBeLessThan(2560);
    // realistic formant bandwidths (tens of Hz, growing with frequency at the top)
    expect(f[0].bw).toBeGreaterThan(20);
    expect(f[0].bw).toBeLessThan(150);
  });

  it('resonances scale inversely with tract length', () => {
    const lengths = [12, 14.5, 17.5, 20];
    const f1s = lengths.map((L) => formants(uniformTube(L, 3), { losses: false, radiation: 'ideal' })[0].f);
    note('F1 vs length (lossless)', lengths.map((L, i) => `${L} cm: ${f1s[i].toFixed(0)} Hz`).join(', '));
    for (let i = 0; i < lengths.length; i++) {
      expect(f1s[i] * lengths[i]).toBeCloseTo(f1s[2] * lengths[2], -1);
      expect(Math.abs(f1s[i] - 35000 / (4 * lengths[i])) / (35000 / (4 * lengths[i]))).toBeLessThan(0.006);
    }
    // with radiation and losses the inverse scaling still holds within ~3 %
    const lossy = lengths.map((L) => formants(uniformTube(L, 3), {})[1].f);
    for (let i = 0; i < lengths.length; i++) {
      expect(Math.abs((lossy[i] * lengths[i]) / (lossy[2] * lengths[2]) - 1)).toBeLessThan(0.03);
    }
  });

  it('standing wave of F1 in a uniform tube: pressure maximum at the glottis, node at the lips', () => {
    const af = uniformTube(17.5, 3);
    const sw = standingWave(af, 500, { losses: false, radiation: 'ideal' });
    expect(sw.p[0]).toBeGreaterThan(0.99);
    expect(sw.p[af.areas.length]).toBeLessThan(0.02);
    expect(sw.u[af.areas.length]).toBeGreaterThan(0.99);
  });

  it('a narrow front tube and wide back (Helmholtz-like /i/) separates F1 low and F2 high', () => {
    const af = uniformTube(17.5, 6);
    for (let i = 26; i < 38; i++) af.areas[i] = 0.25;
    for (let i = 38; i < 44; i++) af.areas[i] = 2;
    const f = formants(af, {});
    // F1: Helmholtz resonance of the back cavity with the narrow neck;
    // F2: half-wave resonance of the 10 cm back cavity (c / 2L ~ 1700 Hz)
    expect(f[0].f).toBeLessThan(330);
    expect(f[1].f).toBeGreaterThan(1600);
  });
});
