/**
 * What the three-dimensional cross-sections do to each phoneme's steady
 * posture: the narrowest passage (area, perimeter relative to a round duct,
 * hydraulic diameter), the lateral channels, and the first formants with and
 * without the piriform fossae.
 *   npx tsx scripts/areas3d.ts [i a u l ...]
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';

const list = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = list.length ? list : Object.keys(PHONEMES);
const f3 = (fm: { f: number }[]) => fm.slice(0, 3).map((x) => x.f.toFixed(0)).join('/');
for (const ph of names) {
  const p = PHONEMES[ph];
  if (!p || p.parts) continue;
  const a = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...p.art };
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  let m = Infinity, at = 0, per = 0, lat = 0;
  for (let i = 0; i <= g.lastRay; i++) {
    const h = g.hits[i];
    lat = Math.max(lat, h.lateral);
    if (g.s[i] >= 2.6 && h.area < m) { m = h.area; at = g.s[i]; per = h.perimeter; }
  }
  const af = sectionsFromGeometry(g);
  const shape = m > 0 ? per / (2 * Math.sqrt(Math.PI * m)) : 0;
  const dh = per > 0 ? (4 * m) / per : 0;
  let soft = 0, sh = 0;
  for (let k = 0; k < af.areas.length; k++) { soft += af.soft![k]; sh += af.shape![k]; }
  const fp = formants(af, {}, 5000);
  const f0 = formants(af, { piriform: false }, 5000);
  console.log(
    `${ph.padEnd(3)} min ${m.toFixed(3)} at ${at.toFixed(1)} shape ${shape.toFixed(2)} dh ${dh.toFixed(2)}`
    + `${lat > 0 ? ` lateral ${lat.toFixed(2)}` : ''} | mean shape ${(sh / af.areas.length).toFixed(2)} soft ${(soft / af.areas.length).toFixed(2)}`
    + ` | F ${f3(f0)} -> with fossae ${f3(fp)}`,
  );
}
