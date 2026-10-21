import { RHO, MU } from '../constants';

/**
 * Self-oscillating two-mass model of the vocal folds, in the asymmetric
 * left/right form of Steinecke & Herzel (1995), itself a simplification of
 * Ishizaka & Flanagan (1972). Each fold has a lower mass (1) and an upper
 * mass (2) coupled by a spring; air pressure in the glottis pushes the lower
 * masses apart when the glottis is convergent, elasticity pulls them back:
 * this is the myoelastic-aerodynamic cycle.
 *
 *   m_i x_i'' + r_i x_i' + k_i x_i + H(-a_i) c_i a_i / (2 l) + k_c (x_i - x_j) = F_i
 *   a_i = a0_i + l (x_i,left + x_i,right)
 *   F_1 = l d_1 P_1,  P_1 = dP (1 - (a_min / a_1)^2) if open, dP if closed above,
 *   F_2 = 0 (flow separation at the narrowest point)
 *
 * Pitch is set by the tension parameter Q, which scales stiffness up and mass
 * down (k -> Q k, m -> m / Q), so every natural frequency scales with Q.
 * Asymmetry between the two folds (Q_left != Q_right) produces subharmonics
 * and irregular, "raspy" phonation (Steinecke & Herzel 1995).
 *
 * The glottal flow is coupled to the vocal tract: given the transglottal
 * driving pressure Q_d and the tract input impedance Z (characteristic
 * impedance of the first section plus viscous loss), the Bernoulli relation
 *   dP = rho U^2 / (2 a_min^2) + (Z + R_visc) U
 * is solved in closed form at every sample (Titze 1984 style).
 */
export interface TwoMassParams {
  /** tension factor (dimensionless), F0 roughly proportional */
  q: number;
  /** left/right asymmetry, Q_l = q (1 + asym/2), Q_r = q (1 - asym/2) */
  asym: number;
  /** rest (pre-phonatory) area of each mass, cm^2; small = pressed, large = breathy */
  a0: number;
  /** thickness of the lower mass, cm */
  d1: number;
}

const M1 = 0.125, M2 = 0.025; // g
const K1 = 80000, K2 = 8000; // dyn/cm
const KC = 25000; // dyn/cm
const R_DAMP = 20; // g/s (damping ratio ~0.1 for mass 1)
const COLL = 3; // collision stiffness factor c_i = 3 k_i
const L_FOLD = 1.4; // cm, length of the folds
const D2 = 0.05; // cm

export class TwoMassGlottis {
  // displacements (cm) and velocities (cm/s): [left1, left2, right1, right2]
  x = new Float64Array(4);
  v = new Float64Array(4);
  params: TwoMassParams = { q: 1, asym: 0, a0: 0.05, d1: 0.25 };
  /** glottal areas at the two masses and their minimum, cm^2 */
  a1 = 0.05;
  a2 = 0.05;
  amin = 0.05;
  /** glottal volume velocity, cm^3/s */
  flow = 0;
  /** pressure on the lower mass, dyn/cm^2 */
  p1 = 0;
  /** true when the glottis is closed */
  closed = false;
  private prevClosed = false;
  /** set to true on the sample when the folds open after a closure */
  openingEvent = false;
  /** period measurement for pitch tracking (s) */
  lastPeriod = 0;
  private timeSinceOpening = 0;

  reset(): void {
    this.x.fill(0); this.v.fill(0);
    // small asymmetric kick so that oscillation can start
    this.x[0] = 0.002; this.x[2] = 0.002;
    this.flow = 0;
  }

  /**
   * Advances one step of duration dt.
   * @param ps     subglottal (lung) pressure, dyn/cm^2
   * @param po     slowly varying (DC) intraoral pressure above the glottis, dyn/cm^2
   * @param pMinus acoustic pressure wave arriving at the glottis from the tract
   * @param z      characteristic impedance of the first tract section
   * @param uMean  running mean of the glottal flow (the DC part is handled by
   *               the aerodynamic model, only the AC part enters the waveguide)
   */
  step(dt: number, ps: number, po: number, pMinus: number, z: number, uMean: number): number {
    const p = this.params;
    const ql = p.q * (1 + p.asym / 2);
    const qr = p.q * (1 - p.asym / 2);
    const x = this.x, v = this.v;
    const l = L_FOLD;
    const a0 = p.a0;
    this.a1 = a0 + l * (x[0] + x[2]);
    this.a2 = a0 + l * (x[1] + x[3]);
    const a1 = this.a1, a2 = this.a2;
    const amin = Math.min(a1, a2);
    this.amin = amin;

    // Flow: ps - (po + 2 p- + z (u - uMean)) = rho u^2 / (2 amin^2) + R_visc u
    const drive = ps - po - 2 * pMinus + z * uMean;
    let u = 0;
    if (amin > 1e-6) {
      const a = RHO / (2 * amin * amin);
      const w = amin / l; // glottal width
      const rv = Math.min((12 * MU * p.d1) / (l * w * w * w), 1e6);
      const b = z + rv;
      if (drive > 0) u = (2 * drive) / (b + Math.sqrt(b * b + 4 * a * drive));
      else u = -(2 * -drive) / (b + Math.sqrt(b * b - 4 * a * drive));
    }
    this.flow = u;
    const pSupra = po + 2 * pMinus + z * (u - uMean);

    // Intraglottal pressures (flow separation at the narrowest point).
    let p1 = 0, p2 = 0;
    if (a1 > 0) {
      if (a2 <= 0) p1 = ps; // closed above: full lung pressure on the lower mass
      else if (a2 < a1) { p1 = ps - (RHO * u * u) / (2 * a1 * a1); p2 = pSupra; } // convergent
      else { p1 = pSupra; p2 = pSupra; } // divergent: jet separates at mass 1
    }
    this.p1 = p1;
    const f1 = l * p.d1 * p1;
    const f2 = l * D2 * p2;

    for (let side = 0; side < 2; side++) {
      const q = side === 0 ? ql : qr;
      const i1 = side * 2, i2 = i1 + 1;
      const m1 = M1 / q, m2 = M2 / q;
      const k1 = K1 * q, k2 = K2 * q, kc = KC * q;
      let force1 = f1 - k1 * x[i1] - R_DAMP * v[i1] - kc * (x[i1] - x[i2]);
      let force2 = f2 - k2 * x[i2] - R_DAMP * v[i2] - kc * (x[i2] - x[i1]);
      if (a1 < 0) force1 -= COLL * k1 * (a1 / (2 * l)) + 2 * R_DAMP * v[i1];
      if (a2 < 0) force2 -= COLL * k2 * (a2 / (2 * l)) + 2 * R_DAMP * v[i2];
      // semi-implicit Euler
      v[i1] += (force1 / m1) * dt;
      v[i2] += (force2 / m2) * dt;
      x[i1] += v[i1] * dt;
      x[i2] += v[i2] * dt;
      // guard against numerical blow-up
      if (!(Math.abs(x[i1]) < 1)) { x[i1] = 0; v[i1] = 0; }
      if (!(Math.abs(x[i2]) < 1)) { x[i2] = 0; v[i2] = 0; }
    }

    // Opening events for pitch measurement.
    this.closed = amin <= 0;
    this.openingEvent = false;
    this.timeSinceOpening += dt;
    if (this.prevClosed && !this.closed) {
      this.openingEvent = true;
      this.lastPeriod = this.timeSinceOpening;
      this.timeSinceOpening = 0;
    }
    this.prevClosed = this.closed;
    if (this.timeSinceOpening > 0.05) this.lastPeriod = 0; // no closures: not periodic
    return u;
  }

  /** Mean displacement of the medial edges, for drawing (cm). */
  get displacements(): { l1: number; l2: number; r1: number; r2: number } {
    return { l1: this.x[0], l2: this.x[1], r1: this.x[2], r2: this.x[3] };
  }
}

export const TWO_MASS_CONST = { M1, M2, K1, K2, KC, L_FOLD, D2 };
