/**
 * Narrowest oral passage (on the fine grid the aerodynamics uses) and the
 * first three formants of each phoneme's steady posture: approximants and
 * vowels narrower than about 0.3 cm^2 hiss.
 *   npx tsx scripts/areas.ts [ɹ ɝ j l w i ...]
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';

const list = process.argv.slice(2);
const names = list.length ? list : Object.keys(PHONEMES);
for (const ph of names) {
  const p = PHONEMES[ph];
  if (!p) { console.log(`${ph}: unknown`); continue; }
  const a = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...p.art };
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  let m = Infinity, at = 0;
  for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6 && g.hits[i].area < m) { m = g.hits[i].area; at = g.s[i]; }
  const f = formants(sectionsFromGeometry(g), {}, 4000).slice(0, 3).map((x) => x.f.toFixed(0)).join('/');
  console.log(`${ph.padEnd(3)} ${p.manner.padEnd(12)} min ${m.toFixed(3)} cm2 at ${at.toFixed(1)} cm, slit ${g.teethPos > 0 ? g.slit.area.toFixed(3) : '-'}, F ${f}`);
}
