/**
 * Exploration helper: renders a phoneme with the real-time engine and prints
 * level, F0, LPC formants and spectral peaks; optionally writes a WAV.
 *   npx tsx scripts/explore.ts a [out.wav] [model]
 */
import { writeFileSync } from 'node:fs';
import { renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { lpcFormants, decimate } from '../src/dsp/analysis/lpc';
import { yin } from '../src/dsp/analysis/pitch';
import { welch } from '../src/dsp/util/fft';
import { encodeWav } from '../src/dsp/util/wav';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';

const ph = process.argv[2] ?? 'a';
const wav = process.argv[3];
const model = (process.argv[4] ?? 'lf') as 'lf' | 'twomass';
const p = defaultParams();
const P = PHONEMES[ph];
p.articulators = { ...p.articulators, ...(P?.art ?? {}) };
p.abduction = P?.abduction ?? 0;
p.voicing = P ? P.voiced : true;
p.phonate = true;
p.source.model = model;
p.source.f0 = 120;
const t0 = performance.now();
const { out, engine } = renderOffline(p, 1.0);
const t1 = performance.now();
const fs = 48000;
const seg = out.subarray(24000, 48000);
let rms = 0, peak = 0;
for (const x of seg) { rms += x * x; peak = Math.max(peak, Math.abs(x)); }
rms = Math.sqrt(rms / seg.length);
console.log(`${ph} model=${model} render ${(t1 - t0).toFixed(0)} ms for 1 s (fsT=${engine.tractRate.toFixed(0)}), rms ${(20 * Math.log10(rms)).toFixed(1)} dBFS, peak ${peak.toFixed(3)}`);
const f0 = yin(seg.subarray(0, 4096), fs);
console.log(`F0 ${f0.f0.toFixed(1)} Hz conf ${f0.confidence.toFixed(2)}`);
const d = decimate(seg, 4);
const fr = d.subarray(2000, 2000 + 512);
const lf = lpcFormants(fr, 12000, 14);
console.log('LPC formants', lf.slice(0, 5).map((x) => `${x.f.toFixed(0)}(${x.bw.toFixed(0)})`).join(' '));
const g = computeGeometry(p.articulators, p.anatomy, p.teeth);
const af = sectionsFromGeometry(g);
console.log('reference formants', formants(af, { velum: p.articulators.velum }).slice(0, 5).map((x) => `${x.f.toFixed(0)}(${x.bw.toFixed(0)})`).join(' '));
const spec = welch(seg, 2048);
// spectral peak and centroid above 1 kHz
let pk = 0, pkf = 0, num = 0, den = 0;
for (let k = 1; k < spec.length; k++) {
  const f = (k * fs) / 2048;
  if (f < 1000 || f > 12000) continue;
  if (spec[k] > pk) { pk = spec[k]; pkf = f; }
  num += f * spec[k]; den += spec[k];
}
console.log(`spectral peak (1-12k) ${pkf.toFixed(0)} Hz, centroid ${(num / den).toFixed(0)} Hz`);
const tel = engine.telemetry();
console.log(`L=${tel.length.toFixed(2)} Po=${(tel.po / 980).toFixed(2)} cmH2O ug=${tel.ug.toFixed(0)} jet v=${tel.jet.v.toFixed(0)} Re=${tel.jet.re.toFixed(0)} imp=${tel.jet.impinge.toFixed(2)} toTeeth=${tel.jet.toTeeth.toFixed(2)} wall=${tel.jet.wallSource.toFixed(1)} obs=${tel.jet.obstacleSource.toFixed(1)} constr=${tel.constrictionArea.toFixed(3)}@${tel.constrictionIndex} voicing=${tel.voicingAmp.toFixed(2)}`);
if (wav) writeFileSync(wav, encodeWav(out, fs));
// band levels (dB) in 500 Hz bands up to 12 kHz
{
  const bands: string[] = [];
  for (let b = 0; b < 24; b++) {
    let acc = 0, cnt = 0;
    for (let k = 1; k < spec.length; k++) {
      const f = (k * fs) / 2048;
      if (f >= b * 500 && f < (b + 1) * 500) { acc += spec[k]; cnt++; }
    }
    bands.push((10 * Math.log10(acc / Math.max(cnt, 1) + 1e-30)).toFixed(0));
  }
  console.log('bands/500Hz', bands.join(' '));
}
