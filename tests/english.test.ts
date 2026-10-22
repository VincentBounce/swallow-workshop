import { describe, it, expect, beforeAll } from 'vitest';
import { textToPhones } from '../src/dsp/speech/g2p';
import { englishPronunciation, englishNumber } from '../src/dsp/speech/english';
import { PHONEMES, GLIDING } from '../src/dsp/speech/phonemes';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry, N_SECTIONS } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { note, loadEnglishLexicon } from './helpers';

const ipa = (s: string) => textToPhones(s, 'en').map((p) => p.ipa).join(' ');

beforeAll(() => {
  const n = loadEnglishLexicon();
  note('English lexicon', `${n} words`);
});

describe('English grapheme to phoneme', () => {
  it('reads American pronunciations from the lexicon, with diphthongs, flaps and r-coloured vowels', () => {
    expect(ipa('voice')).toBe('v ɔɪ s');
    expect(ipa('water')).toBe('w ɔ ɾ ɚ');
    expect(ipa('heard')).toBe('h ɝ d');
    expect(ipa('button')).toContain('ʔ');
    expect(ipa('little')).toBe('l ɪ ɾ ə ɫ');
    expect(ipa('time')).toBe('t aɪ m');
  });

  it('uses weak forms of function words and "the" before a vowel', () => {
    expect(ipa('a cup of tea')).toBe('ə k ʌ p ə v t i');
    expect(ipa('the end').startsWith('ð i')).toBe(true);
    const ph = textToPhones('the cat', 'en');
    expect(ph[1].func).toBe(true);
    expect(ph.find((p) => p.ipa === 'æ')!.stress).toBe(true);
  });

  it('handles inflections, compounds, numbers and unknown words', () => {
    expect(englishPronunciation('voiceworkshops').source).not.toBe('rules');
    expect(englishNumber(1984)).toBe('nineteen eighty four');
    expect(englishNumber(2024)).toBe('two thousand twenty four');
    expect(ipa('7 cats')).toBe('s ɛ v ə n k æ t s');
    // a made-up word falls back to letter-to-sound rules
    const r = englishPronunciation('blick');
    expect(r.source).toBe('rules');
    expect(textToPhones('blick', 'en').map((p) => p.ipa).join('')).toBe('blɪk');
    note('English G2P', `voice ${ipa('voice')}, water ${ipa('water')}, little ${ipa('little')}, 1984 "${englishNumber(1984)}", blick (rules) ${ipa('blick')}`);
  });

  it('marks questions that start with a question word', () => {
    const wh = textToPhones('where is it?', 'en');
    const yn = textToPhones('is it here?', 'en');
    expect(wh[wh.length - 1].whQuestion).toBe(true);
    expect(yn[yn.length - 1].whQuestion).toBeFalsy();
    expect(yn[yn.length - 1].question).toBe(true);
  });
});

describe('English sounds in the tract model', () => {
  const formantsOf = (ipa: string) => {
    const a = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...PHONEMES[ipa].art };
    const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
    return formants(sectionsFromGeometry(g), {}, 4000).map((f) => f.f);
  };
  it('American r and the vowel of "heard" have a low F3 (r-colouring)', () => {
    const r = formantsOf('ɹ');
    const er = formantsOf('ɝ');
    note('American r', `/ɹ/ ${r.slice(0, 3).map((f) => f.toFixed(0)).join('/')} Hz, /ɝ/ ${er.slice(0, 3).map((f) => f.toFixed(0)).join('/')} Hz (Peterson & Barney ɝ 490/1350/1690)`);
    expect(r[2]).toBeLessThan(1800);
    expect(er[2]).toBeLessThan(1850);
    expect(Math.abs(Math.log(er[1] / 1350))).toBeLessThan(0.12);
  });
  it('American r and the r-coloured vowels stay open enough not to hiss', () => {
    // narrowest passage on the fine grid the aerodynamics uses
    const minArea = (ipa: string) => {
      const g = computeGeometry({ ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...PHONEMES[ipa].art }, DEFAULT_ANATOMY, DEFAULT_TEETH);
      let m = Infinity;
      for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6) m = Math.min(m, g.hits[i].area);
      return m;
    };
    for (const ph of ['ɹ', 'ɝ', 'ɚ']) expect(minArea(ph)).toBeGreaterThan(0.28);
  });
  it('the velar nasal closes in front of the nasal port, whatever the vowel', () => {
    const coupling = Math.round(0.43 * N_SECTIONS) - 1;
    for (const ctx of ['ə', 'ɪ', 'i', 'a', 'u', 'o', 'ɑ']) {
      const af = sectionsFromGeometry(computeGeometry({ ...DEFAULT_ARTICULATORS, ...PHONEMES[ctx].art, ...PHONEMES['ŋ'].art }, DEFAULT_ANATOMY, DEFAULT_TEETH));
      // the sections up to the nasal junction stay open: the glottis reaches the nose
      for (let i = 0; i <= coupling; i++) expect(af.areas[i]).toBeGreaterThan(0.02);
    }
  });
  it('dark l has a lower F2 than clear l', () => {
    const clear = formantsOf('l'), dark = formantsOf('ɫ');
    note('dark l', `F2 clear ${clear[1].toFixed(0)} Hz, dark ${dark[1].toFixed(0)} Hz`);
    expect(dark[1]).toBeLessThan(clear[1] * 0.8);
  });
  it('diphthongs glide toward their offglide', () => {
    for (const d of ['eɪ', 'aɪ', 'oʊ', 'aʊ', 'ɔɪ']) expect(PHONEMES[GLIDING[d].offglide!]).toBeTruthy();
  });
});
