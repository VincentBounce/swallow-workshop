import { RHO, NU, C_SOUND, CMH2O } from '../constants';
import { smoothstep } from '../util/math';

/**
 * Slow ("DC") aerodynamics of the airway, after Stevens (1998, ch. 2-3) and
 * Rothenberg: lungs -> glottis -> oral constriction (with the nose in
 * parallel) -> out. Each orifice obeys the Bernoulli law U = A sqrt(2 dP / rho);
 * the oral cavity between them has a compliance C (mostly its yielding walls),
 *   C dPo/dt = U_glottis - U_mouth - U_nose.
 * This gives intraoral pressure build-up during closures, the release burst of
 * stops, and the aerodynamic limits of voicing (no transglottal pressure, no
 * vibration).
 *
 * Turbulence noise (Stevens 1971, 1998; Flanagan & Cherry 1969; Shadle 1985):
 *  - a jet forms at the narrowest passage, with velocity v = sqrt(2 Po / rho);
 *  - noise appears when the Reynolds number Re = v D / nu exceeds about 1800;
 *  - the equivalent dipole source pressure scales as rho v^3 / c times
 *    sqrt(A) (that is, Stevens' U^3 A^-2.5 law);
 *  - if the jet hits an obstacle (the incisors, for sibilants) the source is
 *    stronger and sits at the obstacle. The share of the jet that hits the
 *    teeth depends on how the jet has spread when it reaches them compared
 *    with the opening of the slit between the incisors.
 */

export const RE_CRIT = 1800;
/** reference area for the sqrt(A) source law, cm^2 */
const A_REF = 0.1;

export interface JetInfo {
  /** jet velocity at the constriction (cm/s) */
  v: number;
  /** Reynolds number */
  re: number;
  /** hydraulic diameter (cm) */
  dh: number;
  /** distance from the constriction exit to the incisors (cm) */
  toTeeth: number;
  /** jet width when it reaches the teeth (cm) */
  widthAtTeeth: number;
  /** centre-line velocity at the teeth (cm/s) */
  vAtTeeth: number;
  /** fraction of the jet that hits the teeth (0..1) */
  impinge: number;
  /** turbulence onset factor (0..1) */
  onset: number;
  /** equivalent source pressures (dyn/cm^2 rms), before user gains */
  wallSource: number;
  obstacleSource: number;
  /** low-pass corner of the source spectrum (Hz) */
  fc: number;
  fcObstacle: number;
}

export interface AeroInputs {
  /** subglottal (lung) pressure, dyn/cm^2 */
  ps: number;
  /** mean glottal area (cm^2): vibrating glottis average + chink + abduction */
  glottalArea: number;
  /** narrowest oral area (cm^2) */
  oralArea: number;
  /** nasal passage effective area (cm^2) */
  nasalArea: number;
  /** wall compliance of the cavity behind the constriction (cm^5/dyn) */
  compliance: number;
}

export class Aero {
  /** intraoral pressure above the glottis, dyn/cm^2 */
  po = 0;
  /** mean flows, cm^3/s */
  ug = 0;
  uMouth = 0;
  uNose = 0;
  /** rate of change of the mouth flow (for the release transient) */
  dUMouth = 0;

  reset(): void { this.po = 0; this.ug = 0; this.uMouth = 0; this.uNose = 0; this.dUMouth = 0; }

  step(dt: number, x: AeroInputs): void {
    const ps = Math.max(0, x.ps);
    const ag2 = x.glottalArea * x.glottalArea;
    const aout = x.oralArea + x.nasalArea;
    const ao2 = aout * aout;
    // steady-state intraoral pressure where glottal inflow equals outflow
    const poStar = ag2 + ao2 > 1e-12 ? (ps * ag2) / (ag2 + ao2) : 0;
    const k = Math.sqrt(2 / RHO);
    const dpg = Math.max(ps - this.po, 0);
    // linearised conductances dU/dP = A k / (2 sqrt(dP)) give the relaxation time
    const gg = (x.glottalArea * k) / (2 * Math.sqrt(Math.max(dpg, 1)));
    const go = (aout * k) / (2 * Math.sqrt(Math.max(this.po, 1)));
    const tau = x.compliance / Math.max(gg + go, 1e-9);
    const a = tau > 0 ? Math.exp(-dt / tau) : 0;
    this.po = poStar + (this.po - poStar) * a;
    this.ug = x.glottalArea * k * Math.sqrt(Math.max(ps - this.po, 0));
    const um = x.oralArea * k * Math.sqrt(Math.max(this.po, 0));
    this.dUMouth = (um - this.uMouth) / dt;
    this.uMouth = um;
    this.uNose = x.nasalArea * k * Math.sqrt(Math.max(this.po, 0));
  }

  /** Jet and noise-source description for a constriction of area ac. */
  jet(ac: number, toTeeth: number, slitHeight: number, out: JetInfo): JetInfo {
    const v = Math.sqrt((2 * Math.max(this.po, 0)) / RHO);
    const dh = Math.max(2 * Math.sqrt(Math.max(ac, 1e-4) / Math.PI), 0.02);
    const re = (v * dh) / NU;
    const onset = smoothstep(RE_CRIT * 0.6, RE_CRIT * 1.8, re);
    // Lighthill-type dipole scaling with Stevens' area dependence
    const base = ((RHO * v * v * v) / C_SOUND) * Math.sqrt(Math.max(ac, 1e-4) / A_REF) * onset;
    out.v = v; out.re = re; out.dh = dh; out.onset = onset;
    out.toTeeth = toTeeth;
    out.wallSource = base;
    if (toTeeth > 0) {
      const core = 5 * dh; // potential core of the jet
      const vt = toTeeth < core ? v : (v * core) / toTeeth;
      const width = dh + 0.22 * toTeeth;
      const impinge = Math.max(0, Math.min(1, 1 - slitHeight / width));
      out.vAtTeeth = vt;
      out.widthAtTeeth = width;
      out.impinge = impinge;
      out.obstacleSource = ((RHO * vt * vt * vt) / C_SOUND) * Math.sqrt(Math.max(ac, 1e-4) / A_REF) * onset * impinge;
    } else {
      out.vAtTeeth = 0; out.widthAtTeeth = 0; out.impinge = 0; out.obstacleSource = 0;
    }
    // Strouhal number ~0.15 for the dominant eddies of the jet
    out.fc = Math.min(16000, (0.15 * v) / dh);
    out.fcObstacle = Math.min(16000, (0.15 * Math.max(out.vAtTeeth, 1)) / Math.max(Math.min(slitHeight, out.widthAtTeeth || 1), 0.05));
    return out;
  }
}

/**
 * Flow resistances of the jets in the tract, R / (rho c) in 1/cm^2, at the exit
 * of each section (the last entry at the lips). Where the flow leaves a narrow
 * passage it separates into a jet, which loses its kinetic pressure in the
 * wider part downstream (Borda-Carnot): dp = rho/2 v^2 (1 - A / A_down)^2, a
 * differential resistance R = rho U (1 - A / A_down)^2 / A^2. The losses damp
 * the resonances of the cavities around a fricative and a stop release
 * (Birkholz, Jackel & Kroger 2007; Stevens 1998). `narrowIndex` and
 * `narrowArea` give the main constriction measured on the fine grid, narrower
 * than the mean area of its section.
 */
export function kineticResistances(areas: ArrayLike<number>, flow: number, out: Float64Array, narrowIndex = -1, narrowArea = Infinity): Float64Array {
  out.fill(0);
  const n = areas.length;
  if (!(flow > 0)) return out;
  const at = (i: number) => (i === narrowIndex ? Math.min(areas[i], narrowArea) : areas[i]);
  for (let i = 1; i < n; i++) {
    const a = Math.max(at(i), 1e-4);
    if (a > at(i - 1) || (i < n - 1 && a >= at(i + 1))) continue;
    // widest part downstream before the tract narrows again (open air at the lips)
    let down = Infinity;
    if (i < n - 1) {
      let j = i + 1;
      while (j < n - 1 && at(j + 1) >= at(j)) j++;
      down = at(j);
    }
    const loss = (1 - a / down) ** 2;
    // the jet speed is bounded by the lung pressure (about 0.15 c)
    const v = Math.min(flow / a, 0.15 * C_SOUND);
    out[i] = (loss * v) / (C_SOUND * a);
  }
  return out;
}

export function newJetInfo(): JetInfo {
  return {
    v: 0, re: 0, dh: 0, toTeeth: 0, widthAtTeeth: 0, vAtTeeth: 0, impinge: 0, onset: 0,
    wallSource: 0, obstacleSource: 0, fc: 1000, fcObstacle: 1000,
  };
}

export const cmH2O = (p: number) => p / CMH2O;
