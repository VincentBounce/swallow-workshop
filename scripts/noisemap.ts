/**
 * Per phone of a sentence: output level and the level of each noise source
 * relative to the voiced output, to find where hiss leaks into voiced sounds.
 *   npx tsx scripts/noisemap.ts en "every voice"
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { textToPhones } from '../src/dsp/speech/g2p';
import { setEnglishLexicon } from '../src/dsp/speech/english';
import { buildScore } from '../src/dsp/speech/sequencer';

setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));
const lang = (process.argv[2] ?? 'en') as 'it' | 'en';
const text = process.argv.slice(3).filter((a) => !a.startsWith('--')).join(' ') || 'every voice';
const p = defaultParams();
if (process.argv.includes('--woman')) { p.anatomy.scale = 0.87; p.anatomy.pharynx = 0.86; p.source.f0 = 210; p.source.rd = 1.3; p.source.chink = 0.03; p.source.peakArea = 0.09; }
const sc = buildScore(textToPhones(text, lang), { lang, f0: p.source.f0 });
const e = new VoiceEngine(48000, p);
e.snapArticulators(); e.snapPressure(); e.playScore(sc);
const acc = new Map<string, { n: number; out: number; asp: number; wall: number; obs: number; re: number; area: number }>();
const order: string[] = [];
const buf = new Float32Array(96);
for (let t = 0; t < sc.duration + 0.1; t += 96 / 48000) {
  e.process(buf, 96);
  const tel = e.telemetry();
  const ph = sc.phones.find((q) => t >= q.t0 && t < q.t1);
  const key = ph ? `${sc.phones.indexOf(ph)}:${ph.ipa}` : 'tail';
  if (!acc.has(key)) { acc.set(key, { n: 0, out: 0, asp: 0, wall: 0, obs: 0, re: 0, area: 0 }); order.push(key); }
  const a = acc.get(key)!;
  let r = 0; for (const x of buf) r += x * x;
  a.n++; a.out += r / buf.length; a.asp += tel.levels.aspiration ** 2; a.wall += tel.levels.wall ** 2; a.obs += tel.levels.obstacle ** 2;
  a.re = Math.max(a.re, tel.jet.re); a.area += tel.constrictionArea;
}
const db = (x: number) => (10 * Math.log10(x + 1e-20)).toFixed(0).padStart(4);
console.log('phone     out  asp wall  obs   maxRe  area');
for (const k of order) {
  const a = acc.get(k)!;
  console.log(`${k.padEnd(8)} ${db(a.out / a.n)} ${db(a.asp / a.n)} ${db(a.wall / a.n)} ${db(a.obs / a.n)}  ${a.re.toFixed(0).padStart(6)} ${(a.area / a.n).toFixed(2)}`);
}
