import { hzToMel, melToHz } from '../util/math';

/**
 * Triangular mel filter bank (HTK mel scale, 2595 log10(1 + f/700)),
 * area-normalised like Slaney's implementation, as used by most speech models
 * (80 bands is a common choice for TTS vocoders).
 */
export interface MelBank {
  nMels: number;
  fmin: number;
  fmax: number;
  /** centre frequencies of the bands (Hz) */
  centers: Float64Array;
  /** for each band, first bin and weights */
  start: Int32Array;
  weights: Float64Array[];
}

export function melBank(nMels: number, fftSize: number, fs: number, fmin = 0, fmax = fs / 2): MelBank {
  const mMin = hzToMel(fmin), mMax = hzToMel(fmax);
  const pts = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) pts[i] = melToHz(mMin + ((mMax - mMin) * i) / (nMels + 1));
  const binHz = fs / fftSize;
  const start = new Int32Array(nMels);
  const weights: Float64Array[] = [];
  const centers = new Float64Array(nMels);
  for (let m = 0; m < nMels; m++) {
    const lo = pts[m], c = pts[m + 1], hi = pts[m + 2];
    centers[m] = c;
    const b0 = Math.max(0, Math.floor(lo / binHz));
    const b1 = Math.min(fftSize / 2, Math.ceil(hi / binHz));
    start[m] = b0;
    const w = new Float64Array(b1 - b0 + 1);
    const norm = 2 / (hi - lo);
    for (let b = b0; b <= b1; b++) {
      const f = b * binHz;
      let v = 0;
      if (f > lo && f <= c) v = (f - lo) / (c - lo);
      else if (f > c && f < hi) v = (hi - f) / (hi - c);
      w[b - b0] = v * norm;
    }
    weights.push(w);
  }
  return { nMels, fmin, fmax, centers, start, weights };
}

/** Applies the bank to a power spectrum, returning log10 energies (natural log as in TTS front ends). */
export function applyMel(bank: MelBank, power: ArrayLike<number>, out?: Float64Array, floor = 1e-10): Float64Array {
  const res = out ?? new Float64Array(bank.nMels);
  for (let m = 0; m < bank.nMels; m++) {
    const w = bank.weights[m];
    const s0 = bank.start[m];
    let acc = 0;
    for (let i = 0; i < w.length; i++) acc += w[i] * (power[s0 + i] ?? 0);
    res[m] = Math.log(Math.max(acc, floor));
  }
  return res;
}
