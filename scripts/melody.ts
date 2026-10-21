/**
 * Prints the planned F0 of a sentence at the middle of each phone, in Hz and
 * in semitones above the lowest point, to see where the accents land.
 *   npx tsx scripts/melody.ts en "Every voice you have ever heard"
 *   ACCENT=5 F0=210 npx tsx scripts/melody.ts en "..."
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { textToPhones } from '../src/dsp/speech/g2p';
import { setEnglishLexicon } from '../src/dsp/speech/english';
import { buildScore } from '../src/dsp/speech/sequencer';

setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));
const lang = (process.argv[2] ?? 'en') as 'it' | 'en';
const text = process.argv.slice(3).join(' ') || 'Every voice you have ever heard is made of just two ingredients.';
const sc = buildScore(textToPhones(text, lang), {
  lang, f0: Number(process.env.F0 ?? 120), ...(process.env.ACCENT ? { accent: Number(process.env.ACCENT) } : {}),
});
const f0At = (t: number) => sc.frames[Math.min(sc.frames.length - 1, Math.max(0, Math.round(t / (sc.frames[1].t - sc.frames[0].t))))].f0;
const lo = Math.min(...sc.frames.filter((f) => f.t < sc.duration).map((f) => f.f0));
for (const q of sc.phones) {
  const f = f0At(0.5 * (q.t0 + q.t1));
  const st = 12 * Math.log2(f / lo);
  console.log(`${q.ipa.padEnd(3)} ${(q.t0 * 1000).toFixed(0).padStart(5)} ms ${f.toFixed(0).padStart(4)} Hz ${st.toFixed(1).padStart(5)} st ${'#'.repeat(Math.round(st * 3))}`);
}
