/**
 * Small, allocation-free random generators for the audio thread.
 * xorshift128+ style generator on 32-bit integers, plus an approximately
 * Gaussian generator (sum of four uniforms, unit variance).
 */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed = 12345) {
    this.s0 = seed | 0 || 1;
    this.s1 = 0x9e3779b9 ^ seed;
    this.s2 = 0x243f6a88 + seed * 7;
    this.s3 = 0xb7e15162 - seed * 13;
    for (let i = 0; i < 16; i++) this.nextU32();
  }

  /** xoshiro128** */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9);
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result >>> 0;
  }

  /** Uniform in [0, 1). */
  uniform(): number {
    return this.nextU32() / 4294967296;
  }

  /** Approximately N(0, 1): Irwin-Hall with 4 uniforms, rescaled. */
  gauss(): number {
    const s = this.uniform() + this.uniform() + this.uniform() + this.uniform();
    return (s - 2) * 1.7320508075688772; // var of sum of 4 U(0,1) = 1/3
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}
