/**
 * Prints the phones of a text as the speak panel sees them.
 *   npx tsx scripts/g2p.ts en "the voice is made of air"
 *   npx tsx scripts/g2p.ts it "la voce è fatta di aria"
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { textToPhones, Phone } from '../src/dsp/speech/g2p';
import { setEnglishLexicon, englishPronunciation } from '../src/dsp/speech/english';

const lang = (process.argv[2] ?? 'en') as 'it' | 'en';
const text = process.argv.slice(3).join(' ') || 'a buzz, a hiss and a filter';
if (lang === 'en') setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));

const show = (ph: Phone[]) => ph.map((p) => (p.stress ? 'ˈ' : p.stress2 ? 'ˌ' : '') + p.ipa + (p.long ? 'ː' : '') + (p.reduced ? '̆' : '') + (p.wordEnd ? (p.pause ? (p.question ? ' ? ' : ' | ') : ' ') : '')).join('');
console.log(show(textToPhones(text, lang)));
if (lang === 'en') {
  for (const w of text.toLowerCase().split(/[^a-z']+/).filter(Boolean)) {
    const r = englishPronunciation(w);
    if (r.source !== 'lexicon') console.log(`  ${w}: ${r.ps} (${r.source})`);
  }
}
