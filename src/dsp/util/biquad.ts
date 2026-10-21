/**
 * Direct-form-I biquad sections (RBJ cookbook designs) for real-time use.
 */
export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  reset(): void { this.x1 = this.x2 = this.y1 = this.y2 = 0; }

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): void {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
  }

  lowpass(f: number, q: number, fs: number): this {
    const w = (2 * Math.PI * Math.min(f, fs * 0.49)) / fs;
    const c = Math.cos(w), al = Math.sin(w) / (2 * q);
    this.set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
    return this;
  }

  highpass(f: number, q: number, fs: number): this {
    const w = (2 * Math.PI * Math.min(f, fs * 0.49)) / fs;
    const c = Math.cos(w), al = Math.sin(w) / (2 * q);
    this.set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
    return this;
  }

  /** Band-pass with constant 0 dB peak gain. */
  bandpass(f: number, q: number, fs: number): this {
    const w = (2 * Math.PI * Math.min(f, fs * 0.49)) / fs;
    const c = Math.cos(w), al = Math.sin(w) / (2 * q);
    this.set(al, 0, -al, 1 + al, -2 * c, 1 - al);
    return this;
  }

  /** Magnitude response at frequency f. */
  magnitude(f: number, fs: number): number {
    const w = (2 * Math.PI * f) / fs;
    const cr1 = Math.cos(w), ci1 = -Math.sin(w), cr2 = Math.cos(2 * w), ci2 = -Math.sin(2 * w);
    const nr = this.b0 + this.b1 * cr1 + this.b2 * cr2, ni = this.b1 * ci1 + this.b2 * ci2;
    const dr = 1 + this.a1 * cr1 + this.a2 * cr2, di = this.a1 * ci1 + this.a2 * ci2;
    return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }
}

/** Butterworth low-pass of even order made of cascaded biquads. */
export class ButterworthLowpass {
  readonly sections: Biquad[];
  constructor(order: number) {
    this.sections = [];
    for (let i = 0; i < order / 2; i++) this.sections.push(new Biquad());
  }
  design(f: number, fs: number): void {
    const n = this.sections.length * 2;
    for (let k = 0; k < this.sections.length; k++) {
      const q = 1 / (2 * Math.cos((Math.PI * (2 * k + 1)) / (2 * n)));
      this.sections[k].lowpass(f, q, fs);
    }
  }
  process(x: number): number {
    let y = x;
    for (let k = 0; k < this.sections.length; k++) y = this.sections[k].process(y);
    return y;
  }
  reset(): void { for (const s of this.sections) s.reset(); }
}

/** One-pole smoother toward a target with time constant tau (s). */
export class Smoother {
  value: number;
  private coef = 0;
  constructor(value: number) { this.value = value; }
  setTau(tau: number, rate: number): void { this.coef = tau <= 0 ? 0 : Math.exp(-1 / (tau * rate)); }
  step(target: number): number {
    this.value = target + (this.value - target) * this.coef;
    return this.value;
  }
}
