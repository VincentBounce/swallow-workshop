import { describe, it, expect } from 'vitest';
import { renderOffline, VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams, EngineParams } from '../src/dsp/engine/params';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { ShapedNoise, colourCurve } from '../src/dsp/noise/noise';
import { welch } from '../src/dsp/util/fft';
import { linearFit } from '../src/dsp/util/math';
import { note, spectralPeak, spectralCentroid, rmsDb, bandPower } from './helpers';

function phonemeParams(ph: string): EngineParams {
  const p = defaultParams();
  const P = PHONEMES[ph];
  p.articulators = { ...p.articulators, ...P.art };
  p.abduction = P.abduction;
  p.voicing = P.voiced;
  p.phonate = true;
  return p;
}

function render(ph: string, mod?: (p: EngineParams) => void): Float32Array {
  const p = phonemeParams(ph);
  mod?.(p);
  return renderOffline(p, 0.8).out.subarray(12000);
}

describe('fricative noise from flow, constriction and teeth', () => {
  const fs = 48000;
  const s = render('s'), sh = render('ʃ'), f = render('f'), a = render('a');
  const pS = spectralPeak(s, fs, 1500, 11000), pSh = spectralPeak(sh, fs, 1500, 11000);
  const cS = spectralCentroid(s, fs, 1000, 11000), cSh = spectralCentroid(sh, fs, 1000, 11000), cF = spectralCentroid(f, fs, 1000, 11000);

  it('/s/ peaks between 4 and 8 kHz', () => {
    note('/s/ spectrum', `peak ${pS.toFixed(0)} Hz, centroid ${cS.toFixed(0)} Hz, level ${(rmsDb(s) - rmsDb(a)).toFixed(1)} dB re /a/`);
    expect(pS).toBeGreaterThan(4000);
    expect(pS).toBeLessThan(8000);
  });

  it('/ʃ/ peaks lower, around 2.5-4 kHz', () => {
    note('/ʃ/ spectrum', `peak ${pSh.toFixed(0)} Hz, centroid ${cSh.toFixed(0)} Hz, level ${(rmsDb(sh) - rmsDb(a)).toFixed(1)} dB re /a/`);
    expect(pSh).toBeGreaterThan(2400);
    expect(pSh).toBeLessThan(4200);
    expect(cSh).toBeLessThan(cS);
  });

  it('/f/ is weak and spectrally flat (no front cavity)', () => {
    // flatness: band levels between 2 and 10 kHz stay within a narrow range
    const bands = [2000, 3000, 4500, 6500, 10000];
    const lv: number[] = [];
    for (let i = 0; i < bands.length - 1; i++) lv.push(10 * Math.log10(bandPower(f, fs, bands[i], bands[i + 1])));
    const spread = Math.max(...lv) - Math.min(...lv);
    const sLv: number[] = [];
    for (let i = 0; i < bands.length - 1; i++) sLv.push(10 * Math.log10(bandPower(s, fs, bands[i], bands[i + 1])));
    const sSpread = Math.max(...sLv) - Math.min(...sLv);
    note('/f/ spectrum', `centroid ${cF.toFixed(0)} Hz, band spread 2-10 kHz ${spread.toFixed(1)} dB (s: ${sSpread.toFixed(1)} dB), level ${(rmsDb(f) - rmsDb(a)).toFixed(1)} dB re /a/, ${(rmsDb(f) - rmsDb(s)).toFixed(1)} dB re /s/`);
    expect(rmsDb(f)).toBeLessThan(rmsDb(s) - 6);
    expect(spread).toBeLessThan(sSpread);
    expect(spread).toBeLessThan(10);
  });

  it('opening the teeth slit weakens the sibilant obstacle source', () => {
    const open = render('s', (p) => { p.teeth.slitOpen = 0.6; });
    const closed = s;
    const hiOpen = bandPower(open, fs, 4000, 10000), hiClosed = bandPower(closed, fs, 4000, 10000);
    note('teeth slit', `opening the incisal slit by 6 mm changes the 4-10 kHz energy by ${(10 * Math.log10(hiOpen / hiClosed)).toFixed(1)} dB`);
    expect(hiOpen).toBeLessThan(hiClosed);
  });

  it('a voiceless fricative has no harmonics; voicing adds them (s vs z)', () => {
    const z = render('z');
    const lowS = bandPower(s, fs, 80, 400), lowZ = bandPower(z, fs, 80, 400);
    expect(lowZ).toBeGreaterThan(lowS * 10);
  });
});

describe('breathy voice and pulsed aspiration', () => {
  const fs = 48000;
  it('a posterior chink adds noise between the harmonics', () => {
    const modal = render('a');
    const breathy = render('a', (p) => { p.source.chink = 0.12; p.source.rd = 2.2; });
    // high-frequency energy relative to the fundamental region
    const ratio = (x: Float32Array) => bandPower(x, fs, 3000, 8000) / bandPower(x, fs, 80, 1000);
    const rModal = ratio(modal), rBreathy = ratio(breathy);
    note('breathiness', `HF/LF energy ratio rises by ${(10 * Math.log10(rBreathy / rModal)).toFixed(1)} dB with a 0.12 cm^2 chink and Rd 2.2`);
    expect(rBreathy).toBeGreaterThan(rModal);
  });

  it('shimmer and jitter leave no clicks at the period boundaries', () => {
    // a new period amplitude must not shift the subtracted pulse mean in one step
    const off = (p: EngineParams) => { p.noise.aspirationOn = false; };
    const hf = (x: Float32Array) => bandPower(x, fs, 8000, 16000) / bandPower(x, fs, 80, 1000);
    const clean = hf(render('a', (p) => { off(p); p.source.jitter = 0; p.source.shimmer = 0; }));
    const shaky = hf(render('a', (p) => { off(p); p.source.jitter = 1; p.source.shimmer = 6; }));
    const d = 10 * Math.log10(shaky / clean);
    note('period boundaries', `8-16 kHz energy with jitter 1 % and shimmer 6 %: ${d >= 0 ? '+' : ''}${d.toFixed(1)} dB re a steady voice`);
    expect(d).toBeLessThan(3);
  });

  it('a voice onset has no comb at the 1.5 kHz control rate', () => {
    // lungs and folds start from rest: the control values change quickly, and
    // held as steps they would modulate the pulses at 1.5 kHz
    const p = phonemeParams('a');
    p.noise.aspirationOn = false;
    const e = new VoiceEngine(fs, p);
    e.snapArticulators();
    const x = new Float32Array(Math.round(0.06 * fs));
    for (let i = 0; i < x.length; i += 128) e.process(x.subarray(i, Math.min(x.length, i + 128)));
    const onset = x.subarray(0, Math.round(0.05 * fs));
    const d = 10 * Math.log10(bandPower(onset, fs, 3000, 8000, 1024) / bandPower(onset, fs, 80, 1000, 1024));
    note('control rate', `voice onset: 3-8 kHz ${d.toFixed(1)} dB re 0-1 kHz`);
    expect(d).toBeLessThan(-18);
  });

  it('aspiration noise is modulated by the glottal cycle when pulsed', () => {
    // envelope modulation of the high-passed noise at F0
    const env = (pulse: number) => {
      const x = render('a', (p) => { p.source.chink = 0.1; p.voicing = true; p.noise.aspirationPulse = pulse; p.noise.aspiration = 18; });
      // crude high-pass by first difference, then envelope
      const e = new Float64Array(x.length);
      for (let i = 1; i < x.length; i++) e[i] = Math.abs(x[i] - x[i - 1]);
      // modulation depth via the F0 component of the envelope
      const f0 = 120;
      let re = 0, im = 0, m = 0;
      for (let i = 0; i < e.length; i++) { re += e[i] * Math.cos((2 * Math.PI * f0 * i) / fs); im += e[i] * Math.sin((2 * Math.PI * f0 * i) / fs); m += e[i]; }
      return Math.hypot(re, im) / m;
    };
    const steady = env(0), pulsed = env(1);
    note('aspiration modulation', `F0 envelope depth steady ${steady.toFixed(3)}, pulsed ${pulsed.toFixed(3)}`);
    expect(pulsed).toBeGreaterThan(steady);
  });
});

describe('user-shaped noise generator', () => {
  it('pink noise follows -3 dB/octave', () => {
    const n = new ShapedNoise(1024);
    n.setSpectrum(colourCurve('pink'), 20, 20000);
    const fs = 48000;
    const x = new Float64Array(fs * 2);
    for (let i = 0; i < x.length; i++) x[i] = n.next(fs);
    const p = welch(x, 4096);
    const xs: number[] = [], ys: number[] = [];
    for (let k = 4; k < p.length; k++) {
      const f = (k * fs) / 4096;
      if (f < 200 || f > 12000) continue;
      xs.push(Math.log2(f)); ys.push(10 * Math.log10(p[k]));
    }
    const sl = linearFit(xs, ys)[1];
    note('pink noise slope', `${sl.toFixed(2)} dB/oct`);
    expect(sl).toBeGreaterThan(-3.6);
    expect(sl).toBeLessThan(-2.4);
    // unit variance
    let v = 0;
    for (const s of x) v += s * s;
    expect(v / x.length).toBeGreaterThan(0.6);
    expect(v / x.length).toBeLessThan(1.4);
  });
});
