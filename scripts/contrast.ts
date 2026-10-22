/**
 * How deep each consonant dips below its vowels: the quietest 10 ms of the
 * consonant against the loudest 10 ms of the neighbouring vowels, with the
 * narrowest oral passage reached. In natural speech nasals dip about 6-12 dB,
 * voiced fricatives 12-20 dB, voiced stop closures 20-30 dB, /l ɹ w j/ 3-8 dB.
 *   npx tsx scripts/contrast.ts en "every voice"
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { textToPhones } from '../src/dsp/speech/g2p';
import { setEnglishLexicon } from '../src/dsp/speech/english';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES, isVowel } from '../src/dsp/speech/phonemes';

setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));
const lang = (process.argv[2] ?? 'en') as 'it' | 'en';
const text = process.argv.slice(3).filter((a) => !a.startsWith('--')).join(' ') || 'every voice';
const p = defaultParams();
const sc = buildScore(textToPhones(text, lang), { lang, f0: p.source.f0 });
const fs = 48000, hop = 96;
const e = new VoiceEngine(fs, p);
e.snapArticulators(); e.snapPressure(); e.playScore(sc);
// 2 ms hops: energy and constriction area
const en: number[] = [], area: number[] = [];
const buf = new Float32Array(hop);
for (let t = 0; t < sc.duration + 0.1; t += hop / fs) {
  e.process(buf, hop);
  let r = 0; for (const x of buf) r += x * x;
  en.push(r / hop);
  area.push(e.telemetry().constrictionArea);
}
const dt = hop / fs;
// 10 ms moving average of the energy, in dB
const lev = en.map((_, i) => { let s = 0, n = 0; for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < en.length) { s += en[k]; n++; } return 10 * Math.log10(s / n + 1e-14); });
const idx = (t: number) => Math.max(0, Math.min(lev.length - 1, Math.round(t / dt)));
const range = (t0: number, t1: number, f: (a: number, b: number) => number, arr: number[]) => { let m = f === Math.max ? -Infinity : Infinity; for (let i = idx(t0); i <= idx(t1); i++) m = f(m, arr[i]); return m; };
const ph = sc.phones;
const rows: string[] = [];
for (let i = 0; i < ph.length; i++) {
  const q = ph[i];
  if (isVowel(q.ipa) || q.ipa === '_' || !PHONEMES[q.ipa]) continue;
  const prev = ph.slice(0, i).reverse().find((x) => isVowel(x.ipa));
  const next = ph.slice(i + 1).find((x) => isVowel(x.ipa));
  const vmax = Math.max(prev ? range(prev.t0, prev.t1, Math.max, lev) : -200, next ? range(next.t0, next.t1, Math.max, lev) : -200);
  // the acoustic consonant lags its label a little (the articulators take time)
  const a0 = q.t0 + 0.01, a1 = Math.max(a0, q.t1 + 0.012);
  const cmin = range(a0, a1, Math.min, lev);
  const amin = range(a0, a1, Math.min, area);
  rows.push(`${q.ipa.padEnd(3)} ${PHONEMES[q.ipa].manner.padEnd(12)} dip ${(vmax - cmin).toFixed(1).padStart(5)} dB  narrowest ${amin.toFixed(3)} cm2 (target ${targetArea(q.ipa)})`);
}
console.log(rows.join('\n'));

function targetArea(ipa: string): string {
  const t: Record<string, string> = { m: '0', n: '0', 'ŋ': '0', 'ɲ': '0', b: '0', d: '0', g: '0', p: '0', t: '0', k: '0', v: '0.12', 'ð': '0.12', z: '0.09', 'ʒ': '0.2', f: '0.12', 'θ': '0.12', s: '0.09', 'ʃ': '0.2' };
  return t[ipa] ?? '-';
}
