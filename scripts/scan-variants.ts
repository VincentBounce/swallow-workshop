/**
 * Scans articulator variants of a phoneme and prints the area function tail
 * and the peak of the radiated transfer from a noise source at the teeth.
 *   npx tsx scripts/scan-variants.ts ʃ '[{"jaw":0.2}]'
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { sourceTransferMagnitudes } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, Articulators } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';

const base = { ...DEFAULT_ARTICULATORS, ...PHONEMES[process.argv[2] ?? 'ʃ'].art };
const variants: Partial<Articulators>[] = JSON.parse(process.argv[3] ?? '[{}]');
const freqs: number[] = [];
for (let f = 1000; f <= 9000; f += 250) freqs.push(f);
for (const v of variants) {
  const a = { ...base, ...v };
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const af = sectionsFromGeometry(g);
  let mn = Infinity, mi = 0;
  for (let i = 20; i < af.areas.length; i++) if (af.areas[i] < mn) { mn = af.areas[i]; mi = i; }
  const k = Math.min(af.areas.length - 2, af.teethIndex);
  const m = sourceTransferMagnitudes(af, k, freqs, {});
  let best = 0, bf = 0;
  m.forEach((x, i) => { const r = x * freqs[i]; if (r > best) { best = r; bf = freqs[i]; } });
  console.log(
    JSON.stringify(v),
    `L=${af.length.toFixed(2)} min ${mn.toFixed(2)}@${mi} teeth ${af.teethIndex} slit ${g.slit.area.toFixed(2)} peak ${bf} Hz |`,
    Array.from(af.areas).slice(26).map((x) => x.toFixed(1)).join(' '),
  );
}
