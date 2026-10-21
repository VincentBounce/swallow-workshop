import { describe, it, expect } from 'vitest';
import { textToPhones, parseIpa } from '../src/dsp/speech/g2p';
import { buildScore } from '../src/dsp/speech/sequencer';
import { renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { yin } from '../src/dsp/analysis/pitch';
import { melBank, applyMel } from '../src/dsp/analysis/mel';
import { bandPower, note } from './helpers';

const fs = 48000;
const ipa = (s: string, lang: 'it' | 'en' = 'it') => textToPhones(s, lang).map((p) => p.ipa + (p.long ? 'ː' : '')).join('');

describe('grapheme to phoneme', () => {
  it('Italian spelling rules (northern norm for intervocalic s)', () => {
    expect(ipa('sasso')).toBe('sasːo');
    expect(ipa('mamma')).toBe('mamːa');
    expect(ipa('voce')).toBe('votʃe');
    expect(ipa('rosa')).toBe('roza');
    expect(ipa('gnocchi')).toBe('ɲokːi');
    expect(ipa('figlio')).toBe('fiʎo');
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
