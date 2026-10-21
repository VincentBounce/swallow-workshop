/**
 * Renders example sentences with the speech sequencer and prints their phones,
 * timing, pitch range and levels; with a folder argument it also writes WAVs.
 *   npx tsx scripts/say.ts [outDir] [--flat]
 *   npx tsx scripts/say.ts outDir en "any English sentence"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { textToPhones } from '../src/dsp/speech/g2p';
import { setEnglishLexicon } from '../src/dsp/speech/english';
import { buildScore, NaturalnessOptions } from '../src/dsp/speech/sequencer';
import { encodeWav } from '../src/dsp/util/wav';

setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SP = args[0];
const flat = process.argv.includes('--flat');
const natural: Partial<NaturalnessOptions> = flat ? { timing: false, intonation: false, micro: false, voiceQuality: false, coarticulation: true } : {};
const items: [string, 'it' | 'en'][] = args[1] && args[2]
  ? [[args.slice(2).join(' '), args[1] as 'it' | 'en']]
  : [['sasso', 'it'], ['mamma', 'it'], ['voce', 'it'], ['la voce è fatta di aria che vibra', 'it'], ['papà, tutto bene?', 'it'], ['il carro corre sulla strada', 'it'],
    ['heed', 'en'], ['father', 'en'], ['a buzz, a hiss and a filter', 'en'], ['Every voice you have ever heard is made of just two ingredients.', 'en'],
    ['Is it raining in the city today?', 'en'], ['The little button on the water bottle', 'en']];
for (const [t, lang] of items) {
  const ph = textToPhones(t, lang);
  const sc = buildScore(ph, { lang, natural });
  const p = defaultParams();
  const t0 = performance.now();
  const { out } = renderOffline(p, sc.duration + 0.3, 48000, sc);
  let mx = 0, bad = 0;
  out.forEach((v) => { if (!Number.isFinite(v)) bad++; mx = Math.max(mx, Math.abs(v)); });
  const f0s = sc.frames.filter((f) => f.t < sc.duration).map((f) => f.f0);
  const syl = ph.filter((x) => ['vowel'].includes((x as { ipa: string }).ipa ? 'vowel' : '')).length;
  void syl;
  console.log(`${t}  [${lang}]  ${sc.duration.toFixed(2)} s, F0 ${Math.min(...f0s).toFixed(0)}-${Math.max(...f0s).toFixed(0)} Hz, peak ${mx.toFixed(2)}, bad ${bad}, ${(performance.now() - t0).toFixed(0)} ms`);
  console.log('   ' + sc.phones.map((q) => `${q.ipa}${Math.round((q.t1 - q.t0) * 1000)}`).join(' '));
  if (SP) writeFileSync(`${SP}/${flat ? 'flat-' : ''}${t.replace(/[^a-zà-ú]+/gi, '_').slice(0, 24)}.wav`, encodeWav(out, 48000));
}
