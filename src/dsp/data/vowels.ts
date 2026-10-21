/**
 * Reference vowel formant data.
 *
 * Peterson & Barney (1952), "Control methods used in a study of the vowels",
 * JASA 24: mean F1/F2/F3 (Hz) of 10 American English vowels in h-V-d words.
 *
 * Hillenbrand, Getty, Clark & Wheeler (1995), "Acoustic characteristics of
 * American English vowels", JASA 97: mean F1/F2 at steady state (rounded).
 *
 * The "video" set lists the formants measured on the narrator voice used in
 * the explainer video (LPC on the vowel of each h-V-d word).
 */
export interface VowelRef {
  ipa: string;
  word: string;
  f1: number;
  f2: number;
  f3?: number;
}

export type Speaker = 'men' | 'women' | 'children';

export const PETERSON_BARNEY: Record<Speaker, VowelRef[]> = {
  men: [
    { ipa: 'i', word: 'heed', f1: 270, f2: 2290, f3: 3010 },
    { ipa: 'ɪ', word: 'hid', f1: 390, f2: 1990, f3: 2550 },
    { ipa: 'ɛ', word: 'head', f1: 530, f2: 1840, f3: 2480 },
    { ipa: 'æ', word: 'had', f1: 660, f2: 1720, f3: 2410 },
    { ipa: 'ɑ', word: 'hod', f1: 730, f2: 1090, f3: 2440 },
    { ipa: 'ɔ', word: 'hawed', f1: 570, f2: 840, f3: 2410 },
    { ipa: 'ʊ', word: 'hood', f1: 440, f2: 1020, f3: 2240 },
    { ipa: 'u', word: "who'd", f1: 300, f2: 870, f3: 2240 },
    { ipa: 'ʌ', word: 'hud', f1: 640, f2: 1190, f3: 2390 },
    { ipa: 'ɝ', word: 'heard', f1: 490, f2: 1350, f3: 1690 },
  ],
  women: [
    { ipa: 'i', word: 'heed', f1: 310, f2: 2790, f3: 3310 },
    { ipa: 'ɪ', word: 'hid', f1: 430, f2: 2480, f3: 3070 },
    { ipa: 'ɛ', word: 'head', f1: 610, f2: 2330, f3: 2990 },
    { ipa: 'æ', word: 'had', f1: 860, f2: 2050, f3: 2850 },
    { ipa: 'ɑ', word: 'hod', f1: 850, f2: 1220, f3: 2810 },
    { ipa: 'ɔ', word: 'hawed', f1: 590, f2: 920, f3: 2710 },
    { ipa: 'ʊ', word: 'hood', f1: 470, f2: 1160, f3: 2680 },
    { ipa: 'u', word: "who'd", f1: 370, f2: 950, f3: 2670 },
    { ipa: 'ʌ', word: 'hud', f1: 760, f2: 1400, f3: 2780 },
    { ipa: 'ɝ', word: 'heard', f1: 500, f2: 1640, f3: 1960 },
  ],
  children: [
    { ipa: 'i', word: 'heed', f1: 370, f2: 3200, f3: 3730 },
    { ipa: 'ɪ', word: 'hid', f1: 530, f2: 2730, f3: 3600 },
    { ipa: 'ɛ', word: 'head', f1: 690, f2: 2610, f3: 3570 },
    { ipa: 'æ', word: 'had', f1: 1010, f2: 2320, f3: 3320 },
    { ipa: 'ɑ', word: 'hod', f1: 1030, f2: 1370, f3: 3170 },
    { ipa: 'ɔ', word: 'hawed', f1: 680, f2: 1060, f3: 3180 },
    { ipa: 'ʊ', word: 'hood', f1: 560, f2: 1410, f3: 3310 },
    { ipa: 'u', word: "who'd", f1: 430, f2: 1170, f3: 3260 },
    { ipa: 'ʌ', word: 'hud', f1: 850, f2: 1590, f3: 3360 },
    { ipa: 'ɝ', word: 'heard', f1: 560, f2: 1820, f3: 2160 },
  ],
};

export const HILLENBRAND_MEN: VowelRef[] = [
  { ipa: 'i', word: 'heed', f1: 342, f2: 2322 },
  { ipa: 'ɪ', word: 'hid', f1: 427, f2: 2034 },
  { ipa: 'e', word: 'hayed', f1: 476, f2: 2089 },
  { ipa: 'ɛ', word: 'head', f1: 580, f2: 1799 },
  { ipa: 'æ', word: 'had', f1: 588, f2: 1952 },
  { ipa: 'ɑ', word: 'hod', f1: 768, f2: 1333 },
  { ipa: 'ɔ', word: 'hawed', f1: 652, f2: 997 },
  { ipa: 'o', word: 'hoed', f1: 497, f2: 910 },
  { ipa: 'ʊ', word: 'hood', f1: 469, f2: 1122 },
  { ipa: 'u', word: "who'd", f1: 378, f2: 997 },
  { ipa: 'ʌ', word: 'hud', f1: 623, f2: 1200 },
];

/** Formants of the explainer video's narrator voice (female), from LPC. */
export const VIDEO_VOICE: VowelRef[] = [
  { ipa: 'i', word: 'heed', f1: 413, f2: 2173, f3: 2758 },
  { ipa: 'ɪ', word: 'hid', f1: 565, f2: 2040, f3: 2271 },
  { ipa: 'ɛ', word: 'head', f1: 816, f2: 2085, f3: 2918 },
  { ipa: 'æ', word: 'had', f1: 837, f2: 1724, f3: 2484 },
  { ipa: 'ɑ', word: 'hod', f1: 802, f2: 1326, f3: 2661 },
  { ipa: 'ɔ', word: 'hawed', f1: 758, f2: 1290, f3: 2900 },
  { ipa: 'ʊ', word: 'hood', f1: 524, f2: 1430, f3: 2585 },
  { ipa: 'u', word: "who'd", f1: 432, f2: 1552, f3: 2395 },
  { ipa: 'ʌ', word: 'hud', f1: 791, f2: 1614, f3: 2920 },
];

/**
 * Target formants (adult male) used to fit the articulatory vowel targets.
 * Peterson & Barney where available; Italian /e/, /o/, /a/ and the neutral
 * vowel are placed on the same chart (Hillenbrand /e/, /o/; /a/ between /æ/ and
 * /ɑ/, as Italian /a/ is a central open vowel).
 */
export const MALE_TARGETS: Record<string, [number, number, number]> = {
  i: [270, 2290, 3010],
  'ɪ': [390, 1990, 2550],
  e: [440, 2050, 2650],
  'ɛ': [530, 1840, 2480],
  'æ': [660, 1720, 2410],
  a: [740, 1300, 2500],
  'ɑ': [730, 1090, 2440],
  'ɔ': [570, 840, 2410],
  o: [470, 900, 2450],
  'ʊ': [440, 1020, 2240],
  u: [300, 870, 2240],
  'ʌ': [640, 1190, 2390],
  'ə': [500, 1500, 2500],
};
