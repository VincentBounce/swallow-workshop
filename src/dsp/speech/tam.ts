/**
 * Target Approximation Model (Birkholz 2007; Prom-on, Xu & Thipakorn 2009):
 * each articulator follows its (piecewise constant) target through a
 * critically damped third-order linear system, here realised as three
 * identical first-order sections with time constant tau. The movement starts
 * smoothly, never overshoots, and coarticulation arises when targets change
 * before they are reached.
 */
export class TamChannel {
  y1: number; y2: number; y3: number;
  tau: number;
  constructor(value: number, tau: number) { this.y1 = this.y2 = this.y3 = value; this.tau = tau; }
  set(value: number): void { this.y1 = this.y2 = this.y3 = value; }
  step(target: number, dt: number): number {
    const a = 1 - Math.exp(-dt / this.tau);
    this.y1 += (target - this.y1) * a;
    this.y2 += (this.y1 - this.y2) * a;
    this.y3 += (this.y2 - this.y3) * a;
    return this.y3;
  }
  get value(): number { return this.y3; }
}

/** Default time constants (s) of the articulators and source controls. */
export const TAM_TAU: Record<string, number> = {
  jaw: 0.018,
  tongueX: 0.016,
  tongueY: 0.016,
  tipX: 0.009,
  tipY: 0.009,
  groove: 0.01,
  lipOpen: 0.009,
  lipRound: 0.02,
  lipProtrude: 0.02,
  lipTuck: 0.011,
  velum: 0.016,
  larynx: 0.03,
  abduction: 0.011,
  f0: 0.025,
  ps: 0.02,
};
