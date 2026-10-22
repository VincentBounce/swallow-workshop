import {
  C_SOUND, RHO, MU, GAMMA_AIR, LAMBDA_HEAT, CP_AIR, WALL_MASS, WALL_RES, WALL_STIFF, AREA_CLOSED,
} from '../constants';
import { AreaFunction, BlindBranch } from './areaFunction';
import { NasalTract, NasalSides, buildNasal, passagePerimeter, portArea } from './nasal';
import { goldenMax } from '../util/math';

/**
 * Frequency-domain reference model of the vocal tract: a chain of lossy
 * cylindrical sections described by transmission (ABCD) matrices, following
 * Sondhi & Schroeter (1987) and Story, Titze & Hoffman (1996):
 *
 *   per unit length:  Z = R + j w rho/A,        R = (S/A^2) sqrt(w rho mu / 2)
 *                     Y = G + j w A/(rho c^2) + Yw,
 *                     G = S (eta-1)/(rho c^2) sqrt(lambda w / (2 cp rho)),
 *                     Yw = S / (Rw + j w Mw + Kw/(j w))      (yielding walls)
 *   section:          [P_in; U_in] = [[cosh gl, Zc sinh gl],[sinh gl / Zc, cosh gl]] [P_out; U_out]
 *                     gamma = sqrt(Z Y), Zc = sqrt(Z / Y)
 *
 * with S the perimeter of the section (2 sqrt(pi A) for a circular duct, more
 * for the flat lenses and slits of the real tract) and Yw counted only on its
 * soft-tissue part. The lips radiate into a piston-in-a-baffle load
 * approximated by Flanagan's (1972) parallel R-L network,
 * R = 128 rho c / (9 pi^2 A), L = 8 rho / (3 pi sqrt(pi A)). A nasal branch
 * with sinus side-branches joins the oral tract at the velum; the piriform
 * fossae join it as a blind branch just above the larynx, and in a lateral
 * the supralingual cavity joins it where the flow splits into the lateral
 * channels.
 *
 * This model is used for the envelope and formant read-outs and to validate
 * the real-time waveguide.
 */
export interface AcousticOptions {
  /** velum opening 0..1 (ignored if `port` is given) */
  velum?: number;
  /** velopharyngeal port area, cm^2 */
  port?: number;
  /** nasal leak 0..1 */
  nasalLeak?: number;
  /** anatomical scale (nasal tract size) */
  scale?: number;
  /** oral junction where the nose couples (default 0.43 N) */
  coupling?: number;
  /** include viscous, thermal and wall losses (default true) */
  losses?: boolean;
  /** lip radiation load: piston (default) or ideal open end (p = 0) */
  radiation?: 'piston' | 'ideal';
  /** glottal termination impedance (acoustic ohms); Infinity = closed (default) */
  glottalImpedance?: number;
  /** precomputed nasal tract */
  nasal?: NasalTract;
  /** include the piriform fossae of the area function (default true) */
  piriform?: boolean;
  /** include the supralingual cavity of a lateral (default true) */
  supralingual?: boolean;
  /** nasal cycle and nostrils, for a nasal tract built here */
  nose?: NasalSides;
  /** flow resistances (acoustic ohms) at the exit of each oral section, the
   *  last one at the lips: the kinetic pressure a jet loses where it leaves a
   *  narrow passage (see kineticResistances) */
  resistances?: ArrayLike<number>;
}

// complex helpers on [re, im] scratch values, written inline for speed
interface C { re: number; im: number }

function csqrt(re: number, im: number, out: C): void {
  const m = Math.hypot(re, im);
  let r = Math.sqrt(Math.max(0, (m + re) / 2));
  let i = Math.sqrt(Math.max(0, (m - re) / 2));
  if (im < 0) i = -i;
  if (r < 0) { r = -r; i = -i; }
  out.re = r; out.im = i;
}

const tmp: C = { re: 0, im: 0 };

/** Section transmission matrix (A = D, B, C) at angular frequency w. */
function section(
  area: number, len: number, w: number, perimFactor: number, losses: boolean,
  m: { ar: number; ai: number; br: number; bi: number; cr: number; ci: number },
  wallFactor = perimFactor,
): void {
  const A = Math.max(area, AREA_CLOSED);
  const S = 2 * Math.sqrt(Math.PI * A) * perimFactor;
  // yielding surface (soft tissue); bony walls, as in the nose, barely yield
  const Sw = 2 * Math.sqrt(Math.PI * A) * wallFactor;
  // series impedance per unit length
  let zr = 0, zi = (w * RHO) / A;
  // shunt admittance per unit length
  let yr = 0, yi = (w * A) / (RHO * C_SOUND * C_SOUND);
  if (losses && w > 0) {
    zr = (S / (A * A)) * Math.sqrt((w * RHO * MU) / 2);
    yr = ((S * (GAMMA_AIR - 1)) / (RHO * C_SOUND * C_SOUND)) * Math.sqrt((LAMBDA_HEAT * w) / (2 * CP_AIR * RHO));
    const xw = w * WALL_MASS - WALL_STIFF / w;
    const den = WALL_RES * WALL_RES + xw * xw;
    yr += (Sw * WALL_RES) / den;
    yi += (-Sw * xw) / den;
  }
  // gamma = sqrt(Z Y)
  const pr = zr * yr - zi * yi, pi = zr * yi + zi * yr;
  csqrt(pr, pi, tmp);
  const gr = tmp.re * len, gi = tmp.im * len;
  // Zc = Z / gamma_per_length
  const gmr = tmp.re, gmi = tmp.im;
  const gden = gmr * gmr + gmi * gmi;
  const zcr = (zr * gmr + zi * gmi) / gden, zci = (zi * gmr - zr * gmi) / gden;
  // cosh, sinh of (gr + j gi)
  const eg = Math.exp(gr), emg = 1 / eg;
  const ch = 0.5 * (eg + emg), sh = 0.5 * (eg - emg);
  const cb = Math.cos(gi), sb = Math.sin(gi);
  const coshR = ch * cb, coshI = sh * sb;
  const sinhR = sh * cb, sinhI = ch * sb;
  m.ar = coshR; m.ai = coshI;
  m.br = zcr * sinhR - zci * sinhI; m.bi = zcr * sinhI + zci * sinhR;
  const zd = zcr * zcr + zci * zci;
  m.cr = (sinhR * zcr + sinhI * zci) / zd; m.ci = (sinhI * zcr - sinhR * zci) / zd;
}

const M = { ar: 0, ai: 0, br: 0, bi: 0, cr: 0, ci: 0 };

/** Propagates (P, U) from the output end of a section to its input end. */
function back(p: C, u: C, area: number, len: number, w: number, pf: number, losses: boolean, wf = pf): void {
  section(area, len, w, pf, losses, M, wf);
  const pr = M.ar * p.re - M.ai * p.im + M.br * u.re - M.bi * u.im;
  const pi = M.ar * p.im + M.ai * p.re + M.br * u.im + M.bi * u.re;
  const ur = M.cr * p.re - M.ci * p.im + M.ar * u.re - M.ai * u.im;
  const ui = M.cr * p.im + M.ci * p.re + M.ar * u.im + M.ai * u.re;
  p.re = pr; p.im = pi; u.re = ur; u.im = ui;
}

/** Radiation impedance of an opening of area A (piston in an infinite baffle). */
export function radiationImpedance(area: number, w: number, out: C): void {
  const A = Math.max(area, AREA_CLOSED);
  const R = (128 * RHO * C_SOUND) / (9 * Math.PI * Math.PI * A);
  const L = (8 * RHO) / (3 * Math.PI * Math.sqrt(Math.PI * A));
  // Z = j w L R / (R + j w L)
  const wl = w * L;
  const den = R * R + wl * wl;
  out.re = (wl * wl * R) / den;
  out.im = (wl * R * R) / den;
}

function cdiv(ar: number, ai: number, br: number, bi: number, out: C): void {
  const d = br * br + bi * bi;
  out.re = (ar * br + ai * bi) / d;
  out.im = (ai * br - ar * bi) / d;
}

/** Input impedance of a closed side branch (areas from neck to closed end). */
function branchImpedance(areas: Float64Array, dx: number, w: number, pf: number, losses: boolean, out: C, wf = pf): void {
  const p: C = { re: 1, im: 0 }, u: C = { re: 0, im: 0 };
  // sections closed at the bottom (filled, or past the end) end the branch
  let end = areas.length - 1;
  while (end > 0 && areas[end] <= 1.01 * AREA_CLOSED) end--;
  for (let i = end; i >= 0; i--) back(p, u, areas[i], dx, w, pf, losses, wf);
  cdiv(p.re, p.im, u.re, u.im, out);
}

/**
 * Flow into a blind side branch at pressure p: u += p / Zb. Its walls are
 * taken as rigid, as in the waveguide: the fossae lie on the cartilages of
 * the larynx, and the hard palate roofs the supralingual cavity.
 */
function shuntBranch(areas: Float64Array, dx: number, w: number, losses: boolean, p: C, u: C): void {
  const zb: C = { re: 0, im: 0 }, t: C = { re: 0, im: 0 };
  branchImpedance(areas, dx, w, 1, losses, zb, 0);
  cdiv(p.re, p.im, zb.re, zb.im, t);
  u.re += t.re; u.im += t.im;
}

interface NasalState { zin: C; nosPerPort: C }

/** Nasal input impedance at the port and nostril flow per unit port flow. */
function nasalAt(n: NasalTract, w: number, losses: boolean, radiation: 'piston' | 'ideal'): NasalState {
  const zb: C = { re: 0, im: 0 }, t: C = { re: 0, im: 0 };
  // shunt sinus branches at the junction before section i of a part: U += P / Zb
  const shunts = (part: number, i: number, p: C, u: C) => {
    for (const sb of n.sinuses) {
      if (sb.part !== part || sb.at !== i) continue;
      branchImpedance(sb.areas, n.dx, w, n.perimeterFactor, losses, zb, n.wallFactor);
      cdiv(p.re, p.im, zb.re, zb.im, t);
      u.re += t.re; u.im += t.im;
    }
  };
  // each passage from its nostril (unit nostril flow) back to the choana
  const pf = passagePerimeter(n);
  const side = (areas: Float64Array, part: number) => {
    const p: C = { re: 0, im: 0 }, u: C = { re: 1, im: 0 };
    const zr: C = { re: 0, im: 0 };
    if (radiation === 'piston') radiationImpedance(areas[areas.length - 1], w, zr);
    p.re = zr.re; p.im = zr.im;
    for (let i = areas.length - 1; i >= 0; i--) {
      back(p, u, areas[i], n.dx, w, pf, losses, n.wallFactor);
      shunts(part, i, p, u);
    }
    return { p, u };
  };
  const l = side(n.left, 1), r = side(n.right, 2);
  // at the choanae both passages share the pressure P = 1: each takes the
  // flow u / p and lets 1 / p out of its nostril
  const p: C = { re: 1, im: 0 }, u: C = { re: 0, im: 0 }, nos: C = { re: 0, im: 0 };
  for (const s of [l, r]) {
    cdiv(s.u.re, s.u.im, s.p.re, s.p.im, t); u.re += t.re; u.im += t.im;
    cdiv(1, 0, s.p.re, s.p.im, t); nos.re += t.re; nos.im += t.im;
  }
  for (let i = n.areas.length - 1; i >= 0; i--) {
    back(p, u, n.areas[i], n.dx, w, n.perimeterFactor, losses, n.wallFactor);
    shunts(0, i, p, u);
  }
  const zin: C = { re: 0, im: 0 };
  cdiv(p.re, p.im, u.re, u.im, zin);
  const nosPerPort: C = { re: 0, im: 0 };
  cdiv(nos.re, nos.im, u.re, u.im, nosPerPort); // nostril flow per unit port flow
  return { zin, nosPerPort };
}

export interface TransferPoint {
  /** U_out / U_glottis (complex) */
  re: number; im: number;
  /** magnitude */
  mag: number;
}

export interface ResolvedOptions {
  losses: boolean;
  radiation: 'piston' | 'ideal';
  zg: number;
  nasal: NasalTract | null;
  resistances: ArrayLike<number> | null;
  piriform: BlindBranch | null;
  supra: BlindBranch | null;
}

export function resolveOptions(af: AreaFunction, o: AcousticOptions = {}): ResolvedOptions {
  const scale = o.scale ?? 1;
  const port = o.port ?? portArea(o.velum ?? 0, o.nasalLeak ?? 0, scale);
  const coupling = o.coupling ?? Math.round(0.43 * af.areas.length) - 1;
  const nasal = o.nasal ?? (port > 2 * AREA_CLOSED ? buildNasal(af.dx, scale, port, coupling, undefined, o.nose) : null);
  const piriform = o.piriform === false || !af.piriform || af.piriform.areas[0] <= 2 * AREA_CLOSED ? null : af.piriform;
  const sl = af.supralingual;
  const supra = o.supralingual === false || !sl || sl.at < 0 || sl.areas[0] <= 2 * AREA_CLOSED ? null : sl;
  return { losses: o.losses ?? true, radiation: o.radiation ?? 'piston', zg: o.glottalImpedance ?? Infinity, nasal, resistances: o.resistances ?? null, piriform, supra };
}

/**
 * Volume-velocity transfer function U_out/U_g at frequency f, where U_out is
 * the sum of the lip and nostril flows. Optionally fills the pressure and
 * volume velocity magnitude at each oral junction (standing-wave pattern).
 */
export function transferAt(af: AreaFunction, f: number, o: ResolvedOptions, profile?: { p: Float64Array; u: Float64Array }): TransferPoint {
  const w = 2 * Math.PI * Math.max(f, 1e-3);
  const n = af.areas.length;
  const p: C = { re: 0, im: 0 }, u: C = { re: 1, im: 0 };
  const zr: C = { re: 0, im: 0 };
  if (o.radiation === 'piston') radiationImpedance(af.areas[n - 1], w, zr);
  p.re = zr.re; p.im = zr.im;
  let outRe = 1, outIm = 0; // U_lip = 1
  const ns = o.nasal ? nasalAt(o.nasal, w, o.losses, o.radiation) : null;
  const rs = o.resistances;
  const pir = o.piriform, sup = o.supra;
  for (let i = n - 1; i >= 0; i--) {
    if (profile) { profile.p[i + 1] = Math.hypot(p.re, p.im); profile.u[i + 1] = Math.hypot(u.re, u.im); }
    // series resistance at the exit of section i: the pressure is higher upstream
    if (rs && rs[i]) { p.re += rs[i] * u.re; p.im += rs[i] * u.im; }
    back(p, u, af.areas[i], af.dx, w, af.shape?.[i] ?? 1, o.losses, af.soft?.[i] ?? 1);
    if (pir && i === pir.at + 1) shuntBranch(pir.areas, af.dx, w, o.losses, p, u);
    if (sup && i === sup.at + 1) shuntBranch(sup.areas, af.dx, w, o.losses, p, u);
    if (ns && o.nasal && i === o.nasal.coupling + 1) {
      // junction between oral sections (coupling) and (coupling+1): add nasal flow
      const un: C = { re: 0, im: 0 };
      cdiv(p.re, p.im, ns.zin.re, ns.zin.im, un);
      u.re += un.re; u.im += un.im;
      outRe += un.re * ns.nosPerPort.re - un.im * ns.nosPerPort.im;
      outIm += un.re * ns.nosPerPort.im + un.im * ns.nosPerPort.re;
    }
  }
  if (profile) { profile.p[0] = Math.hypot(p.re, p.im); profile.u[0] = Math.hypot(u.re, u.im); }
  let ugr = u.re, ugi = u.im;
  if (isFinite(o.zg)) { ugr += p.re / o.zg; ugi += p.im / o.zg; }
  const h: C = { re: 0, im: 0 };
  cdiv(outRe, outIm, ugr, ugi, h);
  return { re: h.re, im: h.im, mag: Math.hypot(h.re, h.im) };
}

/** Magnitude response on a set of frequencies. */
export function transferMagnitudes(af: AreaFunction, freqs: ArrayLike<number>, opts: AcousticOptions = {}, out?: Float64Array): Float64Array {
  const o = resolveOptions(af, opts);
  const res = out ?? new Float64Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) res[i] = transferAt(af, freqs[i], o).mag;
  return res;
}

export interface Formant { f: number; bw: number; amp: number }

/**
 * Formants as peaks of |U_out/U_g| between fmin and fmax, refined by
 * golden-section search; bandwidth from the half-power points.
 */
export function formants(af: AreaFunction, opts: AcousticOptions = {}, fmax = 5500, step = 25): Formant[] {
  const o = resolveOptions(af, opts);
  const mag = (f: number) => transferAt(af, f, o).mag;
  const fs: number[] = [];
  const ms: number[] = [];
  for (let f = 60; f <= fmax + step; f += step) { fs.push(f); ms.push(mag(f)); }
  const res: Formant[] = [];
  for (let i = 1; i < ms.length - 1; i++) {
    if (ms[i] > ms[i - 1] && ms[i] >= ms[i + 1]) {
      const fpk = goldenMax(mag, fs[i - 1], fs[i + 1], 30);
      const apk = mag(fpk);
      const half = apk / Math.SQRT2;
      const edge = (dir: number): number => {
        let a = fpk, b = fpk;
        // expand until below half power
        for (let k = 1; k < 200; k++) {
          b = fpk + dir * k * 5;
          if (b < 20) return NaN;
          if (mag(b) < half) break;
          a = b;
        }
        for (let it = 0; it < 30; it++) {
          const m = 0.5 * (a + b);
          if (mag(m) >= half) a = m; else b = m;
        }
        return 0.5 * (a + b);
      };
      const lo = edge(-1), hi = edge(1);
      const bw = isFinite(lo) && isFinite(hi) ? hi - lo : isFinite(hi) ? 2 * (hi - fpk) : NaN;
      if (fpk <= fmax) res.push({ f: fpk, bw, amp: apk });
    }
  }
  return res;
}

/** Standing-wave pattern (pressure and volume velocity magnitude per junction) at f. */
export function standingWave(af: AreaFunction, f: number, opts: AcousticOptions = {}): { p: Float64Array; u: Float64Array } {
  const o = resolveOptions(af, opts);
  const n = af.areas.length;
  const prof = { p: new Float64Array(n + 1), u: new Float64Array(n + 1) };
  transferAt(af, f, o, prof);
  let pm = 0, um = 0;
  for (let i = 0; i <= n; i++) { pm = Math.max(pm, prof.p[i]); um = Math.max(um, prof.u[i]); }
  for (let i = 0; i <= n; i++) { prof.p[i] /= pm || 1; prof.u[i] /= um || 1; }
  return prof;
}

/**
 * Transfer from a series pressure source (dipole, e.g. turbulence noise) placed
 * at oral junction k (between sections k-1 and k) to the lip volume velocity,
 * U_lip / P_s. The back cavity behind the source is terminated by the glottis.
 */
export function sourceTransferAt(af: AreaFunction, k: number, f: number, o: ResolvedOptions): number {
  const w = 2 * Math.PI * Math.max(f, 1e-3);
  const n = af.areas.length;
  // front part: from the lips back to junction k, with U_lip = 1
  const p: C = { re: 0, im: 0 }, u: C = { re: 1, im: 0 };
  const zr: C = { re: 0, im: 0 };
  if (o.radiation === 'piston') radiationImpedance(af.areas[n - 1], w, zr);
  p.re = zr.re; p.im = zr.im;
  const ns = o.nasal ? nasalAt(o.nasal, w, o.losses, o.radiation) : null;
  let lipOut = { re: 1, im: 0 };
  const rs = o.resistances;
  const pir = o.piriform, sup = o.supra;
  for (let i = n - 1; i >= k; i--) {
    if (rs && rs[i]) { p.re += rs[i] * u.re; p.im += rs[i] * u.im; }
    back(p, u, af.areas[i], af.dx, w, af.shape?.[i] ?? 1, o.losses, af.soft?.[i] ?? 1);
    if (pir && i === pir.at + 1 && i > k) shuntBranch(pir.areas, af.dx, w, o.losses, p, u);
    if (sup && i === sup.at + 1 && i > k) shuntBranch(sup.areas, af.dx, w, o.losses, p, u);
    if (ns && o.nasal && i === o.nasal.coupling + 1 && i > k) {
      const un: C = { re: 0, im: 0 };
      cdiv(p.re, p.im, ns.zin.re, ns.zin.im, un);
      u.re += un.re; u.im += un.im;
      lipOut = {
        re: lipOut.re + un.re * ns.nosPerPort.re - un.im * ns.nosPerPort.im,
        im: lipOut.im + un.re * ns.nosPerPort.im + un.im * ns.nosPerPort.re,
      };
    }
  }
  // front input impedance Zf = P/U at junction k
  const zf: C = { re: 0, im: 0 };
  cdiv(p.re, p.im, u.re, u.im, zf);
  // back part: from the glottis (closed) forward to junction k
  const pb: C = { re: 1, im: 0 }, ub: C = { re: 0, im: 0 };
  if (isFinite(o.zg)) { ub.re = 1 / o.zg; }
  for (let i = 0; i < k; i++) {
    back(pb, ub, af.areas[i], af.dx, w, af.shape?.[i] ?? 1, o.losses, af.soft?.[i] ?? 1);
    if (pir && i === pir.at) shuntBranch(pir.areas, af.dx, w, o.losses, pb, ub);
    if (sup && i === sup.at) shuntBranch(sup.areas, af.dx, w, o.losses, pb, ub);
    if (ns && o.nasal && i === o.nasal.coupling) {
      const un: C = { re: 0, im: 0 };
      cdiv(pb.re, pb.im, ns.zin.re, ns.zin.im, un);
      ub.re += un.re; ub.im += un.im;
    }
    // looking back toward the glottis, the resistance adds to the impedance
    if (rs && rs[i]) { pb.re += rs[i] * ub.re; pb.im += rs[i] * ub.im; }
  }
  const zb: C = { re: 0, im: 0 };
  cdiv(pb.re, pb.im, ub.re, ub.im, zb);
  // U_k = Ps / (Zf + Zb); U_lip = U_k / u_front
  const uk: C = { re: 0, im: 0 };
  cdiv(1, 0, zf.re + zb.re, zf.im + zb.im, uk);
  const ul: C = { re: 0, im: 0 };
  cdiv(uk.re * lipOut.re - uk.im * lipOut.im, uk.re * lipOut.im + uk.im * lipOut.re, u.re, u.im, ul);
  return Math.hypot(ul.re, ul.im);
}

/** |U_lip/P_s| for a dipole source at junction k over a set of frequencies. */
export function sourceTransferMagnitudes(af: AreaFunction, k: number, freqs: ArrayLike<number>, opts: AcousticOptions = {}, out?: Float64Array): Float64Array {
  const o = resolveOptions(af, opts);
  const res = out ?? new Float64Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) res[i] = sourceTransferAt(af, k, freqs[i], o);
  return res;
}
