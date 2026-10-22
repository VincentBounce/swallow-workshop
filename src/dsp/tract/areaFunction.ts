import { AREA_CLOSED } from '../constants';
import { TractGeometry } from './geometry';

/** Number of equal-length sections of the oral tract (glottis to lips). */
export const N_SECTIONS = 44;

/**
 * A tube description shared by the frequency-domain reference model and the
 * time-domain waveguide: N equal sections from the glottis (index 0) to the
 * lips (index N-1).
 */
export interface AreaFunction {
  areas: Float64Array;
  length: number;
  /** length of one section, cm */
  dx: number;
  /** section containing the incisors (obstacle position) */
  teethIndex: number;
  /** section where the lips start */
  lipsIndex: number;
}

export function uniformTube(length = 17.5, area = 3.0, n = N_SECTIONS): AreaFunction {
  const areas = new Float64Array(n).fill(area);
  return { areas, length, dx: length / n, teethIndex: n - 3, lipsIndex: n - 2 };
}

/**
 * Resamples the fine grid-line area function of the geometry onto N equal
 * sections. Within a section the acoustic mass is preserved (harmonic mean of
 * the area), and any closure inside a section closes the whole section, so
 * that narrow constrictions keep their acoustic effect.
 */
export function sectionsFromGeometry(g: TractGeometry, n = N_SECTIONS, out?: AreaFunction): AreaFunction {
  const L = Math.max(g.length, 4);
  const dx = L / n;
  const areas = out?.areas && out.areas.length === n ? out.areas : new Float64Array(n);
  const s = g.s;
  const last = g.lastRay;
  const A = (i: number) => g.hits[i].area;
  let j = 0; // fine index pointer
  const SUB = 6;
  for (let k = 0; k < n; k++) {
    const a = k * dx, b = (k + 1) * dx;
    let inv = 0;
    let minA = Infinity;
    for (let q = 0; q < SUB; q++) {
      const x = a + ((q + 0.5) / SUB) * (b - a);
      while (j < last - 1 && s[j + 1] < x) j++;
      const s0 = s[j], s1 = s[j + 1];
      const t = s1 > s0 ? Math.min(1, Math.max(0, (x - s0) / (s1 - s0))) : 0;
      const area = A(j) + (A(j + 1) - A(j)) * t;
      inv += 1 / Math.max(area, AREA_CLOSED);
    }
    // closures of single grid lines inside the section
    for (let i = 0; i <= last; i++) {
      if (s[i] >= a - 1e-9 && s[i] <= b + 1e-9 && A(i) < minA) minA = A(i);
    }
    let area = SUB / inv;
    if (minA < 0.004) area = Math.max(AREA_CLOSED, minA);
    areas[k] = area;
  }
  const teethIndex = Math.min(n - 1, Math.max(0, Math.floor(g.teethPos / dx)));
  const lipsIndex = Math.min(n - 1, Math.max(0, Math.floor(g.lipsPos / dx)));
  const res = out ?? { areas, length: L, dx, teethIndex, lipsIndex };
  res.areas = areas; res.length = L; res.dx = dx; res.teethIndex = teethIndex; res.lipsIndex = lipsIndex;
  return res;
}

/**
 * Resamples a drawn or measured tube profile onto n sections. Each source
 * value is the area at the centre of its own cell, so a profile that already
 * has n values comes through unchanged.
 */
export function resampleTube(src: ArrayLike<number>, n: number, out: Float64Array, floor: number): Float64Array {
  const m = src.length;
  for (let i = 0; i < n; i++) {
    const x = Math.min(m - 1, Math.max(0, ((i + 0.5) / n) * m - 0.5));
    const j = Math.min(m - 2, Math.floor(x)), t = x - j;
    out[i] = Math.max(floor, src[j] * (1 - t) + src[j + 1] * t);
  }
  return out;
}

/** Index and value of the minimum area between two sections (inclusive). */
export function minArea(af: AreaFunction, from: number, to: number): { index: number; area: number } {
  let idx = from, v = Infinity;
  for (let i = from; i <= to; i++) if (af.areas[i] < v) { v = af.areas[i]; idx = i; }
  return { index: idx, area: v };
}
