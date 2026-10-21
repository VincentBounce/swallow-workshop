/**
 * Traces a sentence through the engine every 2 ms: phone, oral constriction
 * area, intraoral pressure, voicing, glottal gate, output level.
 *   npx tsx scripts/trace.ts it "il carro"
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { textToPhones } from '../src/dsp/speech/g2p';
import { setEnglishLexicon } from '../src/dsp/speech/english';
import { buildScore } from '../src/dsp/speech/sequencer';

setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));
const lang = (process.argv[2] ?? 'it') as 'it' | 'en';
const text = process.argv.slice(3).join(' ') || 'il carro';
const sc = buildScore(textToPhones(text, lang), { lang });
const p = defaultParams();
const e = new VoiceEngine(48000, p);
e.snapArticulators(); e.snapPressure();
e.playScore(sc);
const block = 96;
const buf = new Float32Array(block);
let line = '';
for (let t = 0; t < sc.duration + 0.1; t += block / 48000) {
  e.process(buf, block);
  let r = 0; for (const x of buf) r += x * x;
  const tel = e.telemetry();
  const db = 10 * Math.log10(r / block + 1e-12);
  line = `${t.toFixed(3)} ${tel.phone.padEnd(3)} A=${tel.constrictionArea.toFixed(3)} Po=${(tel.po / 980).toFixed(2)} v=${tel.voicingAmp.toFixed(2)} abd=${tel.abduction.toFixed(2)} f0=${tel.f0.toFixed(0)} out=${db.toFixed(0)}dB asp=${(20 * Math.log10(tel.levels.aspiration + 1e-9)).toFixed(0)}`;
  console.log(line);
}
