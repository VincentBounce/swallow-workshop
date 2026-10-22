/**
 * Compares the tract with the area functions measured by MRI (Story 2008):
 *  1. the acoustic model on the measured areas, against the formants Story
 *     computed from them and the formants of the speaker's recorded vowels;
 *  2. the shape of our vowels against the measured shapes (both stretched to
 *     the same length): RMS difference of the log areas, narrowest passage.
 *   npx tsx scripts/mri.ts [--profiles]
 */
import { MRI_VOWELS, mriAreaFunction, shapeDistance, narrowestAbove } from '../src/dsp/data/mri';
import { formants } from '../src/dsp/tract/acoustics';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { VOWELS } from '../src/dsp/speech/phonemes';

const pct = (a: number, b: number) => `${(100 * (a / b - 1)).toFixed(0).padStart(4)}%`;
const f3 = (f: number[]) => f.slice(0, 3).map((x) => x.toFixed(0).padStart(4)).join(' ');

console.log('1. acoustic model on the measured areas');
console.log('vowel  ours            Story computed  diff              recorded        diff');
for (const v of MRI_VOWELS) {
  const f = formants(mriAreaFunction(v), {}, 4000).map((x) => x.f);
  console.log(`${v.ipa.padEnd(5)}  ${f3(f)}  ${f3(v.computed)}  ${v.computed.map((c, k) => pct(f[k], c)).join(' ')}  ${f3(v.recorded)}  ${v.recorded.map((c, k) => pct(f[k], c)).join(' ')}`);
}

console.log('\n2. our vowels against the measured shapes');
console.log('vowel  length ours/MRI  shape  narrowest ours/MRI  formants ours   recorded');
let sum = 0;
for (const v of MRI_VOWELS) {
  const ph = VOWELS[v.ipa];
  const g = computeGeometry({ ...DEFAULT_ARTICULATORS, ...ph.art }, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const af = sectionsFromGeometry(g);
  const d = shapeDistance(af.areas, v.areas);
  sum += d;
  const f = formants(af, {}, 4000).map((x) => x.f);
  console.log(`${v.ipa.padEnd(5)}  ${af.length.toFixed(1)}/${(v.areas.length * v.dx).toFixed(1)}       ${d.toFixed(2)}   ${narrowestAbove(af.areas, af.dx).toFixed(2)}/${narrowestAbove(v.areas, v.dx).toFixed(2)}           ${f3(f)}  ${f3(v.recorded)}`);
  if (process.argv.includes('--profiles')) {
    const row = (x: ArrayLike<number>) => Array.from({ length: 22 }, (_, k) => {
      const p = Math.min(x.length - 1, Math.max(0, ((k + 0.5) / 22) * x.length - 0.5));
      return x[Math.round(p)].toFixed(1).padStart(4);
    }).join(' ');
    console.log(`  ours ${row(af.areas)}\n  MRI  ${row(v.areas)}`);
  }
}
console.log(`mean shape distance ${(sum / MRI_VOWELS.length).toFixed(2)}`);
