/**
 * Do the consonants happen when the plan says? For every stop, nasal and
 * fricative of some sentences: the time the constriction forms and the time
 * it opens, against the planned boundaries of the phone (mean and spread, ms).
 * Positive = later than planned.
 *   npx tsx scripts/landmarks.ts
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { textToPhones } from '../src/dsp/speech/g2p';
import { setEnglishLexicon } from '../src/dsp/speech/english';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';

setEnglishLexicon(gunzipSync(readFileSync(new URL('../public/lexicon/en-us.lex', import.meta.url))).toString('utf-8'));
const sentences: [string, 'en' | 'it'][] = [
  ['Every voice you have ever heard is made of just two ingredients.', 'en'],
  ['Is it raining in the city today?', 'en'],
  ['a buzz, a hiss and a filter', 'en'],
  ['la voce è fatta di aria che vibra', 'it'],
  ['la mamma vuole la nonna e il vino', 'it'],
  ['papà, tutto bene?', 'it'],
];
// a constriction counts as formed below these areas (cm^2)
const THR: Record<string, number> = { stop: 0.005, nasal: 0.005, fricative: 0.2 };
const stats: Record<string, { on: number[]; off: number[] }> = {};
for (const [text, lang] of sentences) {
  const sc = buildScore(textToPhones(text, lang), { lang });
  const e = new VoiceEngine(48000, defaultParams());
  e.snapArticulators(); e.snapPressure(); e.playScore(sc);
  const hop = 48, dt = hop / 48000;
  const area: number[] = [];
  const buf = new Float32Array(hop);
  for (let t = 0; t < sc.duration + 0.05; t += dt) { e.process(buf, hop); area.push(e.telemetry().constrictionArea); }
  for (const q of sc.phones) {
    const ph = PHONEMES[q.ipa];
    if (!ph || !(ph.manner in THR)) continue;
    const thr = THR[ph.manner];
    // the constricted stretch that overlaps the middle of the phone
    const mid = Math.round((0.5 * (q.t0 + q.t1)) / dt);
    let i = mid;
    if (area[i] >= thr) {
      let best = -1;
      for (let d = 1; d < 0.04 / dt && best < 0; d++) { if (area[mid - d] < thr) best = mid - d; else if (area[mid + d] < thr) best = mid + d; }
      if (best < 0) continue;
      i = best;
    }
    let a = i, b = i;
    while (a > 0 && area[a - 1] < thr) a--;
    while (b < area.length - 1 && area[b + 1] < thr) b++;
    const key = `${lang} ${ph.manner}`;
    (stats[key] ??= { on: [], off: [] });
    stats[key].on.push((a * dt - q.t0) * 1000);
    stats[key].off.push(((b + 1) * dt - q.t1) * 1000);
  }
}
const ms = (x: number[]) => { const m = x.reduce((s, v) => s + v, 0) / x.length; const sd = Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / x.length); return `${m >= 0 ? '+' : ''}${m.toFixed(0)} ± ${sd.toFixed(0)}`; };
for (const [k, v] of Object.entries(stats)) console.log(`${k.padEnd(14)} n=${String(v.on.length).padStart(2)}  forms ${ms(v.on).padStart(10)} ms   opens ${ms(v.off).padStart(10)} ms`);
