import { Articulators } from '../tract/types';

export type Manner =
  | 'vowel' | 'fricative' | 'stop' | 'nasal' | 'approximant' | 'lateral' | 'trill' | 'tap' | 'affricate' | 'glottal' | 'glottalStop' | 'silence';

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
  /** diphthongs: the vowel the tongue and lips glide to */
  offglide?: string;
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
  'ə': V('ə', { jaw: 0.39, tongueX: 0.07, tongueY: 0.99, tongueRoot: 0.23, lipOpen: 0.23, lipRound: 0.1, lipProtrude: 0.11 }, 'sofa'),
  i: V('i', { jaw: 0.195, tongueX: 1.195, tongueY: 0.808, tongueRoot: 1.2, lipOpen: -0.05, lipRound: 0.19, lipProtrude: 0.05 }, 'heed, vino'),
  'ɪ': V('ɪ', { jaw: 0.207, tongueX: 0.747, tongueY: 0.958, tongueRoot: -0.3, lipOpen: -0.05, lipRound: 0.04, lipProtrude: -0.308 }, 'hid'),
  e: V('e', { jaw: 0.219, tongueX: 0.787, tongueY: 0.764, tongueRoot: -0.524, lipOpen: 0.356, lipRound: 0, lipProtrude: -0.01 }, 'vero, hayed'),
  'ɛ': V('ɛ', { jaw: 0.506, tongueX: 0.664, tongueY: 0.89, tongueRoot: -0.514, lipOpen: -0.05, lipRound: 0, lipProtrude: 0.055 }, 'bello, head'),
  'æ': V('æ', { jaw: 0.803, tongueX: 0.381, tongueY: 0.856, tongueRoot: -0.37, lipOpen: -0.029, lipRound: 0, lipProtrude: -0.101 }, 'had'),
  a: V('a', { jaw: 0.95, tongueX: 0.09, tongueY: -0.99, tongueRoot: 0.15, lipOpen: 0.46, lipRound: 0, lipProtrude: 0.04 }, 'casa'),
  'ɑ': V('ɑ', { jaw: 0.902, tongueX: -0.369, tongueY: -0.15, tongueRoot: 0.263, lipOpen: 0.116, lipRound: 0, lipProtrude: 0.632 }, 'father, hod'),
  'ɔ': V('ɔ', { jaw: 0.471, tongueX: -0.965, tongueY: -0.22, tongueRoot: 0.852, lipOpen: -0.05, lipRound: 0.53, lipProtrude: 0.604 }, 'cosa, hawed'),
  o: V('o', { jaw: 0.22, tongueX: -0.869, tongueY: 0.451, tongueRoot: 0.561, lipOpen: -0.05, lipRound: 0.99, lipProtrude: 0.4 }, 'voce'),
  'ʊ': V('ʊ', { jaw: 0.344, tongueX: 0.024, tongueY: 1.171, tongueRoot: -0.197, lipOpen: -0.05, lipRound: 0.93, lipProtrude: 0.926 }, 'hood'),
  u: V('u', { jaw: 0.071, tongueX: 0.528, tongueY: 1.203, tongueRoot: -0.229, lipOpen: 0.009, lipRound: 1, lipProtrude: 0.964 }, "who'd, luna"),
  'ʌ': V('ʌ', { jaw: 0.713, tongueX: -0.663, tongueY: 0.526, tongueRoot: 0.343, lipOpen: 0.237, lipRound: 0.21, lipProtrude: 0.441 }, 'hud'),
  // r-coloured vowel of "heard": a bunched or retroflex tongue with the tip up
  // and back plus rounded lips pull F3 down to about 1700 Hz (scripts/tune-rhotic.ts)
  'ɝ': V('ɝ', { jaw: 0.317, tongueX: -0.459, tongueY: -0.939, tongueRoot: 1.2, tipX: -0.687, tipY: 2.2, lipOpen: 0.293, lipRound: 0.278, lipProtrude: 1 }, 'heard, bird', 0.16),
};

/** Sounds used by the speech sequencer that cannot be held as a steady shape. */
export const GLIDING: Record<string, Phoneme> = {
  // unstressed r-coloured vowel ("butter")
  'ɚ': V('ɚ', VOWELS['ɝ'].art, 'butter', 0.1),
  // American English diphthongs: a nucleus that glides toward a higher vowel
  'eɪ': { ...V('eɪ', VOWELS.e.art, 'day', 0.19), offglide: 'ɪ' },
  'aɪ': { ...V('aɪ', VOWELS.a.art, 'my', 0.22), offglide: 'ɪ' },
  'oʊ': { ...V('oʊ', VOWELS.o.art, 'go', 0.2), offglide: 'ʊ' },
  'aʊ': { ...V('aʊ', VOWELS.a.art, 'now', 0.23), offglide: 'ʊ' },
  'ɔɪ': { ...V('ɔɪ', VOWELS['ɔ'].art, 'boy', 0.24), offglide: 'ɪ' },
};

const C = (
  ipa: string, manner: Manner, voiced: boolean, art: Partial<Articulators>, abduction: number, dur: number, examples: string, extra: Partial<Phoneme> = {},
): Phoneme => ({ ipa, manner, voiced, art, abduction, dur, examples, ...extra });

export const CONSONANTS: Record<string, Phoneme> = {
  // fricatives
  // lips spread back against the teeth: the short cavity in front of the
  // groove puts the hiss where it is measured (male /s/: peak 4-5 kHz, mean
  // 5-6 kHz; Jongman et al. 2000), and rounding from the next vowel cannot
  // stretch it down to a lisp
  s: C('s', 'fricative', false, { jaw: 0.15, tongueX: 0.3, tongueY: 0.0, tongueRoot: 1.2, tipX: 0.68, tipY: 0.516, groove: 1, lipOpen: 0.18, lipRound: 0, lipProtrude: -0.35, lipTuck: 0, velum: 0 }, 0.55, 0.12, 'sasso, hiss, see'),
  z: C('z', 'fricative', true, { jaw: 0.15, tongueX: 0.3, tongueY: 0.0, tongueRoot: 1.2, tipX: 0.68, tipY: 0.516, groove: 1, lipOpen: 0.18, lipRound: 0, lipProtrude: -0.35, lipTuck: 0, velum: 0 }, 0.12, 0.09, 'rosa (N. It.), zoo'),
  'ʃ': C('ʃ', 'fricative', false, { jaw: 0.19, tongueX: 0.434, tongueY: 1.19, tongueRoot: 1.2, tipX: -0.025, tipY: 1.453, groove: 0.545, lipOpen: -0.159, lipRound: 0.776, lipProtrude: 0.925, lipTuck: 0, velum: 0 }, 0.55, 0.13, 'scena, she'),
  'ʒ': C('ʒ', 'fricative', true, { jaw: 0.19, tongueX: 0.434, tongueY: 1.19, tongueRoot: 1.2, tipX: -0.025, tipY: 1.453, groove: 0.545, lipOpen: -0.159, lipRound: 0.776, lipProtrude: 0.925, lipTuck: 0, velum: 0 }, 0.12, 0.1, 'beige'),
  f: C('f', 'fricative', false, { jaw: 0.12, lipOpen: 0.522, lipTuck: 1, lipRound: 0, lipProtrude: 0, velum: 0 }, 0.55, 0.12, 'fame, father'),
  v: C('v', 'fricative', true, { jaw: 0.12, lipOpen: 0.522, lipTuck: 1, lipRound: 0, lipProtrude: 0, velum: 0 }, 0.12, 0.08, 'voce'),
  'θ': C('θ', 'fricative', false, { jaw: 0.2, tipX: 1.05, tipY: 0.1, groove: 0, lipOpen: 0.25, lipTuck: 0, velum: 0 }, 0.55, 0.12, 'thin'),
  'ð': C('ð', 'fricative', true, { jaw: 0.2, tipX: 1.05, tipY: 0.1, groove: 0, lipOpen: 0.25, lipTuck: 0, velum: 0 }, 0.12, 0.07, 'this'),
  // glottis open about 0.27 cm^2: between vowels the folds keep flapping (breathy [ɦ])
  h: C('h', 'glottal', false, {}, 0.5, 0.08, 'heed, hiss'),
  // stops
  p: C('p', 'stop', false, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: 0 }, 0.5, 0.09, 'papà'),
  b: C('b', 'stop', true, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: 0 }, 0.08, 0.07, 'buzz'),
  t: C('t', 'stop', false, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: 0 }, 0.5, 0.08, 'tutto'),
  d: C('d', 'stop', true, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: 0 }, 0.08, 0.06, 'dado, heed'),
  k: C('k', 'stop', false, { tongueX: -0.25, tongueY: 1.7, tongueRoot: 1.2, tipY: 0, groove: 0, velum: 0 }, 0.5, 0.09, 'casa', { dorsal: true }),
  g: C('g', 'stop', true, { tongueX: -0.25, tongueY: 1.7, tongueRoot: 1.2, tipY: 0, groove: 0, velum: 0 }, 0.08, 0.07, 'gatto', { dorsal: true }),
  // nasals
  m: C('m', 'nasal', true, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: 1 }, 0, 0.08, 'mamma'),
  n: C('n', 'nasal', true, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: 1 }, 0, 0.07, 'nonno'),
  'ɲ': C('ɲ', 'nasal', true, { jaw: 0.1, tongueX: 0.9, tongueY: 1.5, tongueRoot: 1.2, tipY: 0.1, velum: 1 }, 0, 0.09, 'gnocchi'),
  // the dorsum closes against the oral face of the lowered velum, in front of
  // the velopharyngeal port: further back it would cut the nose off too
  'ŋ': C('ŋ', 'nasal', true, { tongueX: 0.15, tongueY: 1.7, tongueRoot: 1.2, tipY: 0, velum: 1 }, 0, 0.08, 'sing', { dorsal: true }),
  // approximants, laterals, trill
  // the air of a lateral flows around the sides of the tongue, which a one-
  // dimensional tube cannot show: the tongue body has its own target here, so
  // that a high vowel next to it (il, lino) cannot close the passage
  l: C('l', 'lateral', true, { jaw: 0.15, tongueX: 0.4, tongueY: 0.4, tongueRoot: 1.2, tipX: 0.2, tipY: 1.054, groove: 0, velum: 0 }, 0, 0.07, 'luna'),
  'ʎ': C('ʎ', 'lateral', true, { jaw: 0.1, tongueX: 0.9, tongueY: 0.962, tongueRoot: 1.2, tipY: 0.1, velum: 0 }, 0, 0.09, 'figlio'),
  // dark (velarised) l of English codas, "feel": the tongue body backs up, F2 near 1000 Hz
  'ɫ': C('ɫ', 'lateral', true, { jaw: 0.2, tongueX: -1.19, tongueY: 0.38, tongueRoot: 1.2, tipX: 0.2, tipY: 1.054, groove: 0, velum: 0 }, 0, 0.08, 'feel, milk'),
  // the tip rests just below the alveolar ridge; the sequencer adds the fast
  // contacts (about 26 per second, Recasens 1991) on top of this posture
  r: C('r', 'trill', true, { jaw: 0.15, tipX: 0.25, tipY: 1.25, groove: 0, velum: 0 }, 0, 0.08, 'raro (trill)'),
  // American r: tip up and back, tongue body low and back, lips rounded: F3
  // about 1600 Hz with the passage kept at 0.3 cm^2, so it does not hiss
  'ɹ': C('ɹ', 'approximant', true, { jaw: 0.2, tongueX: -0.707, tongueY: -0.975, tongueRoot: 1.2, tipX: -0.97, tipY: 2.197, lipOpen: 0.197, lipRound: 0.81, lipProtrude: 0.332, velum: 0 }, 0, 0.08, 'red'),
  j: C('j', 'approximant', true, { jaw: 0.06, tongueX: 1.0, tongueY: 0.925, tongueRoot: 1.2, lipRound: 0, velum: 0 }, 0, 0.06, 'ieri, yes'),
  w: C('w', 'approximant', true, { jaw: 0.1, tongueX: -0.8, tongueY: 0.3, tongueRoot: 1.2, lipOpen: -0.08, lipRound: 1, lipProtrude: 0.8, lipTuck: 0, velum: 0 }, 0, 0.06, 'uomo, we'),
  // affricates
  'tʃ': C('tʃ', 'affricate', false, {}, 0.5, 0.14, 'voce, ciao', { parts: ['t', 'ʃ'] }),
  'dʒ': C('dʒ', 'affricate', true, {}, 0.1, 0.12, 'gelato', { parts: ['d', 'ʒ'] }),
  ts: C('ts', 'affricate', false, {}, 0.5, 0.13, 'pizza', { parts: ['t', 's'] }),
  dz: C('dz', 'affricate', true, {}, 0.1, 0.11, 'zero', { parts: ['d', 'z'] }),
  // pause
  _: C('_', 'silence', false, {}, 0.9, 0.2, 'pause'),
};

/** Consonants that only exist as fast gestures inside speech. */
export const GESTURES: Record<string, Phoneme> = {
  // one ballistic flick of the tongue tip against the ridge: Italian intervocalic r, American "butter"
  'ɾ': C('ɾ', 'tap', true, { tipX: 0.25, groove: 0, velum: 0 }, 0, 0.025, 'caro, butter'),
  // the vocal folds pressed together for a moment: "button", "uh-oh"
  'ʔ': C('ʔ', 'glottalStop', false, {}, 0, 0.05, 'button'),
};

export const PHONEMES: Record<string, Phoneme> = { ...VOWELS, ...GLIDING, ...CONSONANTS, ...GESTURES };

export const isVowel = (ipa: string): boolean => PHONEMES[ipa]?.manner === 'vowel';
