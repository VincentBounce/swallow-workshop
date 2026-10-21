/**
 * Prints the radiated transfer (|U_lip/P_s| * f, dB) of a dipole noise source
 * placed at each junction near the front, for a phoneme.
 *   npx tsx scripts/noise-transfer.ts s
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { sourceTransferMagnitudes } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';

const ph = process.argv[2] ?? 's';
const a = { ...DEFAULT_ARTICULATORS, ...PHONEMES[ph].art };
const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
const af = sectionsFromGeometry(g);
console.log(`${ph}: L=${af.length.toFixed(2)} dx=${af.dx.toFixed(3)} teethIndex=${af.teethIndex} lipsIndex=${af.lipsIndex}`);
console.log('areas', Array.from(af.areas).map((x, i) => `${i}:${x.toFixed(2)}`).slice(26).join(' '));
const freqs = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000, 10000];
console.log('junction  ' + freqs.map((f) => String(f).padStart(6)).join(''));
for (let k = 28; k < af.areas.length; k++) {
  const m = sourceTransferMagnitudes(af, k, freqs, {});
  console.log(String(k).padStart(8) + '  ' + Array.from(m).map((x, i) => (20 * Math.log10(x * freqs[i] + 1e-30)).toFixed(0).padStart(6)).join(''));
}
