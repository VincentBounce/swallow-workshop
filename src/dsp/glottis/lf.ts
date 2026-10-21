/**
 * Liljencrants-Fant (LF) model of the glottal flow derivative
 * (Fant, Liljencrants & Lin 1985), parameterised by the single shape
 * parameter Rd (Fant 1995, "The LF-model revisited").
 *
 * Within one fundamental period T0 (normalised here to 1):
 *   open phase      0 <= t <= te :  E(t) = E0 e^{alpha t} sin(pi t / tp)
 *   return phase   te <  t <= 1  :  E(t) = -(Ee / (eps ta)) [e^{-eps (t-te)} - e^{-eps (1-te)}]
 * with E(te) = -Ee, eps*ta = 1 - e^{-eps (1 - te)}, and alpha chosen so that the
 * flow (the integral of E) returns to zero at the end of the period.
 *
 * Rd -> (Ra, Rk, Rg) uses Fant's (1995) regression:
 *   Ra = (-1 + 4.8 Rd)/100, Rk = (22.4 + 11.8 Rd)/100,
 *   Rg = Rk / (4 ((0.11 Rd)/(0.5 + 1.2 Rk) - Ra)),
 * and tp = 1/(2 Rg), te = tp (1 + Rk), ta = Ra.
 * Open quotient Oq = te, speed/asymmetry coefficient alpha_m = tp / te.
 */

export interface LFTiming {
  /** time of the flow peak (normalised to T0) */
  tp: number;
  /** time of the main excitation (negative peak of the derivative) */
  te: number;
  /** effective duration of the return phase */
  ta: number;
}

export interface LFShape extends LFTiming {
  alpha: number;
  eps: number;
  omega: number;
  E0: number;
  /** flow value at te (normalised, Ee = 1) */
  ute: number;
  /** peak flow (normalised, Ee = 1, T0 = 1) */
  upeak: number;
}

export const RD_MIN = 0.3;
export const RD_MAX = 2.7;

export function rdToTiming(rd: number): LFTiming & { ra: number; rk: number; rg: number } {
  const r = Math.min(RD_MAX, Math.max(RD_MIN, rd));
  const ra = (-1 + 4.8 * r) / 100;
  const rk = (22.4 + 11.8 * r) / 100;
  const rg = rk / (4 * ((0.11 * r) / (0.5 + 1.2 * rk) - ra));
  const tp = 1 / (2 * rg);
  const te = tp * (1 + rk);
  return { tp, te, ta: ra, ra, rk, rg };
}

/** Open quotient and speed quotient for a given timing. */
export function quotients(t: LFTiming): { oq: number; alphaM: number; ra: number } {
  return { oq: t.te, alphaM: t.tp / t.te, ra: t.ta };
}

/** Builds Oq/alpha_m/Ra timing directly (advanced mode). */
export function timingFromQuotients(oq: number, alphaM: number, ra: number): LFTiming {
  const te = Math.min(0.98, Math.max(0.2, oq));
  const tp = Math.min(te * 0.98, Math.max(te * 0.5, alphaM * te));
  const ta = Math.min((1 - te) * 0.9, Math.max(0.0015, ra));
  return { tp, te, ta };
}

function solveEps(ta: number, tb: number): number {
  // eps ta = 1 - exp(-eps tb)
  let eps = 1 / ta;
  for (let i = 0; i < 30; i++) {
    const e = Math.exp(-eps * tb);
    const g = eps * ta - 1 + e;
    const dg = ta - tb * e;
    const step = g / dg;
    eps -= step;
    if (eps <= 0) eps = 1e-3 / ta;
    if (Math.abs(step) < 1e-10 * eps) break;
  }
  return eps;
}

/** Solves the LF shape (alpha, eps, E0) for a timing, with Ee = 1 and T0 = 1. */
export function solveLF(timing: LFTiming): LFShape {
  let { tp, te, ta } = timing;
  te = Math.min(te, 0.995);
  ta = Math.min(ta, (1 - te) * 0.95);
  ta = Math.max(ta, 1e-4);
  tp = Math.min(Math.max(tp, te * 0.51), te * 0.995);
  const tb = 1 - te;
  const eps = solveEps(ta, tb);
  const omega = Math.PI / tp;
  const s = Math.sin(omega * te);
  const c = Math.cos(omega * te);
  // Return-phase integral of E (with Ee = 1)
  const eb = Math.exp(-eps * tb);
  const i2 = -(1 / (eps * ta)) * ((1 - eb) / eps - tb * eb);
  // Open-phase integral with E0 = -1/(e^{alpha te} sin(omega te))
  const f = (alpha: number): number => {
    const num = alpha * s - omega * c + omega * Math.exp(-alpha * te);
    return -num / ((alpha * alpha + omega * omega) * s) + i2;
  };
  // Bracket a root: scan alpha
  let lo = -40, hi = -40, flo = f(lo);
  let found = false;
  for (let a = -40 + 0.5; a <= 400; a += 0.5) {
    const fa = f(a);
    if ((fa > 0) !== (flo > 0)) { hi = a; found = true; break; }
    lo = a; flo = fa;
  }
  let alpha = 0;
  if (found) {
    let a = lo, b = hi, fa = flo;
    for (let i = 0; i < 60; i++) {
      const m = 0.5 * (a + b);
      const fm = f(m);
      if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m;
    }
    alpha = 0.5 * (a + b);
  }
  const E0 = -1 / (Math.exp(alpha * te) * s);
  const shape: LFShape = { tp, te, ta, alpha, eps, omega, E0, ute: 0, upeak: 0 };
  shape.ute = openFlow(shape, te);
  shape.upeak = openFlow(shape, tp);
  return shape;
}

function openFlow(sh: LFShape, t: number): number {
  const { alpha, omega, E0 } = sh;
  return (E0 * (Math.exp(alpha * t) * (alpha * Math.sin(omega * t) - omega * Math.cos(omega * t)) + omega)) /
    (alpha * alpha + omega * omega);
}

/** Flow derivative E(t), t in [0, 1) normalised time, Ee = 1. */
export function lfDerivative(sh: LFShape, t: number): number {
  if (t <= sh.te) return sh.E0 * Math.exp(sh.alpha * t) * Math.sin(sh.omega * t);
  const eb = Math.exp(-sh.eps * (1 - sh.te));
  return -(1 / (sh.eps * sh.ta)) * (Math.exp(-sh.eps * (t - sh.te)) - eb);
}

/** Flow U(t) (integral of E from 0), normalised time, Ee = 1. */
export function lfFlow(sh: LFShape, t: number): number {
  if (t <= sh.te) return openFlow(sh, t);
  const dt = t - sh.te;
  const eb = Math.exp(-sh.eps * (1 - sh.te));
  return sh.ute - (1 / (sh.eps * sh.ta)) * ((1 - Math.exp(-sh.eps * dt)) / sh.eps - dt * eb);
}

/**
 * Periodic LF source generator for the audio thread. Produces the glottal flow
 * normalised to a unit peak and its time derivative in 1/s units.
 * Shape changes (Rd, F0, jitter) are applied at period boundaries.
 */
export class LFSource {
  phase = 0;
  shape: LFShape;
  /** current period's F0 (with jitter applied) */
  periodF0 = 120;
  /** current period amplitude factor (shimmer, diplophonia) */
  periodAmp = 1;
  /** index of the period, for alternating (diplophonic) patterns */
  periodIndex = 0;
  /** true during the open phase */
  open = false;
  /** set to true on the sample where a new period starts */
  newPeriod = false;
  /** normalised flow (unit peak) and derivative (per second, unit-peak flow) */
  flow = 0;
  dflow = 0;
  /** period mean of the normalised flow (the "DC" part of the pulse train) */
  meanFlow = 0.4;

  private cachedKey = '';

  constructor() {
    this.shape = solveLF(rdToTiming(1));
    this.meanFlow = LFSource.mean(this.shape);
  }

  private static mean(sh: LFShape): number {
    let m = 0;
    const n = 256;
    for (let i = 0; i < n; i++) m += Math.max(0, lfFlow(sh, (i + 0.5) / n));
    return m / n / sh.upeak;
  }

  setShape(timing: LFTiming): void {
    const key = `${timing.tp.toFixed(5)}|${timing.te.toFixed(5)}|${timing.ta.toFixed(5)}`;
    if (key === this.cachedKey) return;
    this.cachedKey = key;
    this.shape = solveLF(timing);
    this.meanFlow = LFSource.mean(this.shape);
  }

  /**
   * Advances by one sample at rate fs. `nextPeriod` is invoked at each period
   * boundary so the caller can set F0, amplitude and shape for the new cycle.
   */
  step(fs: number, nextPeriod: (src: LFSource) => void): void {
    this.newPeriod = false;
    this.phase += this.periodF0 / fs;
    if (this.phase >= 1) {
      this.phase -= 1;
      if (this.phase >= 1) this.phase = 0;
      this.periodIndex++;
      this.newPeriod = true;
      nextPeriod(this);
    }
    const sh = this.shape;
    const t = this.phase;
    const u = lfFlow(sh, t) / sh.upeak;
    this.flow = u > 0 ? u : 0;
    this.dflow = (lfDerivative(sh, t) / sh.upeak) * this.periodF0;
    this.open = t < sh.te + sh.ta;
  }
}
