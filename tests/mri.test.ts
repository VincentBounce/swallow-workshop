import { describe, it, expect } from 'vitest';
import { MRI_VOWELS, mriAreaFunction, shapeDistance, narrowestAbove } from '../src/dsp/data/mri';
import { formants } from '../src/dsp/tract/acoustics';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { VOWELS } from '../src/dsp/speech/phonemes';
import { note } from './helpers';

describe('area functions measured by MRI (Story 2008)', () => {
  it('the acoustic model gives the formants Story computed from the same areas', () => {
    // a check of the acoustics on real shapes: losses, walls and radiation
    // differ in detail between the two models, F1 most (wall vibration)
    const err = [0, 0, 0];
    for (const v of MRI_VOWELS) {
      const f = formants(mriAreaFunction(v), {}, 4000).map((x) => x.f);
      for (let k = 0; k < 3; k++) {
        const e = Math.abs(f[k] / v.computed[k] - 1);
        err[k] += e / MRI_VOWELS.length;
        expect(e).toBeLessThan([0.1, 0.06, 0.03][k]);
      }
    }
    note('MRI areas, acoustic model', `mean difference from Story's computed formants F1 ${(100 * err[0]).toFixed(1)} %, F2 ${(100 * err[1]).toFixed(1)} %, F3 ${(100 * err[2]).toFixed(1)} % (11 vowels)`);
  });

  it('the vowels of the articulatory model have the measured shapes, never narrower', () => {
    let sum = 0, worst = 0, worstV = '';
    for (const v of MRI_VOWELS) {
      const af = sectionsFromGeometry(computeGeometry({ ...DEFAULT_ARTICULATORS, ...VOWELS[v.ipa].art }, DEFAULT_ANATOMY, DEFAULT_TEETH));
      const d = shapeDistance(af.areas, v.areas);
      sum += d;
      if (d > worst) { worst = d; worstV = v.ipa; }
      // a narrower passage than the measured one would hiss
      expect(narrowestAbove(af.areas, af.dx)).toBeGreaterThan(0.95 * narrowestAbove(v.areas, v.dx));
    }
    const mean = sum / MRI_VOWELS.length;
    note('vowel shapes vs MRI', `log-area distance mean ${mean.toFixed(2)}, worst /${worstV}/ ${worst.toFixed(2)} (drawing alone: 0.98)`);
    expect(mean).toBeLessThan(0.65);
    expect(worst).toBeLessThan(0.85);
  });
});
