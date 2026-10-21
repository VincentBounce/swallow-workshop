import { getFFT, hann } from '../dsp/util/fft';
import { lfDerivative, rdToTiming, solveLF, timingFromQuotients } from '../dsp/glottis/lf';
import { transferMagnitudes } from '../dsp/tract/acoustics';
import { portArea } from '../dsp/tract/nasal';
import type { EngineParams } from '../dsp/engine/params';
import type { AreaFunction } from '../dsp/tract/areaFunction';
import { lpcFormants, decimate } from '../dsp/analysis/lpc';
import { yin } from '../dsp/analysis/pitch';

const windows = new Map<number, Float64Array>();
function win(n: number): Float64Array {
  let w = windows.get(n);
  if (!w) { w = hann(n); windows.set(n, w); }
  return w;
}

/** Power spectrum in dB (one-sided, fftSize/2+1 bins) of the last `n` samples of x. */
export function spectrumDb(x: ArrayLike<number>, n: number, fftSize: number, out?: Float32Array): Float32Array {
  const fft = getFFT(fftSize);
  const re = new Float64Array(fftSize), im = new Float64Array(fftSize);
  const w = win(n);
  let ws = 0;
  const off = x.length - n;
  for (let i = 0; i < n; i++) { re[i] = x[off + i] * w[i]; ws += w[i]; }
  fft.transform(re, im);
  const res = out ?? new Float32Array(fftSize / 2 + 1);
  const norm = 4 / (ws * ws);
  for (let k = 0; k <= fftSize / 2; k++) res[k] = 10 * Math.log10((re[k] * re[k] + im[k] * im[k]) * norm + 1e-14);
  return res;
}

const sourceCache = new Map<string, Float64Array>();

/**
 * Relative amplitudes |E_k| of the harmonics of the LF flow derivative (one
 * period, exact harmonic DFT), for the predicted spectrum of the source.
 */
export function sourceHarmonics(p: EngineParams, count: number): Float64Array {
  const s = p.source;
  const timing = s.advanced ? timingFromQuotients(s.oq, s.alphaM, s.ra) : rdToTiming(s.rd);
  const key = `${timing.tp.toFixed(4)}|${timing.te.toFixed(4)}|${timing.ta.toFixed(4)}|${count}`;
  const hit = sourceCache.get(key);
  if (hit) return hit;
  const sh = solveLF(timing);
  const N = 2048;
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = lfDerivative(sh, i / N);
  const res = new Float64Array(count + 1);
  for (let k = 1; k <= count; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const a = (2 * Math.PI * k * i) / N; re += x[i] * Math.cos(a); im -= x[i] * Math.sin(a); }
    res[k] = Math.hypot(re, im) / N;
  }
  if (sourceCache.size > 64) sourceCache.clear();
  sourceCache.set(key, res);
  return res;
}

let envKey = '';
let envCache: { freqs: Float64Array; mag: Float64Array } | null = null;

/** |U_out / U_g| of the reference acoustic model on a frequency grid (cached by geometry). */
export function filterResponse(af: AreaFunction, p: EngineParams, velum: number, fmax: number, n = 256): { freqs: Float64Array; mag: Float64Array } {
  let key = `${fmax}|${n}|${velum.toFixed(3)}|${p.anatomy.nasalLeak}|${p.anatomy.scale}|${af.length.toFixed(3)}|`;
  for (let i = 0; i < af.areas.length; i += 1) key += af.areas[i].toFixed(3) + ',';
  if (key === envKey && envCache) return envCache;
  const freqs = new Float64Array(n);
  for (let i = 0; i < n; i++) freqs[i] = 20 + ((fmax - 20) * i) / (n - 1);
  const mag = transferMagnitudes(af, freqs, { port: portArea(velum, p.anatomy.nasalLeak, p.anatomy.scale), scale: p.anatomy.scale });
  envKey = key;
  envCache = { freqs, mag };
  return envCache;
}

/** Formants (LPC) and F0 (YIN) of a microphone frame. */
export function analyseMic(x: Float32Array, fs: number): { f1: number; f2: number; f3: number; f0: number; level: number } | null {
  let e = 0;
  for (const v of x) e += v * v;
  const level = 10 * Math.log10(e / x.length + 1e-12);
  if (level < -50) return null;
  const f0 = yin(x.subarray(0, 2048), fs, 60, 600, 0.2);
  const factor = Math.max(1, Math.round(fs / 11025));
  const d = decimate(x, factor);
  const frame = d.subarray(Math.max(0, d.length - 512));
  const fm = lpcFormants(frame, fs / factor, 12).filter((f) => f.f > 180 && f.f < 4500);
  if (fm.length < 2) return null;
  return { f1: fm[0].f, f2: fm[1].f, f3: fm[2]?.f ?? 0, f0: f0.confidence > 0.5 ? f0.f0 : 0, level };
}
