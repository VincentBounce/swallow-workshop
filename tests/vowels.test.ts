import { describe, it, expect } from 'vitest';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { VOWELS } from '../src/dsp/speech/phonemes';
import { PETERSON_BARNEY, HILLENBRAND_MEN, MALE_TARGETS } from '../src/dsp/data/vowels';
import { note } from './helpers';

function vowelFormants(v: string, scale = 1) {
  const a = { ...DEFAULT_ARTICULATORS, ...VOWELS[v].art };
  const g = computeGeometry(a, { ...DEFAULT_ANATOMY, scale }, DEFAULT_TEETH);
  const af = sectionsFromGeometry(g);
  return { f: formants(af, { scale }), length: g.length };
}

describe('articulatory vowels land in the right regions of the vowel chart', () => {
  // Regions: Peterson & Barney (1952) and Hillenbrand et al. (1995) adult-male
  // means, with a tolerance comparable to the spread between speakers.
  const men = new Map(PETERSON_BARNEY.men.map((r) => [r.ipa, r]));
  const hil = new Map(HILLENBRAND_MEN.map((r) => [r.ipa, r]));
  for (const v of Object.keys(MALE_TARGETS)) {
    it(`/${v}/`, () => {
      const { f, length } = vowelFormants(v);
      const [t1, t2] = MALE_TARGETS[v];
      note(`vowel /${v}/`, `F1 ${f[0].f.toFixed(0)} F2 ${f[1].f.toFixed(0)} F3 ${f[2].f.toFixed(0)} Hz (target ${t1}/${t2}), L=${length.toFixed(1)} cm`);
      expect(Math.abs(f[0].f - t1) / t1).toBeLessThan(0.12);
      expect(Math.abs(f[1].f - t2) / t2).toBeLessThan(0.1);
      const pb = men.get(v);
      const h = hil.get(v);
      for (const ref of [pb, h]) {
        if (!ref) continue;
        expect(Math.abs(Math.log(f[0].f / ref.f1))).toBeLessThan(0.3);
        expect(Math.abs(Math.log(f[1].f / ref.f2))).toBeLessThan(0.25);
      }
    });
  }

  it('the vowel quadrilateral keeps its shape (i high-front, a low, u high-back)', () => {
    const i = vowelFormants('i').f, a = vowelFormants('a').f, u = vowelFormants('u').f;
    expect(i[0].f).toBeLessThan(a[0].f * 0.5);
    expect(u[0].f).toBeLessThan(a[0].f * 0.5);
    expect(i[1].f).toBeGreaterThan(u[1].f * 2);
    expect(a[1].f).toBeGreaterThan(u[1].f);
    expect(a[1].f).toBeLessThan(i[1].f);
  });

  it('the formants of /u/ move smoothly as the lips open and close around it', () => {
    // the lower lip entering the gap above the lower incisors used to split
    // it in one step: F2 jumped by 5 % between two neighbouring lip openings
    const base = { ...DEFAULT_ARTICULATORS, ...VOWELS.u.art };
    let prev: number[] | null = null, worst = 0;
    for (let k = -14; k <= 16; k++) {
      const a = { ...base, lipOpen: base.lipOpen + 0.005 * k };
      const f = formants(sectionsFromGeometry(computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH)), {}).slice(0, 2).map((x) => x.f);
      if (prev) for (let j = 0; j < 2; j++) worst = Math.max(worst, Math.abs(f[j] / prev[j] - 1));
      prev = f;
    }
    note('/u/ lip sweep', `largest F1/F2 step ${(100 * worst).toFixed(2)} % per 0.005 of lip opening`);
    expect(worst).toBeLessThan(0.015);
  });

  it('a smaller speaker (child-sized tract) has proportionally higher formants', () => {
    const big = vowelFormants('a', 1).f;
    const small = vowelFormants('a', 0.75).f;
    const ratio = small[1].f / big[1].f;
    note('scaling /a/ 0.75x', `F2 ratio ${ratio.toFixed(3)} (ideal 1.333)`);
    expect(ratio).toBeGreaterThan(1.22);
    expect(ratio).toBeLessThan(1.42);
  });
});
