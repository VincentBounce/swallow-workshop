/**
 * In-place iterative radix-2 complex FFT with cached twiddles and bit reversal.
 * Framework independent; used by the analysis views and the tests.
 */
export class FFT {
  readonly n: number;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two');
    this.n = n;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  /** Forward transform of (re, im), in place. */
  transform(re: Float64Array | Float32Array, im: Float64Array | Float32Array): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = this.sin[k * step];
          const a = start + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  /** Inverse transform (scaled by 1/n), in place. */
  inverse(re: Float64Array | Float32Array, im: Float64Array | Float32Array): void {
    for (let i = 0; i < this.n; i++) im[i] = -im[i];
    this.transform(re, im);
    const s = 1 / this.n;
    for (let i = 0; i < this.n; i++) { re[i] *= s; im[i] = -im[i] * s; }
  }
}

const fftCache = new Map<number, FFT>();
export function getFFT(n: number): FFT {
  let f = fftCache.get(n);
  if (!f) { f = new FFT(n); fftCache.set(n, f); }
  return f;
}

export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/**
 * Power spectrum (one-sided, n/2+1 bins) of a real frame with a Hann window,
 * zero padded to fftSize. Returns power per bin normalised by the window energy.
 */
export function powerSpectrum(frame: ArrayLike<number>, fftSize: number, window?: Float64Array): Float64Array {
  const fft = getFFT(fftSize);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const n = Math.min(frame.length, fftSize);
  const w = window ?? hann(n);
  let wsum = 0;
  for (let i = 0; i < n; i++) { re[i] = frame[i] * w[i]; wsum += w[i] * w[i]; }
  fft.transform(re, im);
  const out = new Float64Array(fftSize / 2 + 1);
  for (let k = 0; k <= fftSize / 2; k++) out[k] = (re[k] * re[k] + im[k] * im[k]) / wsum;
  return out;
}

/** Welch-averaged power spectrum over a long signal. */
export function welch(signal: ArrayLike<number>, fftSize: number, hop = fftSize / 2): Float64Array {
  const w = hann(fftSize);
  const acc = new Float64Array(fftSize / 2 + 1);
  let count = 0;
  const frame = new Float64Array(fftSize);
  for (let start = 0; start + fftSize <= signal.length; start += hop) {
    for (let i = 0; i < fftSize; i++) frame[i] = signal[start + i];
    const p = powerSpectrum(frame, fftSize, w);
    for (let k = 0; k < p.length; k++) acc[k] += p[k];
    count++;
  }
  if (count > 0) for (let k = 0; k < acc.length; k++) acc[k] /= count;
  return acc;
}
