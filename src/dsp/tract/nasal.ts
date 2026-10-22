import { AREA_CLOSED } from '../constants';

/**
 * Nasal branch: from the velopharyngeal port through the nasopharynx to the
 * choanae, where the septum divides it into the left and right nasal
 * passages, each with its own nostril. The paranasal sinuses are closed side
 * branches (Helmholtz-like resonators).
 *
 * The area profile is a smoothed summary of MRI-based measurements of both
 * nasal passages together (Dang, Honda & Suzuki 1994): about 11 cm long,
 * 2.5-4.5 cm^2 in the main cavity, narrowing to about 1 cm^2 at the nasal
 * valve and nostrils. The first quarter (the nasopharynx) is common; beyond
 * it each passage takes its share. Two equal passages sound like one tube of
 * their summed area; unequal ones do not: the two paths interfere and add
 * pole-zero pairs (Dang et al. 1994). Unequal passages are the rule, as the
 * turbinates of one side swell while the other side's shrink (the nasal
 * cycle). Pinching a nostril closes its passage at the far end: it becomes a
 * closed side branch, with its own antiresonance.
 *
 * The maxillary sinuses (one per side) and the sphenoidal sinus (on the
 * nasopharynx) are a narrow neck plus a closed cavity; with the default sizes
 * they resonate near 450-650 Hz, in the range reported by Dang & Honda
 * (1996). The convoluted turbinates give the nasal passages a much larger
 * wall surface than a circular duct of the same area, hence higher losses
 * (perimeter factor). Their walls are bone and cartilage under a thin mucosa:
 * unlike the cheeks and the pharynx they hardly yield, so the nasal murmur
 * keeps its low first resonance (about 250-300 Hz in men, Stevens 1998)
 * instead of being pushed up as a soft-walled closed tube would be.
 */
export interface SinusBranch {
  /** part of the nasal branch it opens into: 0 common, 1 left, 2 right */
  part: 0 | 1 | 2;
  /** attached at the junction before section `at` of that part */
  at: number;
  /** areas from the neck (index 0) to the closed end */
  areas: Float64Array;
  name: string;
}

export interface NasalTract {
  /** common sections (nasopharynx); index 0 is the velopharyngeal port */
  areas: Float64Array;
  /** left and right passages, from the choana (index 0) to the nostril */
  left: Float64Array;
  right: Float64Array;
  dx: number;
  sinuses: SinusBranch[];
  /** oral junction index j: the branch joins between oral sections j and j+1 */
  coupling: number;
  /** wall-perimeter multiplier for the viscous and thermal losses of the
   *  common part; each passage has the same surface as the merged ones */
  perimeterFactor: number;
  /** yielding wall surface relative to a soft duct of the same area */
  wallFactor: number;
}

/** Wall-perimeter multiplier of one passage: two passages of half the area
 *  have as much wall as the merged passages with `perimeterFactor` */
export function passagePerimeter(n: NasalTract): number {
  return n.perimeterFactor / Math.SQRT2;
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
/** sections of the common nasopharynx, before the septum */
export const NASAL_COMMON = Math.round(0.25 * NASAL_SECTIONS);
const NOMINAL_DX = 17.5 / 44;

/** Shape of the two passages: the nasal cycle and how open each nostril is. */
export interface NasalSides {
  /** -1 left passage congested ... 0 equal ... +1 right passage congested */
  cycle: number;
  /** opening of the left and right nostril, 0 pinched ... 1 open */
  nostrilLeft: number;
  nostrilRight: number;
}

export const OPEN_NOSE: NasalSides = { cycle: 0, nostrilLeft: 1, nostrilRight: 1 };

/** The two passages of an anatomy (see Anatomy in types.ts). */
export function noseOf(a: { nasalCycle: number; nostrilLeft: number; nostrilRight: number }): NasalSides {
  return { cycle: a.nasalCycle, nostrilLeft: a.nostrilLeft, nostrilRight: a.nostrilRight };
}

/** Nostril areas (cm^2) of a nose: the airflow path out of the nasal cavity. */
export function nostrilArea(scale: number, sides: NasalSides = OPEN_NOSE): number {
  const a = 0.5 * profile(1) * scale * scale;
  return a * (Math.max(0, Math.min(1, sides.nostrilLeft)) + Math.max(0, Math.min(1, sides.nostrilRight)));
}

export function buildNasal(dx: number, scale: number, port: number, coupling: number, out?: NasalTract, sides: NasalSides = OPEN_NOSE): NasalTract {
  const n = NASAL_SECTIONS, nc = NASAL_COMMON, np = n - nc;
  const same = !!out && out.areas.length === nc && out.left.length === np;
  const areas = same ? out!.areas : new Float64Array(nc);
  const left = same ? out!.left : new Float64Array(np);
  const right = same ? out!.right : new Float64Array(np);
  const s2 = scale * scale;
  for (let i = 0; i < nc; i++) areas[i] = profile((i + 0.5) / n) * s2;
  areas[0] = Math.max(AREA_CLOSED, port);
  // the nasal cycle swells the turbinates of one side (the middle of the
  // passage) while the other side's shrink; the nostrils keep their size
  const c = Math.max(-1, Math.min(1, sides.cycle));
  for (let j = 0; j < np; j++) {
    const u = (nc + j + 0.5) / n;
    const w = Math.min(1, Math.max(0, (u - 0.25) / 0.1)) * Math.min(1, Math.max(0, (0.82 - u) / 0.1));
    const a = 0.5 * profile(u) * s2;
    left[j] = a * (1 + 0.85 * c * w);
    right[j] = a * (1 - 0.85 * c * w);
    // a pinched nostril closes the last centimetre
    if (u > 0.9) {
      left[j] = Math.max(AREA_CLOSED, left[j] * Math.max(0, Math.min(1, sides.nostrilLeft)));
      right[j] = Math.max(AREA_CLOSED, right[j] * Math.max(0, Math.min(1, sides.nostrilRight)));
    }
  }
  const sinus = (name: string, part: 0 | 1 | 2, u: number, neck: number, volume: number, cavLen: number): SinusBranch => {
    const nc2 = Math.max(2, Math.round(cavLen / NOMINAL_DX));
    const arr = new Float64Array(nc2 + 1);
    arr[0] = neck * s2;
    const ac = (volume * s2 * scale) / (nc2 * dx);
    for (let i = 1; i <= nc2; i++) arr[i] = ac;
    const len = part === 0 ? nc : np;
    const at = part === 0 ? Math.round(u * n) : Math.round(u * n) - nc;
    return { part, at: Math.max(1, Math.min(len - 2, at)), areas: arr, name };
  };
  const sinuses = same && out!.dx === dx ? out!.sinuses : [
    sinus('maxillary (left)', 1, 0.5, 0.06, 11, 1.6),
    sinus('maxillary (right)', 2, 0.5, 0.06, 11, 1.6),
    sinus('sphenoid', 0, 0.12, 0.06, 7, 1.2),
  ];
  return { areas, left, right, dx, sinuses, coupling, perimeterFactor: 3.0, wallFactor: 0 };
}
