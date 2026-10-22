import { describe, it, expect, beforeAll } from 'vitest';
import { textToPhones, parseIpa } from '../src/dsp/speech/g2p';
import { buildScore } from '../src/dsp/speech/sequencer';
import { renderOffline, VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { yin } from '../src/dsp/analysis/pitch';
import { melBank, applyMel } from '../src/dsp/analysis/mel';
import { bandPower, note, loadEnglishLexicon } from './helpers';

beforeAll(() => { loadEnglishLexicon(); });

const fs = 48000;
const ipa = (s: string, lang: 'it' | 'en' = 'it') => textToPhones(s, lang).map((p) => p.ipa + (p.long ? 'ː' : '')).join('');

describe('grapheme to phoneme', () => {
  it('Italian spelling rules (northern norm for intervocalic s)', () => {
    expect(ipa('sasso')).toBe('sasːo');
    expect(ipa('mamma')).toBe('mamːa');
    expect(ipa('voce')).toBe('votʃe');
    expect(ipa('rosa')).toBe('roza');
    expect(ipa('gnocchi')).toBe('ɲokːi');
    // the palatal lateral is always long between vowels
    expect(ipa('figlio')).toBe('fiʎːo');
    expect(ipa('scena')).toBe('ʃena');
    expect(ipa('chiesa')).toBe('kjeza');
    const st = textToPhones('città', 'it');
    expect(st[st.length - 1].stress).toBe(true);
  });
  it('English lexicon and IPA input', () => {
    expect(ipa('heed', 'en')).toBe('hid');
    expect(ipa('this', 'en')).toBe('ðɪs');
    expect(parseIpa('ˈka.za').map((p) => p.ipa).join('')).toBe('kaza');
    expect(parseIpa('ˈka.za')[1].stress).toBe(true);
  });
});

function speak(text: string, lang: 'it' | 'en' = 'it') {
  const score = buildScore(textToPhones(text, lang), { lang });
  const p = defaultParams();
  const { out } = renderOffline(p, score.duration + 0.3, fs, score);
  return { score, out };
}

function slice(out: Float32Array, t0: number, t1: number): Float32Array {
  return out.subarray(Math.round(t0 * fs), Math.round(t1 * fs));
}

describe('sequenced speech', () => {
  it('"sasso": voiceless hiss between voiced vowels, long /s/', () => {
    const { score, out } = speak('sasso');
    const ph = score.phones;
    const s2 = ph.find((p, i) => p.ipa === 's' && i > 0)!;
    const a = ph.find((p) => p.ipa === 'a')!;
    const dS = s2.t1 - s2.t0, dS1 = ph[0].t1 - ph[0].t0;
    expect(dS).toBeGreaterThan(1.6 * dS1); // geminate
    const hiss = slice(out, s2.t0 + 0.04, s2.t1 - 0.02);
    const vowel = slice(out, a.t0 + 0.03, a.t1 - 0.02);
    const hfS = bandPower(hiss, fs, 4000, 10000) / bandPower(hiss, fs, 80, 500);
    const hfA = bandPower(vowel, fs, 4000, 10000) / bandPower(vowel, fs, 80, 500);
    note('"sasso"', `geminate /sː/ ${(dS * 1000).toFixed(0)} ms vs /s/ ${(dS1 * 1000).toFixed(0)} ms; HF/LF ratio /sː/ ${(10 * Math.log10(hfS)).toFixed(1)} dB, /a/ ${(10 * Math.log10(hfA)).toFixed(1)} dB`);
    expect(hfS).toBeGreaterThan(hfA * 100);
    const f = yin(vowel.subarray(0, 2048), fs);
    expect(f.f0).toBeGreaterThan(90);
    expect(f.f0).toBeLessThan(180);
  });

  it('"mamma": nasal murmur is weaker in the high band than the vowel', () => {
    const { score, out } = speak('mamma');
    const m = score.phones.filter((p) => p.ipa === 'm')[1];
    const a = score.phones.find((p) => p.ipa === 'a')!;
    const murmur = slice(out, m.t0 + 0.03, m.t1 - 0.02);
    const vowel = slice(out, a.t0 + 0.03, a.t1 - 0.02);
    const r = (x: Float32Array) => bandPower(x, fs, 800, 3000) / bandPower(x, fs, 80, 400);
    note('"mamma"', `800-3000 Hz vs 80-400 Hz balance: murmur ${(10 * Math.log10(r(murmur))).toFixed(1)} dB, vowel ${(10 * Math.log10(r(vowel))).toFixed(1)} dB`);
    expect(r(murmur)).toBeLessThan(r(vowel) * 0.3);
  });

  it('"voce": the affricate has a silent closure then a hiss', () => {
    const { score, out } = speak('voce');
    const tf = score.phones.find((p) => p.ipa === 'tʃ')!;
    expect(tf).toBeTruthy();
    const o = score.phones.find((p) => p.ipa === 'o')!;
    const fric = slice(out, tf.t1 - 0.07, tf.t1 - 0.01);
    const vowel = slice(out, o.t0 + 0.03, o.t1 - 0.02);
    expect(bandPower(fric, fs, 2500, 8000)).toBeGreaterThan(bandPower(vowel, fs, 2500, 8000));
  });

  it('pitch follows the stress accent and falls at the end of a statement', () => {
    const score = buildScore(textToPhones('la voce', 'it'));
    const o = score.phones.find((p) => p.ipa === 'o')!;
    const f0At = (t: number) => score.frames[Math.round(t / 0.005)].f0;
    expect(f0At(0.5 * (o.t0 + o.t1))).toBeGreaterThan(f0At(0.07));
    expect(f0At(score.duration - 0.01)).toBeLessThan(f0At(0.07));
    const q = buildScore(textToPhones('la voce?', 'it'));
    expect(q.frames[Math.round((q.duration - 0.01) / 0.005)].f0).toBeGreaterThan(f0At(score.duration - 0.01) * 1.2);
  });
});

describe('log-mel spectrogram', () => {
  it('80 HTK mel bands cover 0-8 kHz and a tone lands in the right band', () => {
    const bank = melBank(80, 1024, 16000, 0, 8000);
    expect(bank.nMels).toBe(80);
    const n = 1024;
    const power = new Float64Array(n / 2 + 1);
    const k = Math.round((1000 * n) / 16000);
    power[k] = 1;
    const mel = applyMel(bank, power);
    let best = 0;
    for (let i = 1; i < mel.length; i++) if (mel[i] > mel[best]) best = i;
    // 1 kHz = 1000 mel; 80 bands over 0..2840 mel: centre spacing 35 mel
    expect(best).toBeGreaterThan(24);
    expect(best).toBeLessThan(30);
  });
});

describe('timing, melody and gestures of sequenced speech', () => {
  const phoneDur = (text: string, lang: 'it' | 'en', ipaSym: string, which = 0) => {
    const sc = buildScore(textToPhones(text, lang), { lang });
    const p = sc.phones.filter((q) => q.ipa === ipaSym)[which];
    return p.t1 - p.t0;
  };

  it('English vowels are longer before voiced consonants and at the end of a phrase (Klatt 1979)', () => {
    const bead = phoneDur('bead', 'en', 'i'), beat = phoneDur('beat', 'en', 'i');
    const mid = phoneDur('heed heed heed', 'en', 'i', 0), last = phoneDur('heed heed heed', 'en', 'i', 2);
    note('Klatt durations', `/i/ in bead ${(bead * 1000).toFixed(0)} ms vs beat ${(beat * 1000).toFixed(0)} ms; heed heed heed: first ${(mid * 1000).toFixed(0)} ms, last ${(last * 1000).toFixed(0)} ms`);
    expect(bead / beat).toBeGreaterThan(1.3);
    expect(last / mid).toBeGreaterThan(1.5);
  });

  it('Italian stressed vowels are long in open syllables and short before a geminate', () => {
    const fato = phoneDur('fato', 'it', 'a'), fatto = phoneDur('fatto', 'it', 'a');
    note('Italian durations', `stressed /a/ in fato ${(fato * 1000).toFixed(0)} ms vs fatto ${(fatto * 1000).toFixed(0)} ms`);
    expect(fato / fatto).toBeGreaterThan(1.35);
  });

  it('English voiceless stops are aspirated, Italian ones are not', () => {
    const vot = (text: string, lang: 'it' | 'en') => {
      const score = buildScore(textToPhones(text, lang), { lang });
      const t = score.phones.find((q) => q.ipa === 't')!;
      const e = new VoiceEngine(fs, defaultParams());
      e.snapArticulators(); e.snapPressure(); e.playScore(score);
      const buf = new Float32Array(48);
      let closed = false, release = -1, onset = -1;
      for (let time = 0; time < score.duration; time += 48 / fs) {
        e.process(buf, 48);
        const tel = e.telemetry();
        if (time > t.t0 && tel.constrictionArea < 0.005) closed = true;
        if (closed && release < 0 && tel.constrictionArea > 0.02) release = time;
        if (release > 0 && onset < 0 && tel.voicingAmp > 0.5) { onset = time; break; }
      }
      return onset - release;
    };
    const en = vot('a top', 'en'), it = vot('a topo', 'it');
    note('voice onset time', `/t/ English ${(en * 1000).toFixed(0)} ms, Italian ${(it * 1000).toFixed(0)} ms (typical 60-70 and 10-25)`);
    expect(en).toBeGreaterThan(0.045);
    expect(it).toBeLessThan(0.03);
  });

  it('the Italian trill makes several tongue-tip closures, the tap one', () => {
    const closures = (text: string) => {
      const score = buildScore(textToPhones(text, 'it'), { lang: 'it' });
      const r = score.phones.find((q) => q.ipa === 'r')!;
      const e = new VoiceEngine(fs, defaultParams());
      e.snapArticulators(); e.snapPressure(); e.playScore(score);
      const buf = new Float32Array(48);
      let n = 0, closed = false;
      for (let time = 0; time < r.t1 + 0.03; time += 48 / fs) {
        e.process(buf, 48);
        const c = e.telemetry().constrictionArea < 0.01;
        if (time > r.t0 - 0.02 && c && !closed) n++;
        closed = c;
      }
      return n;
    };
    const carro = closures('carro'), caro = closures('caro');
    note('trill', `tongue-tip closures: "carro" ${carro}, "caro" ${caro}`);
    expect(carro).toBeGreaterThanOrEqual(3);
    expect(caro).toBeGreaterThanOrEqual(1);
  });

  it('questions rise unless they start with a question word; commas leave the melody up', () => {
    const endF0 = (text: string) => {
      const s = buildScore(textToPhones(text, 'en'), { lang: 'en' });
      const last = [...s.phones].reverse().find((q) => q.ipa !== '_')!;
      return s.frames[Math.round((last.t1 - 0.01) / 0.005)].f0;
    };
    const yn = endF0('is it raining?'), wh = endF0('where is it raining?'), st = endF0('it is raining.');
    note('Fujisaki intonation', `final F0: statement ${st.toFixed(0)} Hz, wh-question ${wh.toFixed(0)} Hz, yes/no question ${yn.toFixed(0)} Hz`);
    expect(yn).toBeGreaterThan(st * 1.3);
    expect(wh).toBeLessThan(yn * 0.8);
  });

  it('the accents of a long sentence keep their height, in the plan and in the voice', () => {
    const text = 'Every voice you have ever heard is made of just two ingredients.';
    const s = buildScore(textToPhones(text, 'en'), { lang: 'en', f0: 210 });
    const f0s = s.frames.filter((f) => f.t > 0.06 && f.t < s.duration - 0.05).map((f) => f.f0);
    const range = 12 * Math.log2(Math.max(...f0s) / Math.min(...f0s));
    // the engine follows the planned curve closely (the score asks for a
    // short F0 smoothing): the 90th percentile of its distance from the plan
    const follow = (sc: typeof s) => {
      const p = defaultParams();
      p.source.f0 = 210; p.source.jitter = 0;
      const e = new VoiceEngine(fs, p);
      e.snapArticulators(); e.snapPressure(); e.playScore({ ...sc, flutter: 0 });
      const buf = new Float32Array(96);
      const err: number[] = [];
      for (let t = 0; t < sc.duration; t += 96 / fs) {
        e.process(buf, 96);
        const tel = e.telemetry();
        const fr = sc.frames[Math.min(sc.frames.length - 1, Math.round(t / 0.005))];
        if (tel.f0 > 0 && t > 0.1) err.push(Math.abs(12 * Math.log2(tel.f0 / fr.f0)));
      }
      err.sort((a, b) => a - b);
      return err[Math.floor(err.length * 0.9)];
    };
    const fast = follow(s), slow = follow({ ...s, f0Tau: undefined });
    note('melody', `planned F0 range ${range.toFixed(1)} st in a 12-syllable sentence; the voice follows within ${fast.toFixed(2)} st (90 %), ${slow.toFixed(2)} st with the slider smoothing`);
    expect(range).toBeGreaterThan(7);
    expect(fast).toBeLessThan(0.8);
    expect(fast).toBeLessThan(slow / 2);
  });

  it('consonants dip below their vowels as much as in natural speech, and never vanish', () => {
    // quietest 10 ms of each consonant against the loudest 10 ms of its
    // vowels, and the narrowest passage reached (Fletcher 1953, Fry 1979:
    // nasals about 6-12 dB below the vowels, voiced fricatives 12-20 dB)
    const dips = (text: string, lang: 'it' | 'en') => {
      const sc = buildScore(textToPhones(text, lang), { lang });
      const e = new VoiceEngine(fs, defaultParams());
      e.snapArticulators(); e.snapPressure(); e.playScore(sc);
      const hop = 96, dt = hop / fs, buf = new Float32Array(hop);
      const en: number[] = [], area: number[] = [];
      for (let t = 0; t < sc.duration; t += dt) {
        e.process(buf, hop);
        let r = 0; for (const x of buf) r += x * x;
        en.push(r / hop); area.push(e.telemetry().constrictionArea);
      }
      const lev = en.map((_, i) => { let s = 0, n = 0; for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < en.length) { s += en[k]; n++; } return 10 * Math.log10(s / n + 1e-14); });
      const span = (t0: number, t1: number) => [Math.max(0, Math.round(t0 / dt)), Math.min(lev.length - 1, Math.round(t1 / dt))];
      const isV = (q: string) => /^[aeiouɑɛɔəɪʊʌæɝɚ]/.test(q);
      return sc.phones.map((q, i) => {
        if (isV(q.ipa) || q.ipa === '_') return null;
        const vs = [sc.phones.slice(0, i).reverse().find((x) => isV(x.ipa)), sc.phones.slice(i + 1).find((x) => isV(x.ipa))].filter(Boolean) as typeof sc.phones;
        let vmax = -Infinity; for (const v of vs) { const [a, b] = span(v.t0, v.t1); for (let k = a; k <= b; k++) vmax = Math.max(vmax, lev[k]); }
        const [a, b] = span(q.t0 + 0.01, q.t1 + 0.012);
        let cmin = Infinity, amin = Infinity; for (let k = a; k <= b; k++) { cmin = Math.min(cmin, lev[k]); amin = Math.min(amin, area[k]); }
        return { ipa: q.ipa, dip: vmax - cmin, area: amin };
      }).filter(Boolean) as { ipa: string; dip: number; area: number }[];
    };
    const it = dips('la mamma vuole la nonna e il vino', 'it');
    const en = dips('Every voice you have ever heard is raining in.', 'en');
    const nasal = [...it, ...en].filter((d) => 'mnŋ'.includes(d.ipa));
    const v = [...it, ...en].filter((d) => d.ipa === 'v');
    note('consonant dips', `nasals ${Math.min(...nasal.map((d) => d.dip)).toFixed(1)}-${Math.max(...nasal.map((d) => d.dip)).toFixed(1)} dB, /v/ ${Math.min(...v.map((d) => d.dip)).toFixed(1)}-${Math.max(...v.map((d) => d.dip)).toFixed(1)} dB below the vowels ("la mamma vuole la nonna e il vino", "Every voice you have ever heard is raining in.")`);
    for (const d of nasal) { expect(d.dip).toBeGreaterThan(5); expect(d.dip).toBeLessThan(20); }
    for (const d of v) { expect(d.dip).toBeGreaterThan(8); expect(d.area).toBeGreaterThan(0.02); }
    // the laterals and /w/ stay open whatever vowel is next to them
    for (const d of it.filter((x) => x.ipa === 'l' || x.ipa === 'w')) expect(d.area).toBeGreaterThan(0.1);
  });

  it('an utterance ends with its last sound, without a trailing breath', () => {
    const s = buildScore(textToPhones('is it raining in the city today?', 'en'), { lang: 'en' });
    const last = s.phones[s.phones.length - 1];
    expect(last.ipa).not.toBe('_');
    expect(s.duration - last.t1).toBeLessThan(0.06);
  });

  it('a glottalized /t/ builds no pressure, so it is not released with a puff', () => {
    const peakPo = (text: string) => {
      const sc = buildScore(textToPhones(text, 'en'), { lang: 'en' });
      const t = sc.phones.find((q) => q.ipa === 't')!;
      const e = new VoiceEngine(fs, defaultParams());
      e.snapArticulators(); e.snapPressure(); e.playScore(sc);
      const buf = new Float32Array(48);
      let po = 0;
      for (let time = 0; time < sc.duration; time += 48 / fs) {
        e.process(buf, 48);
        if (time > t.t0 && time < t.t1 + 0.01) po = Math.max(po, e.telemetry().po);
      }
      return po / 980.665; // cmH2O
    };
    const held = peakPo('it rains'), released = peakPo('it.');
    note('glottalized t', `oral pressure behind /t/: "it rains" ${held.toFixed(1)} cmH2O, "it." ${released.toFixed(1)} cmH2O`);
    expect(held).toBeLessThan(1);
    expect(released).toBeGreaterThan(3);
  });

  it('a glottal stop closes the folds ("button")', () => {
    const s = buildScore(textToPhones('button', 'en'), { lang: 'en' });
    expect(s.frames.some((f) => f.gate === 0)).toBe(true);
  });

  it('every naturalness ingredient can be switched off', () => {
    const ph = textToPhones('la voce è fatta di aria', 'it');
    const flat = buildScore(ph, { lang: 'it', natural: { intonation: false, micro: false } });
    const f0s = flat.frames.filter((f) => f.t < flat.duration).map((f) => f.f0);
    expect(Math.max(...f0s) - Math.min(...f0s)).toBeLessThan(0.01);
    const nominal = buildScore(ph, { lang: 'it', natural: { timing: false } });
    const v = nominal.phones.find((q) => q.ipa === 'v')!;
    expect(v.t1 - v.t0).toBeCloseTo(0.08, 3);
  });
});
