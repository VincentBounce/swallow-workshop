/**
 * Linear prediction (autocorrelation method + Levinson-Durbin) and formant
 * estimation from the roots of the predictor polynomial (Markel & Gray 1976).
 */

export function autocorr(x: ArrayLike<number>, order: number): Float64Array {
  const r = new Float64Array(order + 1);
  const n = x.length;
  for (let k = 0; k <= order; k++) {
    let s = 0;
    for (let i = k; i < n; i++) s += x[i] * x[i - k];
    r[k] = s;
  }
  return r;
}

/** Returns predictor coefficients a[0..p] with a[0] = 1, and the residual energy. */
export function levinson(r: Float64Array, p: number): { a: Float64Array; err: number } {
  const a = new Float64Array(p + 1);
  const tmp = new Float64Array(p + 1);
  a[0] = 1;
  let err = r[0] * (1 + 1e-9) + 1e-12;
  for (let i = 1; i <= p; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    tmp.set(a);
    for (let j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j];
    a[i] = k;
    err *= 1 - k * k;
  }
  return { a, err };
}

/** Roots of a real polynomial (coefficients highest power first) by Durand-Kerner. */
export function polyRoots(c: Float64Array): { re: number; im: number }[] {
  const n = c.length - 1;
  const lead = c[0];
  const co = Array.from(c, (v) => v / lead);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n + 0.4;
    re[i] = 0.9 * Math.cos(ang); im[i] = 0.9 * Math.sin(ang);
  }
  for (let it = 0; it < 500; it++) {
    let delta = 0;
    for (let i = 0; i < n; i++) {
      // evaluate polynomial at z_i
      let pr = 1, pi = 0;
      for (let k = 1; k <= n; k++) {
        const nr = pr * re[i] - pi * im[i] + co[k];
        const ni = pr * im[i] + pi * re[i];
        pr = nr; pi = ni;
      }
      // product of (z_i - z_j)
      let qr = 1, qi = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dr = re[i] - re[j], di = im[i] - im[j];
        const nr = qr * dr - qi * di, ni = qr * di + qi * dr;
        qr = nr; qi = ni;
      }
      const den = qr * qr + qi * qi || 1e-30;
      const wr = (pr * qr + pi * qi) / den, wi = (pi * qr - pr * qi) / den;
      re[i] -= wr; im[i] -= wi;
      delta = Math.max(delta, Math.abs(wr) + Math.abs(wi));
    }
    if (delta < 1e-12) break;
  }
  const out: { re: number; im: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ re: re[i], im: im[i] });
  return out;
}

export interface LpcFormant { f: number; bw: number }

/**
 * Formants of a frame by LPC. The frame is pre-emphasised, Hann-windowed;
 * order defaults to 2 + fs/1000. Returns poles with positive frequency
 * sorted by frequency, filtered for plausible bandwidths.
 */
export function lpcFormants(frame: ArrayLike<number>, fs: number, order = Math.round(2 + fs / 1000), maxBw = 600): LpcFormant[] {
  const n = frame.length;
  const x = new Float64Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    x[i] = (frame[i] - 0.97 * prev) * w;
    prev = frame[i];
  }
  const r = autocorr(x, order);
  if (r[0] <= 1e-12) return [];
  const { a } = levinson(r, order);
  const roots = polyRoots(a);
  const res: LpcFormant[] = [];
  for (const z of roots) {
    if (z.im <= 0) continue;
    const f = (Math.atan2(z.im, z.re) * fs) / (2 * Math.PI);
    const mag = Math.hypot(z.re, z.im);
    const bw = (-Math.log(Math.max(mag, 1e-9)) * fs) / Math.PI;
    if (f > 90 && f < fs / 2 - 50 && bw < maxBw) res.push({ f, bw });
  }
  return res.sort((p, q) => p.f - q.f);
}

/** Decimates by an integer factor with a simple windowed-sinc low-pass. */
export function decimate(x: ArrayLike<number>, factor: number): Float64Array {
  if (factor <= 1) return Float64Array.from(x);
  const taps = 16 * factor + 1;
  const h = new Float64Array(taps);
  const fc = 0.45 / factor;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const m = i - (taps - 1) / 2;
    const s = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1));
    h[i] = s * w; sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  const out = new Float64Array(Math.floor(x.length / factor));
  for (let o = 0; o < out.length; o++) {
    const c = o * factor;
    let acc = 0;
    for (let i = 0; i < taps; i++) {
      const k = c + i - (taps - 1) / 2;
      if (k >= 0 && k < x.length) acc += h[i] * x[k];
    }
    out[o] = acc;
  }
  return out;
}
