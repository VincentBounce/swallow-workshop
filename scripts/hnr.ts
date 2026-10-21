/**
 * Harmonics-to-noise ratio of the voiced frames of WAV files (autocorrelation
 * at the period, Boersma 1993 style), full band and above 2 kHz, plus the
 * pitch range in semitones: a quick check of how clean and how lively a voice is.
 *   npx tsx scripts/hnr.ts a.wav b.wav
 */
import { readFileSync } from 'node:fs';
import { decodeWav } from '../src/dsp/util/wav';
import { yin } from '../src/dsp/analysis/pitch';
import { hann } from '../src/dsp/util/fft';

function highpass(x: Float32Array, fs: number, fc: number): Float32Array {
  // 4th-order: two cascaded 2nd-order Butterworth sections (RBJ)
  let y = Float32Array.from(x);
  for (let s = 0; s < 2; s++) {
    const w = (2 * Math.PI * fc) / fs, q = Math.SQRT1_2, al = Math.sin(w) / (2 * q), c = Math.cos(w);
    const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = (1 + c) / 2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    const out = new Float32Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = (b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v; out[i] = v;
    }
    y = out;
  }
  return y;
}

function hnrAt(x: Float32Array, s0: number, n: number, lag: number): number {
  const w = hann(n);
  const f = new Float64Array(n + lag);
  for (let i = 0; i < n + lag; i++) f[i] = (x[s0 + i] ?? 0) * (i < n ? w[i] : w[i - lag]);
  let r0 = 0, r1 = 0, e1 = 0;
  for (let i = 0; i < n; i++) { r0 += f[i] * f[i]; r1 += f[i] * (x[s0 + i + lag] ?? 0) * w[i]; e1 += ((x[s0 + i + lag] ?? 0) * w[i]) ** 2; }
  const r = r1 / Math.sqrt(r0 * e1 + 1e-20);
  const rc = Math.min(0.9999, Math.max(1e-4, r));
  return 10 * Math.log10(rc / (1 - rc));
}

for (const file of process.argv.slice(2)) {
  const { samples, fs } = decodeWav(readFileSync(file));
  const hp = highpass(samples, fs, 2000);
  const n = Math.round(0.04 * fs), hop = Math.round(0.01 * fs);
  const full: number[] = [], high: number[] = [], f0s: number[] = [];
  for (let s0 = 0; s0 + n * 2 < samples.length; s0 += hop) {
    const r = yin(samples.subarray(s0, s0 + n), fs, 60, 450);
    if (r.confidence < 0.85 || r.f0 <= 0) continue;
    let e = 0; for (let i = 0; i < n; i++) e += samples[s0 + i] ** 2;
    if (e / n < 1e-6) continue;
    const lag = Math.round(fs / r.f0);
    full.push(hnrAt(samples, s0, n, lag));
    high.push(hnrAt(hp, s0, n, lag));
    f0s.push(r.f0);
  }
  const med = (a: number[]) => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)] ?? NaN; };
  const pct = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) * p)] ?? NaN; };
  const range = 12 * Math.log2(pct(f0s, 0.95) / pct(f0s, 0.05));
  console.log(`${file.split(/[\\/]/).pop()}: ${full.length} voiced frames, HNR median ${med(full).toFixed(1)} dB, above 2 kHz ${med(high).toFixed(1)} dB, F0 ${pct(f0s, 0.05).toFixed(0)}-${pct(f0s, 0.95).toFixed(0)} Hz (${range.toFixed(1)} st, 5-95 %)`);
}
