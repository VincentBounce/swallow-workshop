/**
 * Vowels in running speech: how close each vowel of a sentence gets to the
 * same vowel held on its own (the bench is in tests/contextBench.ts).
 *
 *   npx tsx scripts/context.ts                     # tables per vowel and the summary
 *   npx tsx scripts/context.ts --tokens            # every vowel token, with its neighbours
 *   npx tsx scripts/context.ts --save a.json       # keep the measures
 *   npx tsx scripts/context.ts --base a.json       # the summary against measures kept before
 *   npx tsx scripts/context.ts --lang en           # one language only
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Lang } from '../src/dsp/speech/g2p';
import { setEnglishLexicon } from '../src/dsp/speech/english';
import { CONTEXT_CORPUS, Token, avg, measure, summary } from '../tests/contextBench';

setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const onlyLang = opt('--lang') as Lang | undefined;

/** the articulators shown in the tables (the summary and --save keep all of them) */
const KEYS = ['tongueX', 'tongueY', 'tongueRoot', 'tipX', 'tipY', 'jaw', 'lipOpen', 'lipRound', 'velum'] as const;

const tokens: Token[] = [];
for (const [text, lang] of CONTEXT_CORPUS) if (!onlyLang || lang === onlyLang) tokens.push(...measure(text, lang));

if (args.includes('--tokens')) {
  for (const t of tokens) {
    console.log(`${t.lang} ${t.ipa.padEnd(3)} ${t.ctx.padEnd(8)} ${(t.dur * 1000).toFixed(0).padStart(4)} ms  F ${t.f.map((x) => x.toFixed(0)).join('/')} (held ${t.held.map((x) => x.toFixed(0)).join('/')})  port ${t.port.toFixed(2)}  `
      + KEYS.map((k) => `${k} ${t.miss[k] >= 0 ? '+' : ''}${t.miss[k].toFixed(2)}`).join(' '));
  }
  console.log();
}

const byV = new Map<string, Token[]>();
for (const t of tokens) { const k = `${t.lang} ${t.ipa}`; byV.set(k, [...(byV.get(k) ?? []), t]); }
console.log('vowel     n   F1/F2/F3 reached   held               F2 ratio  B1/B2/B3     port   miss: ' + KEYS.join(' '));
for (const [k, ts] of [...byV].sort()) {
  const col = (f: (t: Token) => number) => avg(ts.map(f));
  console.log(`${k.padEnd(8)} ${String(ts.length).padStart(2)}   ${[0, 1, 2].map((i) => col((t) => t.f[i]).toFixed(0)).join('/').padEnd(17)}  ${ts[0].held.map((x) => x.toFixed(0)).join('/').padEnd(17)}  ${col((t) => t.f[1] / t.held[1]).toFixed(2).padStart(8)}  ${[0, 1, 2].map((i) => col((t) => t.b[i]).toFixed(0)).join('/').padEnd(12)} ${col((t) => t.port).toFixed(2).padStart(5)}   `
    + KEYS.map((q) => { const v = col((t) => t.miss[q]); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`; }).join(' '));
}

const sum = summary(tokens);
const save = opt('--save');
if (save) writeFileSync(save, JSON.stringify({ tokens, summary: sum }, null, 1));
const base = opt('--base');
// measures kept before are summarized again, so that a number added since is there too
const before = base ? summary((JSON.parse(readFileSync(base, 'utf-8')) as { tokens: Token[] }).tokens.filter((t) => !onlyLang || t.lang === onlyLang)) : null;
console.log(`\nsummary (${tokens.length} vowels)${before ? '                                      before      now' : ''}`);
for (const [k, v] of Object.entries(sum)) {
  const dec = Math.abs(v) >= 100 ? 0 : 2;
  console.log(`  ${k.padEnd(52)} ${before ? (before[k] ?? NaN).toFixed(dec).padStart(9) + '  ' : ''}${v.toFixed(dec).padStart(9)}`);
}
