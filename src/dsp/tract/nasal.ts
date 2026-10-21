import { AREA_CLOSED } from '../constants';

/**
 * Nasal branch: from the velopharyngeal port to the nostrils, with the
 * paranasal sinuses as closed side branches (Helmholtz-like resonators).
 *
 * The area profile is a smoothed summary of MRI-based measurements of both
 * nasal passages together (Dang, Honda & Suzuki 1994): about 11 cm long,
 * 2.5-4.5 cm^2 in the main cavity, narrowing to about 1 cm^2 at the nasal
 * valve and nostrils. The maxillary and sphenoidal sinuses are modelled as a
 * narrow neck plus a closed cavity; with the default sizes they resonate near
 * 450-650 Hz, in the range reported by Dang & Honda (1996). The convoluted
 * turbinates give the nasal passages a much larger wall surface than a
 * circular duct of the same area, hence higher losses (perimeter factor).
 */
export interface SinusBranch {
  /** attached at the junction after nasal section `at` */
  at: number;
  /** areas from the neck (index 0) to the closed end */
  areas: Float64Array;
  name: string;
}

export interface NasalTract {
  /** nasal sections; index 0 is the velopharyngeal port */
  areas: Float64Array;
  dx: number;
  sinuses: SinusBranch[];
  /** oral junction index j: the branch joins between oral sections j and j+1 */
  coupling: number;
  /** wall-perimeter multiplier for losses */
  perimeterFactor: number;
}

/** Combined (left + right) nasal area profile, u = 0 port ... 1 nostrils (cm^2, adult male). */
const NASAL_PROFILE: [number, number][] = [
  [0.0, 2.6], [0.12, 3.2], [0.3, 4.2], [0.5, 4.0], [0.66, 3.0], [0.78, 1.6], [0.84, 1.15], [0.92, 1.4], [1.0, 1.0],
];

function profile(u: number): number {
  for (let i = 1; i < NASAL_PROFILE.length; i++) {
    const [u1, a1] = NASAL_PROFILE[i];
    const [u0, a0] = NASAL_PROFILE[i - 1];
    if (u <= u1) return a0 + ((a1 - a0) * (u - u0)) / (u1 - u0);
  }
  return NASAL_PROFILE[NASAL_PROFILE.length - 1][1];
}

export const NASAL_LENGTH = 11.0;
export const PORT_MAX = 1.6;

/** Port area (cm^2) from the velum opening and an anatomical leak. */
export function portArea(velum: number, leak: number, scale: number): number {
  const v = Math.max(0, Math.min(1, velum));
  const a = PORT_MAX * scale * scale * Math.pow(v, 1.3) + 0.35 * scale * scale * Math.max(0, leak);
  return Math.max(AREA_CLOSED, a);
}

/**
 * Number of nasal sections. It is fixed (11 cm at the nominal section length
 * of a 17.5 cm, 44-section tract) so that the waveguide never has to rebuild
 * the branch while the tract length changes; the nasal length therefore
 * scales with the tract (and slightly with larynx height), a simplification.
 */
export const NASAL_SECTIONS = Math.round(NASAL_LENGTH / (17.5 / 44));
const NOMINAL_DX = 17.5 / 44;

export function buildNasal(dx: number, scale: number, port: number, coupling: number, out?: NasalTract): NasalTract {
  const n = NASAL_SECTIONS;
  const areas = out && out.areas.length === n ? out.areas : new Float64Array(n);
  const s2 = scale * scale;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    areas[i] = profile(u) * s2;
  }
  areas[0] = Math.max(AREA_CLOSED, port);
  const sinus = (name: string, u: number, neck: number, volume: number, cavLen: number): SinusBranch => {
    const nc = Math.max(2, Math.round(cavLen / NOMINAL_DX));
    const arr = new Float64Array(nc + 1);
    arr[0] = neck * s2;
    const ac = (volume * s2 * scale) / (nc * dx);
    for (let i = 1; i <= nc; i++) arr[i] = ac;
    return { at: Math.max(1, Math.min(n - 3, Math.round(u * n))), areas: arr, name };
  };
  const sinuses = out?.sinuses && out.areas.length === n && out.dx === dx ? out.sinuses : [
    sinus('maxillary', 0.5, 0.12, 22, 1.6),
    sinus('sphenoid', 0.12, 0.06, 7, 1.2),
  ];
  return { areas, dx, sinuses, coupling, perimeterFactor: 3.0 };
}
