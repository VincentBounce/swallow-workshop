export const TWO_PI = Math.PI * 2;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function db(x: number, floor = 1e-12): number {
  return 20 * Math.log10(Math.max(Math.abs(x), floor));
}

export function powDb(p: number, floor = 1e-24): number {
  return 10 * Math.log10(Math.max(p, floor));
}

export function fromDb(d: number): number {
  return Math.pow(10, d / 20);
}

/** Hz -> mel (HTK / O'Shaughnessy formula). */
export function hzToMel(f: number): number {
  return 2595 * Math.log10(1 + f / 700);
}

export function melToHz(m: number): number {
  return 700 * (Math.pow(10, m / 2595) - 1);
}

/** Linear least squares fit y = a + b x; returns [a, b]. */
export function linearFit(xs: ArrayLike<number>, ys: ArrayLike<number>): [number, number] {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  return [a, b];
}

/** Golden-section maximisation of f on [a, b]. */
export function goldenMax(f: (x: number) => number, a: number, b: number, iters = 40): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/** Bisection root finding for a continuous f with sign change on [a, b]. */
export function bisect(f: (x: number) => number, a: number, b: number, iters = 60): number {
  let fa = f(a);
  for (let i = 0; i < iters; i++) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else { b = m; }
  }
  return 0.5 * (a + b);
}
