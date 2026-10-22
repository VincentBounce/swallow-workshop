import { RHO, C_SOUND, AREA_CLOSED, WALL_MASS, WALL_RES, WALL_STIFF } from '../constants';
import { AreaFunction, BlindBranch } from './areaFunction';
import { NasalTract } from './nasal';
import { PIRIFORM_SECTIONS, SUPRA_SECTIONS } from './section3d';

/** areas of a blind branch with nothing in it */
const CLOSED_BRANCH = new Float64Array(Math.max(PIRIFORM_SECTIONS, SUPRA_SECTIONS)).fill(AREA_CLOSED);

/**
 * Time-domain vocal tract: a Kelly-Lochbaum (1962) scattering waveguide of
 * pressure waves with one sample of delay per section and per direction, so
 * the section length is c / fs_tract. The engine runs it at fs = N c / L, so
 * any tract length is exact (no fractional delays).
 *
 * Junction between sections of area A1 and A2 (pressure waves):
 *   r = (A1 - A2) / (A1 + A2),  w = r (f_in - b_in)
 *   f_out = f_in + w,  b_out = b_in + w
 * Three-way junction (velum, sinus ostia), with incoming waves p_i:
 *   p_J = 2 sum(A_i p_i) / sum(A_i),  out_i = p_J - p_i
 * Series pressure source p_s at a junction (dipole, turbulence):
 *   f_out += p_s (1 + r) / 2,  b_out -= p_s (1 - r) / 2
 * Volume-velocity source u_s at a junction (monopole, release flow):
 *   f_out += rho c u_s / (A1 + A2),  b_out += rho c u_s / (A1 + A2)
 * Glottal end (flow source with glottal reflection r_g):
 *   f_0 = r_g b_0 + Z_0 (1 + r_g) / 2 U_g
 * Lips and nostrils: first-order reflection filter from Flanagan's radiation
 * impedance (parallel R-L) by the bilinear transform; the radiated sound is the
 * time derivative of the lip plus nostril volume velocity.
 *
 * Nose: a common nasopharynx from the velum to the choanae, then a three-way
 * junction into the left and right passages, each ending at its own nostril.
 *
 * Blind branches: the piriform fossae just above the larynx and, in a
 * lateral, the supralingual cavity, each joined at a three-way junction and
 * rigid at its far end.
 *
 * Losses: each wave is attenuated per section by exp(-sigma_i / fs), with a
 * decay rate that grows in narrow sections (perimeter/area of the walls, with
 * the true perimeter of the section); calibrated against the frequency-domain
 * model (see tests).
 *
 * Yielding walls: at every other oral junction a lumped mass-spring-damper
 * wall (Ishizaka, French & Flanagan 1975 constants) is driven by the local
 * pressure, m y'' + r y' + k y = p, and the air it displaces,
 * u_w = S dx y' (S = soft-tissue perimeter), is removed from the junction as a
 * flow sink. This reproduces the closed-tract wall resonance that raises F1
 * and sets the low-frequency bandwidths, as in the reference model.
 */

interface RadFilter { b0: number; b1: number; a1: number; x1: number; y1: number; t0: number; t1: number; ta1: number }

/** Designs the radiation reflection filter; the coefficients glide to it with the area ramp. */
function designRadiation(area: number, fs: number, f: RadFilter, immediate = false): void {
  const A = Math.max(area, AREA_CLOSED);
  const a = Math.sqrt(A / Math.PI);
  const tau = (8 * a) / (3 * Math.PI * C_SOUND);
  const R = 128 / (9 * Math.PI * Math.PI);
  const K = 2 * fs * tau;
  const d0 = K * (R + 1) + R;
  f.t0 = (K * (R - 1) - R) / d0;
  f.t1 = (-K * (R - 1) - R) / d0;
  f.ta1 = (R - K * (R + 1)) / d0;
  if (immediate) { f.b0 = f.t0; f.b1 = f.t1; f.a1 = f.ta1; }
}

function glideRad(r: RadFilter, w: number): void {
  r.b0 += (r.t0 - r.b0) * w; r.b1 += (r.t1 - r.b1) * w; r.a1 += (r.ta1 - r.a1) * w;
}

function newRad(): RadFilter { return { b0: -1, b1: 0, a1: 0, x1: 0, y1: 0, t0: -1, t1: 0, ta1: 0 }; }

/**
 * Wave decay rate (1/s) of a section of area A. Below about 0.03 cm^2 the
 * channel is a closure: viscous resistance (which grows like 1/A^2 in a slit)
 * dominates, and the waves trapped in a closed section are damped within a
 * few samples. Without this term a lossless closed section would integrate
 * the pressure difference across it (an inertance with no resistance) and
 * release the stored energy as a click when it opens.
 */
export function sectionDecay(area: number, base: number, narrow: number, shape = 1): number {
  const closure = area >= 0.03 ? 0 : area <= 0.003 ? 1 : 1 - (area - 0.003) / 0.027;
  return base + narrow * shape * Math.sqrt(3 / Math.max(area, 0.02)) + 40000 * closure * closure;
}

export interface WaveguideLossParams {
  /** base decay rate of the oral tract (1/s) */
  base: number;
  /** extra decay of narrow sections (1/s at A = 3/4 cm^2 scale) */
  narrow: number;
  /** multiplier for the nasal branch */
  nasal: number;
}

// The nasal passages are narrow, folded (the turbinates) and lined with soft
// mucosa: their resonances are heavily damped (Fujimura 1962). x10 puts a held
// /m/ about 7-9 dB below /a/ and 3 dB below /i/, as in the measured relative
// intensities of speech sounds (Fletcher 1953; Fry 1979).
export const DEFAULT_LOSSES: WaveguideLossParams = { base: 70, narrow: 45, nasal: 10 };

class Branch {
  readonly n: number;
  f: Float64Array; b: Float64Array; fn: Float64Array; bn: Float64Array;
  /** current section areas: they glide to the targets together with k */
  area: Float64Array;
  target: Float64Array;
  dA: Float64Array;
  k: Float64Array; dk: Float64Array;
  loss: Float64Array;
  lossTarget: Float64Array;
  dLoss: Float64Array;
  private steps = 1;
  constructor(n: number) {
    this.n = n;
    this.f = new Float64Array(n); this.b = new Float64Array(n);
    this.fn = new Float64Array(n); this.bn = new Float64Array(n);
    this.area = new Float64Array(n).fill(1);
    this.target = new Float64Array(n).fill(1);
    this.dA = new Float64Array(n);
    this.k = new Float64Array(Math.max(1, n - 1)); this.dk = new Float64Array(Math.max(1, n - 1));
    this.loss = new Float64Array(n).fill(1);
    this.lossTarget = new Float64Array(n).fill(1);
    this.dLoss = new Float64Array(n);
  }
  swap(): void {
    let t = this.f; this.f = this.fn; this.fn = t;
    t = this.b; this.b = this.bn; this.bn = t;
  }
  reset(): void { this.f.fill(0); this.b.fill(0); this.fn.fill(0); this.bn.fill(0); }
  /** sets target areas with a linear ramp of the reflection coefficients over `steps` samples */
  setAreas(src: ArrayLike<number>, steps: number): void {
    this.steps = Math.max(1, steps);
    const inv = 1 / this.steps;
    for (let i = 0; i < this.n; i++) {
      this.target[i] = Math.max(src[i], AREA_CLOSED);
      this.dA[i] = (this.target[i] - this.area[i]) * inv;
    }
    for (let i = 0; i < this.n - 1; i++) {
      const a1 = this.target[i], a2 = this.target[i + 1];
      const kt = (a1 - a2) / (a1 + a2);
      this.dk[i] = (kt - this.k[i]) * inv;
    }
  }
  /** losses glide with the areas (a closing section is damped progressively) */
  setLoss(fs: number, base: number, narrow: number, mult: number, shape?: ArrayLike<number>): void {
    const inv = 1 / this.steps;
    for (let i = 0; i < this.n; i++) {
      this.lossTarget[i] = Math.exp((-sectionDecay(this.target[i], base, narrow, shape ? shape[i] : 1) * mult) / fs);
      if (this.steps <= 1) this.loss[i] = this.lossTarget[i];
      this.dLoss[i] = (this.lossTarget[i] - this.loss[i]) * inv;
    }
  }
  /** one sample of the geometry glide */
  glide(): void {
    const k = this.k, dk = this.dk, a = this.area, da = this.dA, l = this.loss, dl = this.dLoss;
    for (let i = 0; i < this.n - 1; i++) k[i] += dk[i];
    for (let i = 0; i < this.n; i++) { a[i] += da[i]; l[i] += dl[i]; }
  }
  /** ends the glide exactly on the targets */
  settle(): void {
    for (let i = 0; i < this.n; i++) { this.area[i] = this.target[i]; this.dA[i] = 0; this.loss[i] = this.lossTarget[i]; this.dLoss[i] = 0; }
    for (let i = 0; i < this.n - 1; i++) {
      const a1 = this.target[i], a2 = this.target[i + 1];
      this.k[i] = (a1 - a2) / (a1 + a2);
      this.dk[i] = 0;
    }
  }
}

interface Sinus { tube: Branch; at: number; part: number }

export class Waveguide {
  readonly n: number;
  readonly oral: Branch;
  /** common nasopharynx (index 0 at the velum) */
  nasal: Branch;
  /** left and right nasal passages, from the choana to the nostril */
  nasalL: Branch = new Branch(2);
  nasalR: Branch = new Branch(2);
  sinuses: Sinus[] = [];
  /** oral junction where the nose joins (between sections J and J+1) */
  coupling: number;
  /** the blind branches (piriform fossae, supralingual cavity) and the oral
   *  junction each joins (-1 = none) */
  readonly piriform: Branch = new Branch(PIRIFORM_SECTIONS);
  readonly supra: Branch = new Branch(SUPRA_SECTIONS);
  private readonly blind: Branch[] = [this.piriform, this.supra];
  readonly blindAt = new Int32Array([-1, -1]);
  get piriformAt(): number { return this.blindAt[0]; }
  private rampLeft = 0;
  private lipRad: RadFilter = newRad();
  private nosRadL: RadFilter = newRad();
  private nosRadR: RadFilter = newRad();

  /** glottal boundary: reflection and injected pressure wave (set before step) */
  rg = 0.99;
  glottalInjection = 0;
  private dcB = 0;
  private dcCoef = 0.002;

  /** dipole sources (pressure, dyn/cm^2) at oral junctions; set before step */
  srcJunction = new Int32Array(6);
  srcValue = new Float64Array(6);
  srcCount = 0;
  /** monopole (volume velocity) source */
  monoJunction = -1;
  monoValue = 0;

  /**
   * Flow resistances of the jets, R / (rho c) in 1/cm^2, at the exit of each
   * oral section (see kineticResistances; the last entry, at the lips, acts
   * at the last junction); set before step, followed within about 1 ms.
   */
  readonly resTarget: Float64Array;
  private resValue: Float64Array;
  private resCoef = 0.02;
  private resOn = false;

  /** outputs of the last step */
  lipFlow = 0;
  nosFlow = 0;
  /** flow at the glottal end of the tract (cm^3/s) */
  glottalEndFlow = 0;

  /** energy accumulators for visualisation */
  pAcc: Float64Array;
  uAcc: Float64Array;
  accCount = 0;
  private accPhase = 0;

  lossParams: WaveguideLossParams = { ...DEFAULT_LOSSES };
  fs = 88000;
  /** yielding walls on/off */
  walls = true;
  private wallJ: Int32Array;
  private wallS: Float64Array;
  private wallY: Float64Array;
  private wallV: Float64Array;

  constructor(n: number, nNasal: number, coupling: number) {
    this.n = n;
    this.oral = new Branch(n);
    this.nasal = new Branch(nNasal);
    this.coupling = coupling;
    this.pAcc = new Float64Array(n);
    this.uAcc = new Float64Array(n);
    const nw = Math.floor((n - 1) / 2);
    this.wallJ = new Int32Array(nw);
    for (let i = 0; i < nw; i++) this.wallJ[i] = 2 * i + 1;
    this.wallS = new Float64Array(nw);
    this.wallY = new Float64Array(nw);
    this.wallV = new Float64Array(nw);
    this.resTarget = new Float64Array(n);
    this.resValue = new Float64Array(n);
  }

  reset(): void {
    this.oral.reset(); this.nasal.reset(); this.nasalL.reset(); this.nasalR.reset();
    for (const t of this.blind) t.reset();
    for (const s of this.sinuses) s.tube.reset();
    this.lipRad.x1 = this.lipRad.y1 = 0;
    this.nosRadL.x1 = this.nosRadL.y1 = 0;
    this.nosRadR.x1 = this.nosRadR.y1 = 0;
    this.pAcc.fill(0); this.uAcc.fill(0); this.accCount = 0;
    this.wallY.fill(0); this.wallV.fill(0);
    this.resValue.fill(0); this.resOn = false;
  }

  /** Rebuilds the nasal branch if its size changed. */
  configureNasal(nt: NasalTract): void {
    if (nt.areas.length !== this.nasal.n) {
      this.nasal = new Branch(nt.areas.length);
      this.sinuses = [];
    }
    if (nt.left.length !== this.nasalL.n) this.nasalL = new Branch(nt.left.length);
    if (nt.right.length !== this.nasalR.n) this.nasalR = new Branch(nt.right.length);
    if (this.sinuses.length !== nt.sinuses.length || this.sinuses.some((s, i) => s.tube.n !== nt.sinuses[i].areas.length)) {
      this.sinuses = nt.sinuses.map((sb) => ({ tube: new Branch(sb.areas.length), at: sb.at, part: sb.part }));
    }
    this.sinuses.forEach((s, i) => { s.at = nt.sinuses[i].at; s.part = nt.sinuses[i].part; });
    this.coupling = nt.coupling;
  }

  /**
   * Sets new oral/nasal geometry, to be reached linearly within `steps` samples.
   */
  setGeometry(af: AreaFunction, nt: NasalTract, fs: number, steps: number): void {
    this.fs = fs;
    this.dcCoef = 1 - Math.exp((-2 * Math.PI * 25) / fs);
    this.resCoef = 1 - Math.exp(-1 / (0.001 * fs));
    this.configureNasal(nt);
    this.oral.setAreas(af.areas, steps);
    this.nasal.setAreas(nt.areas, steps);
    this.nasalL.setAreas(nt.left, steps);
    this.nasalR.setAreas(nt.right, steps);
    for (let i = 0; i < this.sinuses.length; i++) this.sinuses[i].tube.setAreas(nt.sinuses[i].areas, steps);
    this.placeBranch(0, af.piriform, -1, steps);
    this.placeBranch(1, af.supralingual, this.blindAt[0], steps);
    const lp = this.lossParams;
    this.oral.setLoss(fs, lp.base, lp.narrow, 1, af.shape);
    for (const t of this.blind) t.setLoss(fs, lp.base, lp.narrow, 1);
    this.nasal.setLoss(fs, lp.base, lp.narrow, lp.nasal);
    this.nasalL.setLoss(fs, lp.base, lp.narrow, lp.nasal);
    this.nasalR.setLoss(fs, lp.base, lp.narrow, lp.nasal);
    for (const s of this.sinuses) s.tube.setLoss(fs, lp.base, lp.narrow, lp.nasal);
    // lumped wall surface (perimeter x length of two sections) at each wall junction
    for (let i = 0; i < this.wallJ.length; i++) {
      const j = this.wallJ[i];
      const a = 0.5 * (this.oral.target[j] + this.oral.target[j + 1]);
      // walls of nearly closed sections carry no flow (and an explicit sink
      // there would be unstable): fade the wall surface out below 0.2 cm^2
      const fade = Math.min(1, Math.max(0, (a - 0.02) / 0.18));
      const soft = af.soft ? 0.5 * (af.soft[j] + af.soft[j + 1]) : 1;
      this.wallS[i] = 2 * Math.sqrt(Math.PI * a) * soft * 2 * af.dx * fade * fade;
    }
    const first = steps <= 1;
    designRadiation(this.oral.target[this.n - 1], fs, this.lipRad, first);
    designRadiation(this.nasalL.target[this.nasalL.n - 1], fs, this.nosRadL, first);
    designRadiation(this.nasalR.target[this.nasalR.n - 1], fs, this.nosRadR, first);
    this.rampLeft = Math.max(1, steps);
  }

  /**
   * Joins blind branch q at its junction. A branch closed at its mouth is
   * left out; one that opens at another junction starts from silence there.
   */
  private placeBranch(q: number, br: BlindBranch | undefined, taken: number, steps: number): void {
    const t = this.blind[q];
    const ok = br && br.at > 0 && br.at < this.n - 2 && br.at !== this.coupling && br.at !== taken;
    const shut = !br || br.areas[0] <= 2 * AREA_CLOSED;
    if (!ok || (shut && t.area[0] <= 2 * AREA_CLOSED)) {
      if (this.blindAt[q] >= 0) { t.setAreas(CLOSED_BRANCH, 1); t.settle(); t.reset(); }
      this.blindAt[q] = -1;
      return;
    }
    if (br.at !== this.blindAt[q]) {
      t.reset();
      if (this.blindAt[q] < 0) { t.setAreas(CLOSED_BRANCH, 1); t.settle(); }
      this.blindAt[q] = br.at;
    }
    t.setAreas(br.areas, steps);
  }

  /** Characteristic impedance of the first (glottal) section. */
  get z0(): number { return (RHO * C_SOUND) / this.oral.area[0]; }

  /** pressure wave arriving at the glottis from the tract */
  get pMinus(): number { return this.oral.b[0]; }

  /** One sample of the waveguide. */
  step(): void {
    const o = this.oral, ns = this.nasal;
    const n = this.n;
    const J = this.coupling;
    const ramp = this.rampLeft > 0;
    if (ramp) {
      this.rampLeft--;
      if (this.rampLeft === 0) {
        o.settle(); ns.settle(); this.nasalL.settle(); this.nasalR.settle(); this.piriform.settle(); this.supra.settle();
        for (const s of this.sinuses) s.tube.settle();
      } else {
        o.glide(); ns.glide(); this.nasalL.glide(); this.nasalR.glide(); this.piriform.glide(); this.supra.glide();
        for (const s of this.sinuses) s.tube.glide();
      }
      // radiation filters glide with the end areas
      const w = 1 / (this.rampLeft + 1);
      glideRad(this.lipRad, w);
      glideRad(this.nosRadL, w);
      glideRad(this.nosRadR, w);
    }
    const f = o.f, b = o.b, fn = o.fn, bn = o.bn, k = o.k, loss = o.loss;

    // glottal end
    // the glottis absorbs the quasi-static part of the returning wave (the
    // DC pressure is handled by the aerodynamic model, not by the waveguide)
    this.dcB += (b[0] - this.dcB) * this.dcCoef;
    fn[0] = loss[0] * (this.rg * (b[0] - this.dcB) + this.glottalInjection);
    this.glottalEndFlow = ((o.area[0] / (RHO * C_SOUND)) * (fn[0] - b[0]));

    // jet resistances follow their targets
    const rv = this.resValue;
    if (this.resOn) {
      const rt = this.resTarget, rc = this.resCoef;
      let any = false;
      for (let i = 0; i < n; i++) { rv[i] += (rt[i] - rv[i]) * rc; if (rv[i] > 1e-6) any = true; else rv[i] = 0; }
      this.resOn = any;
    } else {
      for (let i = 0; i < n; i++) if (this.resTarget[i] > 0) { this.resOn = true; break; }
    }

    // oral junctions
    const resOn = this.resOn;
    const P = this.blindAt[0], Q = this.blindAt[1];
    for (let i = 0; i < n - 1; i++) {
      if (i === J || i === P || i === Q) continue;
      const fin = f[i], bin = b[i + 1];
      // the lip exit acts at the last junction
      const rr = resOn ? (i === n - 2 ? rv[i] + rv[n - 1] : rv[i]) : 0;
      if (rr > 0) {
        // series resistance: same volume velocity on both sides, pressure
        // drop R u across the junction (q = rho c u)
        const a1 = o.area[i], a2 = o.area[i + 1];
        const q = (2 * (fin - bin)) / (1 / a1 + 1 / a2 + rr);
        fn[i + 1] = loss[i + 1] * (bin + q / a2);
        bn[i] = loss[i] * (fin - q / a1);
        continue;
      }
      const w = k[i] * (fin - bin);
      fn[i + 1] = loss[i + 1] * (fin + w);
      bn[i] = loss[i] * (bin + w);
    }
    // velum: three-way junction (oral J, oral J+1, nasal 0)
    {
      const a1 = o.area[J], a2 = o.area[J + 1], a3 = ns.area[0];
      const pj = (2 * (a1 * f[J] + a2 * b[J + 1] + a3 * ns.b[0])) / (a1 + a2 + a3);
      fn[J + 1] = loss[J + 1] * (pj - b[J + 1]);
      bn[J] = loss[J] * (pj - f[J]);
      ns.fn[0] = ns.loss[0] * (pj - ns.b[0]);
    }
    // blind branches: three-way junctions (oral j, oral j+1, branch 0)
    for (let q = 0; q < 2; q++) {
      const j = this.blindAt[q];
      if (j < 0) continue;
      const t = this.blind[q];
      const a1 = o.area[j], a2 = o.area[j + 1], a3 = t.area[0];
      const pj = (2 * (a1 * f[j] + a2 * b[j + 1] + a3 * t.b[0])) / (a1 + a2 + a3);
      fn[j + 1] = loss[j + 1] * (pj - b[j + 1]);
      bn[j] = loss[j] * (pj - f[j]);
      t.fn[0] = t.loss[0] * (pj - t.b[0]);
    }
    // sources at oral junctions
    for (let s = 0; s < this.srcCount; s++) {
      const j = this.srcJunction[s];
      if (j < 0 || j >= n - 1) continue;
      const p = this.srcValue[s];
      const r = j === J || j === P || j === Q ? 0 : k[j];
      fn[j + 1] += loss[j + 1] * p * 0.5 * (1 + r);
      bn[j] -= loss[j] * p * 0.5 * (1 - r);
    }
    // yielding walls: flow sink driven by the junction pressure
    if (this.walls) {
      const dt = 1 / this.fs;
      const wj = this.wallJ, ws = this.wallS, wy = this.wallY, wv = this.wallV;
      const rc = RHO * C_SOUND;
      for (let q = 0; q < wj.length; q++) {
        const j = wj[q];
        if (j === J || j === P || j === Q) continue;
        const pj = fn[j + 1] + b[j + 1];
        let v = wv[q];
        v += (dt / WALL_MASS) * (pj - WALL_RES * v - WALL_STIFF * wy[q]);
        wy[q] += dt * v;
        wv[q] = v;
        const uw = ws[q] * v;
        const c = (rc * uw) / (o.area[j] + o.area[j + 1]);
        fn[j + 1] -= loss[j + 1] * c;
        bn[j] -= loss[j] * c;
      }
    }
    if (this.monoJunction >= 0 && this.monoJunction < n - 1) {
      const j = this.monoJunction;
      const v = (RHO * C_SOUND * this.monoValue) / Math.max(0.2, o.area[j] + o.area[j + 1]);
      fn[j + 1] += loss[j + 1] * v;
      bn[j] += loss[j] * v;
    }
    // lips
    {
      const x = f[n - 1];
      const r = this.lipRad;
      const y = r.b0 * x + r.b1 * r.x1 - r.a1 * r.y1;
      r.x1 = x; r.y1 = y;
      bn[n - 1] = loss[n - 1] * y;
      this.lipFlow = (o.area[n - 1] / (RHO * C_SOUND)) * (x - y);
    }

    // nasal branch: common part, choanae, left and right passages
    this.stepNasalPart(ns, 0);
    {
      // three-way junction at the choanae (common last, left 0, right 0)
      const L = this.nasalL, R = this.nasalR, c = ns.n - 1;
      const a1 = ns.area[c], a2 = L.area[0], a3 = R.area[0];
      const pj = (2 * (a1 * ns.f[c] + a2 * L.b[0] + a3 * R.b[0])) / (a1 + a2 + a3);
      ns.bn[c] = ns.loss[c] * (pj - ns.f[c]);
      L.fn[0] = L.loss[0] * (pj - L.b[0]);
      R.fn[0] = R.loss[0] * (pj - R.b[0]);
    }
    this.nosFlow = this.stepNasalPart(this.nasalL, 1, this.nosRadL) + this.stepNasalPart(this.nasalR, 2, this.nosRadR);
    // the blind branches, rigid at the far end
    for (let q = 0; q < 2; q++) {
      if (this.blindAt[q] < 0) continue;
      const t = this.blind[q], tn = t.n;
      for (let i = 0; i < tn - 1; i++) {
        const fin = t.f[i], bin = t.b[i + 1];
        const w = t.k[i] * (fin - bin);
        t.fn[i + 1] = t.loss[i + 1] * (fin + w);
        t.bn[i] = t.loss[i] * (bin + w);
      }
      t.bn[tn - 1] = t.loss[tn - 1] * t.f[tn - 1];
      t.swap();
    }
    // sinus tubes (closed far end)
    for (let q = 0; q < this.sinuses.length; q++) {
      const t = this.sinuses[q].tube;
      const tn = t.n;
      for (let i = 0; i < tn - 1; i++) {
        const fin = t.f[i], bin = t.b[i + 1];
        const w = t.k[i] * (fin - bin);
        t.fn[i + 1] = t.loss[i + 1] * (fin + w);
        t.bn[i] = t.loss[i] * (bin + w);
      }
      t.bn[tn - 1] = t.loss[tn - 1] * t.f[tn - 1]; // rigid end
      t.swap();
    }

    // visualisation accumulators (every 4th sample)
    if (++this.accPhase >= 4) {
      this.accPhase = 0;
      const pa = this.pAcc, ua = this.uAcc;
      const zc = 1 / (RHO * C_SOUND);
      for (let i = 0; i < n; i++) {
        const p = f[i] + b[i];
        const u = o.area[i] * zc * (f[i] - b[i]);
        pa[i] += p * p;
        ua[i] += u * u;
      }
      this.accCount++;
    }

    o.swap();
    ns.swap();
    this.nasalL.swap();
    this.nasalR.swap();
  }

  /**
   * Internal junctions of one part of the nose (with the sinus ostia) and,
   * for a passage, its nostril; returns the nostril volume velocity.
   */
  private stepNasalPart(br: Branch, part: number, rad?: RadFilter): number {
    const nf = br.f, nb = br.b, nfn = br.fn, nbn = br.bn, nk = br.k, nl = br.loss;
    const nn = br.n;
    for (let i = 0; i < nn - 1; i++) {
      let sinus: Sinus | null = null;
      for (let q = 0; q < this.sinuses.length; q++) {
        const sq = this.sinuses[q];
        if (sq.part === part && sq.at === i + 1) { sinus = sq; break; }
      }
      if (sinus) {
        // three-way junction between sections i, i+1 and the sinus neck
        const t = sinus.tube;
        const a1 = br.area[i], a2 = br.area[i + 1], a3 = t.area[0];
        const pj = (2 * (a1 * nf[i] + a2 * nb[i + 1] + a3 * t.b[0])) / (a1 + a2 + a3);
        nfn[i + 1] = nl[i + 1] * (pj - nb[i + 1]);
        nbn[i] = nl[i] * (pj - nf[i]);
        t.fn[0] = t.loss[0] * (pj - t.b[0]);
      } else {
        const fin = nf[i], bin = nb[i + 1];
        const w = nk[i] * (fin - bin);
        nfn[i + 1] = nl[i + 1] * (fin + w);
        nbn[i] = nl[i] * (bin + w);
      }
    }
    if (!rad) return 0;
    const x = nf[nn - 1];
    const y = rad.b0 * x + rad.b1 * rad.x1 - rad.a1 * rad.y1;
    rad.x1 = x; rad.y1 = y;
    nbn[nn - 1] = nl[nn - 1] * y;
    return (br.area[nn - 1] / (RHO * C_SOUND)) * (x - y);
  }
}
