/**
 * Builds the American English pronunciation lexicon used by the speak panel
 * from the "gold" dictionary of the misaki G2P (hexgrad, Apache-2.0): about
 * 90 000 words with stress marks, in misaki's compact alphabet (A = eɪ,
 * I = aɪ, O = oʊ, W = aʊ, Y = ɔɪ, ʤ, ʧ, ᵊ, ᵻ, ɾ, ʔ ...). The output is a
 * gzip-compressed "word<TAB>phonemes" list, decompressed in the browser.
 *   npx tsx scripts/build-lexicon.ts path/to/us_gold.json [public/lexicon/en-us.lex]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

const src = process.argv[2];
const dst = process.argv[3] ?? 'public/lexicon/en-us.lex';
if (!src) throw new Error('usage: build-lexicon.ts us_gold.json [out]');
const gold = JSON.parse(readFileSync(src, 'utf-8')) as Record<string, string | Record<string, string | null>>;

const entries = new Map<string, string>();
for (const [word, v] of Object.entries(gold)) {
  // homographs carry one pronunciation per part of speech: keep the default one
  const ps = typeof v === 'string' ? v : (v.DEFAULT ?? Object.values(v).find((x) => x));
  if (!ps || !/^[A-Za-z][A-Za-z'-]*$/.test(word)) continue;
  const key = word.toLowerCase();
  // the lower-case spelling wins over capitalised names and acronyms
  if (entries.has(key) && word !== key) continue;
  entries.set(key, ps);
}
const keys = [...entries.keys()].sort();
const text = keys.map((k) => `${k}\t${entries.get(k)}`).join('\n') + '\n';
mkdirSync(dirname(dst), { recursive: true });
const gz = gzipSync(Buffer.from(text, 'utf-8'), { level: 9 });
writeFileSync(dst, gz);
console.log(`${keys.length} words, ${(text.length / 1e6).toFixed(2)} MB text, ${(gz.length / 1e6).toFixed(2)} MB compressed -> ${dst}`);
