import { writeFileSync } from 'node:fs';
import { renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { textToPhones } from '../src/dsp/speech/g2p';
import { buildScore } from '../src/dsp/speech/sequencer';
import { encodeWav } from '../src/dsp/util/wav';
const SP = process.argv[2];
const items: [string, 'it' | 'en'][] = [['sasso', 'it'], ['mamma', 'it'], ['voce', 'it'], ['la voce è fatta di aria che vibra', 'it'], ['papà, tutto bene?', 'it'], ['gnocchi e pizza', 'it'], ['heed', 'en'], ['father', 'en'], ['hiss', 'en'], ['this', 'en'], ['the voice is made of a buzz and a hiss', 'en']];
for (const [t, lang] of items) {
  const ph = textToPhones(t, lang);
  const sc = buildScore(ph, { lang });
  const p = defaultParams();
  const t0 = performance.now();
  const { out } = renderOffline(p, sc.duration + 0.3, 48000, sc);
  let mx = 0, bad = 0, at = 0;
  out.forEach((v, i) => { if (!Number.isFinite(v)) bad++; if (Math.abs(v) > mx) { mx = Math.abs(v); at = i / 48000; } });
  console.log(t.padEnd(40), ph.map((x) => x.ipa + (x.long ? 'ː' : '') + (x.stress ? "'" : '')).join(' ').padEnd(50), `${sc.duration.toFixed(2)} s, peak ${mx.toFixed(2)} @${at.toFixed(3)} [${sc.phones.map((q) => q.ipa + q.t0.toFixed(2)).join(" ")}], bad ${bad}, ${(performance.now() - t0).toFixed(0)} ms`);
  if (SP) writeFileSync(`${SP}/vs-${t.replace(/[^a-z]+/gi, '_').slice(0, 20)}.wav`, encodeWav(out, 48000));
}
