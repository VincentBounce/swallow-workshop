import { describe, it, expect, beforeAll } from 'vitest';
import { note, loadEnglishLexicon } from './helpers';
import { CONTEXT_CORPUS, Token, measure, summary } from './contextBench';

// Vowels in sentences, measured in their middle against the same vowel held
// (see tests/contextBench.ts). In running speech a vowel falls a little short
// of its held target (undershoot), but it must stay that vowel: a front vowel
// keeps its high F2, no vowel takes the low F3 of an r-coloured one, and the
// velum stays shut away from nasal consonants.
let tokens: Token[] = [];
let s: Record<string, number> = {};
beforeAll(() => {
  loadEnglishLexicon();
  tokens = CONTEXT_CORPUS.flatMap(([text, lang]) => measure(text, lang));
  s = summary(tokens);
});

describe('vowels in running speech', () => {
  it('front vowels keep their F2', () => {
    note('front vowels in sentences', `F2 ${(100 * s['front F2 / held (mean)']).toFixed(0)} % of the held vowel on average, ${(100 * s['front F2 / held (10th pct)']).toFixed(0)} % at the 10th percentile`);
    expect(s['front F2 / held (mean)']).toBeGreaterThan(0.95);
    expect(s['front F2 / held (10th pct)']).toBeGreaterThan(0.9);
  });
  it('vowels are not r-coloured', () => {
    note('F3 in sentences', `10th percentile ${s['F3 of non-rhotic vowels, 10th pct (Hz)'].toFixed(0)} Hz; ${s['non-rhotic vowels with F3 150 Hz below held (%)'].toFixed(1)} % of vowels 150 Hz below their held F3 (after /ɹ/ and before /l/); tip height in vowel middles ${s['tip height at vowel middles (90th pct)'].toFixed(2)} at the 90th percentile`);
    expect(s['non-rhotic vowels with F3 < 2300 Hz, /u/ aside (%)']).toBeLessThan(2);
    expect(s['non-rhotic vowels with F3 150 Hz below held (%)']).toBeLessThan(10);
    expect(s['tip height at vowel middles (90th pct)']).toBeLessThan(0.4);
  });
  it('the velum is shut away from nasals and opens a little next to them', () => {
    note('nasal port in vowels', `${s['port, oral vowels away from nasals (max cm2)'].toFixed(3)} cm² at most away from nasals; ${s['port, vowels next to a nasal (mean cm2)'].toFixed(2)} cm² on average next to one`);
    // nasality is heard from about 0.01 cm² in high vowels
    expect(s['port, oral vowels away from nasals (max cm2)']).toBeLessThan(0.01);
    expect(s['port, vowels next to a nasal (mean cm2)']).toBeGreaterThan(0.01);
    expect(s['port, vowels next to a nasal (mean cm2)']).toBeLessThan(0.3);
  });
  it('the slow articulators reach the vowels', () => {
    note('vowel targets in sentences', `F1 ${(100 * s['F1 / held, all vowels (mean)']).toFixed(0)} % of the held vowel on average; tongue body ${s['tongue body miss |dX|+|dY| (mean)'].toFixed(2)} away from its target`);
    expect(s['F1 / held, all vowels (mean)']).toBeGreaterThan(0.93);
    expect(s['tongue body miss |dX|+|dY| (mean)']).toBeLessThan(0.1);
  });
});
