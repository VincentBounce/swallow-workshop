import { Articulators } from '../tract/types';

export type Manner = 'vowel' | 'fricative' | 'stop' | 'nasal' | 'approximant' | 'lateral' | 'trill' | 'affricate' | 'glottal' | 'silence';

/**
 * A phoneme as an articulatory target. Only the articulators that the sound
 * really controls are listed in `art`; the others are free to coarticulate
 * (they move toward the neighbouring vowels, as in Öhman's 1966 model of VCV
 * coarticulation).
 */
export interface Phoneme {
  ipa: string;
  manner: Manner;
  voiced: boolean;
  /** articulatory targets (cm / normalised units) */
  art: Partial<Articulators>;
  /** glottal abduction 0 (phonation) .. 1 (wide open, breathing) */
  abduction: number;
  /** nominal duration, s */
  dur: number;
  /** example words */
  examples?: string;
  /** for affricates: the stop and fricative parts */
  parts?: [string, string];
  /** dorsal closure (velar stops/nasals) */
  dorsal?: boolean;
}

const V = (ipa: string, art: Partial<Articulators>, examples: string, dur = 0.14): Phoneme => ({
  ipa, manner: 'vowel', voiced: true, art: { tipX: 0, tipY: 0, groove: 0, lipTuck: 0, velum: 0, ...art }, abduction: 0, dur, examples,
});

/**
 * Vowel targets were fitted (scripts/tune-vowels.ts) so that the reference
 * acoustic model lands on the Peterson & Barney (1952) / Hillenbrand et al.
 * (1995) adult-male means; Italian vowels follow the same chart positions.
 */
export const VOWELS: Record<string, Phoneme> = {
  'ə': V('ə', { jaw: 0.4, tongueX: 0.26, tongueY: 0.31, lipOpen: 0.29, lipRound: 0.1, lipProtrude: 0.11 }, 'sofa'),
  i: V('i', { jaw: 0.25, tongueX: 1.22, tongueY: 0.97, lipOpen: 0.19, lipRound: 0.19, lipProtrude: 0.18 }, 'heed, vino'),
  'ɪ': V('ɪ', { jaw: 0.36, tongueX: 0.77, tongueY: 0.84, lipOpen: 0.28, lipRound: 0.04, lipProtrude: 0.14 }, 'hid'),
  e: V('e', { jaw: 0.38, tongueX: 0.98, tongueY: 0.5, lipOpen: 0.48, lipRound: 0, lipProtrude: 0.06 }, 'vero, hayed'),
  'ɛ': V('ɛ', { jaw: 0.59, tongueX: 0.97, tongueY: 0.14, lipOpen: 0.47, lipRound: 0, lipProtrude: 0.26 }, 'bello, head'),
  'æ': V('æ', { jaw: 0.85, tongueX: 0.88, tongueY: -1.06, lipOpen: 0.42, lipRound: 0, lipProtrude: 0.15 }, 'had'),
  a: V('a', { jaw: 0.94, tongueX: 0.06, tongueY: -0.83, lipOpen: 0.5, lipRound: 0, lipProtrude: 0.04 }, 'casa'),
  'ɑ': V('ɑ', { jaw: 0.89, tongueX: -0.24, tongueY: -1.14, lipOpen: 0.3, lipRound: 0, lipProtrude: 0.15 }, 'father, hod'),
  'ɔ': V('ɔ', { jaw: 0.64, tongueX: -0.76, tongueY: -0.83, lipOpen: 0.24, lipRound: 0.53, lipProtrude: 0.64 }, 'cosa, hawed'),
  o: V('o', { jaw: 0.4, tongueX: -0.83, tongueY: -0.12, lipOpen: 0.03, lipRound: 0.99, lipProtrude: 0.69 }, 'voce'),
  'ʊ': V('ʊ', { jaw: 0.3, tongueX: -0.71, tongueY: -0.27, lipOpen: -0.05, lipRound: 0.93, lipProtrude: 0.93 }, 'hood'),
  u: V('u', { jaw: 0.18, tongueX: 0.08, tongueY: 1.18, lipOpen: -0.04, lipRound: 1, lipProtrude: 0.78 }, "who'd, luna"),
  'ʌ': V('ʌ', { jaw: 0.6, tongueX: -0.43, tongueY: -0.38, lipOpen: 0.38, lipRound: 0.21, lipProtrude: 0.32 }, 'hud'),
};

const C = (
  ipa: string, manner: Manner, voiced: boolean, art: Partial<Articulators>, abduction: number, dur: number, examples: string, extra: Partial<Phoneme> = {},
): Phoneme => ({ ipa, manner, voiced, art, abduction, dur, examples, ...extra });

export const CONSONANTS: Record<string, Phoneme> = {
  // fricatives
  s: C('s', 'fricative', false, { jaw: 0.15, tongueX: 0.3, tongueY: 0.0, tipX: 0.68, tipY: 0.516, groove: 1, lipOpen: 0.18, lipRound: 0, lipTuck: 0, velum: 0 }, 0.55, 0.12, 'sasso, hiss, see'),
  z: C('z', 'fricative', true, { jaw: 0.15, tongueX: 0.3, tongueY: 0.0, tipX: 0.68, tipY: 0.516, groove: 1, lipOpen: 0.18, lipRound: 0, lipTuck: 0, velum: 0 }, 0.12, 0.09, 'rosa (N. It.), zoo'),
  'ʃ': C('ʃ', 'fricative', false, { jaw: 0.2, tongueX: 0.15, tongueY: 1.19, tipX: -0.1, tipY: 1.426, groove: 0.4, lipOpen: 0.12, lipRound: 0.75, lipProtrude: 0.8, lipTuck: 0, velum: 0 }, 0.55, 0.13, 'scena, she'),
  'ʒ': C('ʒ', 'fricative', true, { jaw: 0.2, tongueX: 0.15, tongueY: 1.19, tipX: -0.1, tipY: 1.426, groove: 0.4, lipOpen: 0.12, lipRound: 0.75, lipProtrude: 0.8, lipTuck: 0, velum: 0 }, 0.12, 0.1, 'beige'),
  f: C('f', 'fricative', false, { jaw: 0.12, lipOpen: 0.522, lipTuck: 1, lipRound: 0, lipProtrude: 0, velum: 0 }, 0.55, 0.12, 'fame, father'),
  v: C('v', 'fricative', true, { jaw: 0.12, lipOpen: 0.522, lipTuck: 1, lipRound: 0, lipProtrude: 0, velum: 0 }, 0.12, 0.08, 'voce'),
  'θ': C('θ', 'fricative', false, { jaw: 0.2, tipX: 1.05, tipY: 0.1, groove: 0, lipOpen: 0.25, lipTuck: 0, velum: 0 }, 0.55, 0.12, 'thin'),
  'ð': C('ð', 'fricative', true, { jaw: 0.2, tipX: 1.05, tipY: 0.1, groove: 0, lipOpen: 0.25, lipTuck: 0, velum: 0 }, 0.12, 0.07, 'this'),
  h: C('h', 'glottal', false, {}, 0.75, 0.08, 'heed, hiss'),
  // stops
  p: C('p', 'stop', false, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: 0 }, 0.5, 0.09, 'papà'),
  b: C('b', 'stop', true, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: 0 }, 0.08, 0.07, 'buzz'),
  t: C('t', 'stop', false, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: 0 }, 0.5, 0.08, 'tutto'),
  d: C('d', 'stop', true, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: 0 }, 0.08, 0.06, 'dado, heed'),
  k: C('k', 'stop', false, { tongueX: -0.25, tongueY: 1.7, tipY: 0, groove: 0, velum: 0 }, 0.5, 0.09, 'casa', { dorsal: true }),
  g: C('g', 'stop', true, { tongueX: -0.25, tongueY: 1.7, tipY: 0, groove: 0, velum: 0 }, 0.08, 0.07, 'gatto', { dorsal: true }),
  // nasals
  m: C('m', 'nasal', true, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: 1 }, 0, 0.08, 'mamma'),
  n: C('n', 'nasal', true, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: 1 }, 0, 0.07, 'nonno'),
  'ɲ': C('ɲ', 'nasal', true, { jaw: 0.1, tongueX: 0.9, tongueY: 1.5, tipY: 0.1, velum: 1 }, 0, 0.09, 'gnocchi'),
  'ŋ': C('ŋ', 'nasal', true, { tongueX: -0.25, tongueY: 1.7, tipY: 0, velum: 1 }, 0, 0.08, 'sing', { dorsal: true }),
  // approximants, laterals, trill
  l: C('l', 'lateral', true, { jaw: 0.15, tipX: 0.2, tipY: 1.054, groove: 0, velum: 0 }, 0, 0.07, 'luna'),
  'ʎ': C('ʎ', 'lateral', true, { jaw: 0.1, tongueX: 0.9, tongueY: 0.962, tipY: 0.1, velum: 0 }, 0, 0.09, 'figlio'),
  r: C('r', 'trill', true, { jaw: 0.15, tipX: 0.25, tipY: 1.004, groove: 0, velum: 0 }, 0, 0.08, 'raro (trill)'),
  'ɹ': C('ɹ', 'approximant', true, { jaw: 0.2, tongueX: -0.3, tongueY: 0.3, tipX: -0.4, tipY: 1.656, lipRound: 0.4, velum: 0 }, 0, 0.08, 'red'),
  j: C('j', 'approximant', true, { jaw: 0.06, tongueX: 1.0, tongueY: 0.925, lipRound: 0, velum: 0 }, 0, 0.06, 'ieri, yes'),
  w: C('w', 'approximant', true, { jaw: 0.1, tongueX: -0.8, tongueY: 0.3, lipOpen: -0.08, lipRound: 1, lipProtrude: 0.8, velum: 0 }, 0, 0.06, 'uomo, we'),
  // affricates
  'tʃ': C('tʃ', 'affricate', false, {}, 0.5, 0.14, 'voce, ciao', { parts: ['t', 'ʃ'] }),
  'dʒ': C('dʒ', 'affricate', true, {}, 0.1, 0.12, 'gelato', { parts: ['d', 'ʒ'] }),
  ts: C('ts', 'affricate', false, {}, 0.5, 0.13, 'pizza', { parts: ['t', 's'] }),
  dz: C('dz', 'affricate', true, {}, 0.1, 0.11, 'zero', { parts: ['d', 'z'] }),
  // pause
  _: C('_', 'silence', false, {}, 0.9, 0.2, 'pause'),
};

export const PHONEMES: Record<string, Phoneme> = { ...VOWELS, ...CONSONANTS };
