import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { welch } from '../src/dsp/util/fft';
import { setEnglishLexicon } from '../src/dsp/speech/english';

/** Loads the American English lexicon (as the browser does on demand); returns the word count. */
export function loadEnglishLexicon(): number {
  return setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));
}

/** Records validation numbers so that they can be printed in one table. */
export const report: Record<string, string> = {};
export function note(key: string, value: string): void {
  report[key] = value;
  // eslint-disable-next-line no-console
  console.log(`[validation] ${key}: ${value}`);
}

/** Band-averaged power (linear) between f0 and f1 of a signal. */
export function bandPower(signal: ArrayLike<number>, fs: number, f0: number, f1: number, nfft = 2048): number {
  const p = welch(signal, nfft);
  let acc = 0, n = 0;
  for (let k = 1; k < p.length; k++) {
    const f = (k * fs) / nfft;
    if (f >= f0 && f < f1) { acc += p[k]; n++; }
  }
  return n ? acc / n : 0;
}

/** Frequency of the spectral maximum within [f0, f1] after smoothing (Hz). */
export function spectralPeak(signal: ArrayLike<number>, fs: number, f0: number, f1: number, nfft = 1024): number {
  const p = welch(signal, nfft);
  const sm = new Float64Array(p.length);
  for (let k = 0; k < p.length; k++) {
    let a = 0, c = 0;
    for (let j = -2; j <= 2; j++) { const q = k + j; if (q >= 0 && q < p.length) { a += p[q]; c++; } }
    sm[k] = a / c;
  }
  let best = 0, bf = 0;
  for (let k = 1; k < sm.length; k++) {
    const f = (k * fs) / nfft;
    if (f < f0 || f > f1) continue;
    if (sm[k] > best) { best = sm[k]; bf = f; }
  }
  return bf;
}

export function spectralCentroid(signal: ArrayLike<number>, fs: number, f0: number, f1: number, nfft = 2048): number {
  const p = welch(signal, nfft);
  let num = 0, den = 0;
  for (let k = 1; k < p.length; k++) {
    const f = (k * fs) / nfft;
    if (f < f0 || f > f1) continue;
    num += f * p[k]; den += p[k];
  }
  return num / den;
}

export function rmsDb(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / x.length + 1e-30);
}
