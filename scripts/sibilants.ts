/**
 * Spectrum of the hissing frames of recordings, found without labels: the
 * 20 ms frames whose 3-11 kHz energy is 10 dB above their 0.1-1 kHz energy.
 * Prints the peak and the spectral mean (1-11 kHz) of their average spectrum,
 * to compare a synthetic /s/ with a real one (/s z/: peak about 4-5 kHz, mean
 * 5-6 kHz; /ʃ ʒ/: peak 2.5-3 kHz, mean 4-4.5 kHz; Jongman 2024).
 *   npx tsx scripts/sibilants.ts a.wav b.wav
 */
import { readFileSync } from 'node:fs';
import { decodeWav } from '../src/dsp/util/wav';
import { powerSpectrum, hann } from '../src/dsp/util/fft';

for (const file of process.argv.slice(2)) {
  const { samples, fs } = decodeWav(readFileSync(file));
  const n = Math.round(0.02 * fs);
  let nfft = 1; while (nfft < n) nfft *= 2;
  const w = hann(n);
  const df = fs / nfft;
  const avg = new Float64Array(nfft / 2 + 1);
  let frames = 0;
  const band = (p: Float64Array, lo: number, hi: number) => { let s = 0; for (let k = Math.round(lo / df); k <= Math.min(p.length - 1, Math.round(hi / df)); k++) s += p[k]; return s; };
  for (let s0 = 0; s0 + n < samples.length; s0 += Math.round(n / 2)) {
    const x = Float64Array.from(samples.subarray(s0, s0 + n));
    let e = 0; for (const v of x) e += v * v;
    if (10 * Math.log10(e / n + 1e-14) < -55) continue;
    const p = powerSpectrum(x, nfft, w);
    if (band(p, 3000, 11000) < 10 * band(p, 100, 1000)) continue;
    for (let k = 0; k < avg.length && k < p.length; k++) avg[k] += p[k];
    frames++;
  }
  if (!frames) { console.log(`${file}: no hissing frames`); continue; }
  // peak of the spectrum smoothed over 500 Hz, and the spectral mean, both in 1-11 kHz
  const half = Math.round(250 / df);
  let pk = 0, pv = -1, m1 = 0, m0 = 0;
  for (let k = Math.round(1000 / df); k <= Math.round(11000 / df) && k < avg.length; k++) {
    let s = 0; for (let j = k - half; j <= k + half; j++) s += avg[Math.max(0, Math.min(avg.length - 1, j))];
    if (s > pv) { pv = s; pk = k * df; }
    m1 += k * df * avg[k]; m0 += avg[k];
  }
  console.log(`${file.split(/[\\/]/).pop()}: ${frames} hissing frames, peak ${pk.toFixed(0)} Hz, spectral mean ${(m1 / m0).toFixed(0)} Hz`);
}
