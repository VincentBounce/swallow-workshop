import type { AreaFunction } from '../tract/areaFunction';

/**
 * Vocal tract area functions measured with magnetic resonance imaging.
 *
 * Story, B. H. (2008), "Comparison of magnetic resonance imaging-based vocal
 * tract area functions obtained from the same speaker in 1994 and 2002",
 * JASA 123(1), Table I: the 2002 scans of the adult male speaker of Story,
 * Titze & Hoffman (1996), 11 American English vowels, 44 sections of equal
 * length from the glottis (index 0) to the lips (index 43), areas in cm^2.
 * Table II gives the formants of the same speaker's recorded vowels (mean of
 * several productions) and the formants Story computed from the areas.
 */
export interface MriVowel {
  ipa: string;
  /** cm^2, glottis to lips */
  areas: number[];
  /** section length, cm */
  dx: number;
  /** formants of the recorded vowels, Hz */
  recorded: [number, number, number];
  /** formants computed from the area function by Story (2008), Hz */
  computed: [number, number, number];
}

const IPA = ['i', 'ɪ', 'e', 'ɛ', 'æ', 'ʌ', 'ɑ', 'ɔ', 'o', 'ʊ', 'u'];

// one row per section, one column per vowel (order of IPA)
const ROWS = `
0.51 0.28 0.29 0.37 0.31 0.23 0.56 0.27 0.38 0.37 0.54
0.59 0.21 0.26 0.30 0.21 0.34 0.62 0.43 0.45 0.38 0.61
0.62 0.21 0.30 0.24 0.18 0.47 0.66 0.54 0.57 0.49 0.66
0.72 0.30 0.40 0.23 0.23 0.60 0.78 0.67 0.77 0.62 0.75
1.24 0.47 0.55 0.29 0.33 0.77 0.97 0.83 1.31 0.85 1.13
2.30 0.71 0.74 0.41 0.50 1.06 1.16 0.92 1.92 1.28 1.99
3.30 1.12 0.99 0.58 0.78 1.26 1.12 0.89 1.74 1.62 2.83
3.59 1.48 1.09 0.82 0.96 1.09 0.82 0.73 1.11 1.47 2.90
3.22 1.35 0.90 0.97 0.85 0.80 0.55 0.55 0.75 1.04 2.52
2.86 1.05 0.69 0.82 0.63 0.65 0.45 0.44 0.59 0.81 2.40
3.00 0.92 0.77 0.62 0.46 0.56 0.37 0.37 0.57 1.03 2.83
3.61 0.92 1.31 0.54 0.36 0.47 0.29 0.28 0.68 1.44 3.56
4.39 1.19 2.13 0.54 0.33 0.37 0.21 0.18 0.73 1.49 3.99
4.95 1.94 2.74 0.68 0.46 0.24 0.15 0.14 0.67 1.28 3.89
5.17 2.83 3.03 1.09 0.73 0.17 0.16 0.15 0.58 1.06 3.50
5.16 3.31 3.23 1.62 1.00 0.18 0.25 0.14 0.49 0.85 3.04
5.18 3.48 3.33 2.03 1.30 0.23 0.34 0.13 0.44 0.69 2.64
5.26 3.60 3.27 2.35 1.66 0.27 0.43 0.14 0.42 0.56 2.44
5.20 3.64 3.09 2.51 1.97 0.28 0.54 0.18 0.49 0.42 2.31
5.02 3.49 2.84 2.39 2.06 0.29 0.61 0.20 0.53 0.27 2.07
4.71 3.20 2.66 2.22 2.03 0.33 0.67 0.23 0.38 0.27 1.80
4.13 2.90 2.46 2.13 2.01 0.52 0.98 0.49 0.30 0.41 1.52
3.43 2.59 2.14 2.00 1.89 0.97 1.76 1.03 0.45 0.51 1.14
2.83 2.21 1.79 1.78 1.66 1.50 2.75 1.58 0.61 0.49 0.74
2.32 1.87 1.44 1.58 1.49 1.91 3.52 2.06 0.71 0.47 0.42
1.83 1.54 1.17 1.43 1.42 2.23 4.08 2.61 0.79 0.50 0.22
1.46 1.20 1.00 1.31 1.37 2.65 4.74 3.35 0.86 0.58 0.14
1.23 0.92 0.88 1.23 1.34 3.29 5.61 4.34 1.01 0.80 0.20
1.08 0.74 0.80 1.24 1.41 4.13 6.60 5.51 1.41 1.19 0.47
0.94 0.59 0.81 1.38 1.58 5.00 7.61 6.70 2.09 1.62 0.89
0.80 0.52 0.85 1.61 1.82 5.77 8.48 7.75 3.00 2.27 1.15
0.67 0.54 0.84 1.82 2.19 6.33 9.06 8.63 4.10 3.24 1.42
0.55 0.59 0.86 1.96 2.63 6.61 9.29 9.29 5.16 4.16 2.17
0.46 0.65 0.96 2.01 2.97 6.63 9.26 9.59 6.22 5.00 3.04
0.40 0.71 1.18 2.00 3.17 6.45 9.06 9.42 7.34 5.70 3.69
0.36 0.67 1.35 1.95 3.40 6.04 8.64 8.78 8.15 6.11 4.70
0.35 0.61 1.48 1.77 3.56 5.39 7.91 7.82 8.61 6.21 5.74
0.35 0.57 1.62 1.48 3.57 4.42 6.98 6.50 8.37 6.29 5.41
0.38 0.50 1.49 1.30 3.58 3.29 6.02 4.95 6.76 6.24 3.82
0.51 0.48 1.29 1.21 3.44 2.37 5.13 3.47 4.37 4.91 2.34
0.74 0.54 1.24 1.10 3.15 1.74 4.55 2.15 2.30 2.61 1.35
0.92 0.73 1.17 0.99 3.38 1.36 4.52 1.38 1.06 1.09 0.65
0.96 0.93 1.04 0.91 3.99 1.17 4.71 1.11 0.58 0.63 0.29
0.91 0.82 0.95 0.78 4.17 0.99 4.72 0.90 0.47 0.59 0.16
`;

const DX = [0.384, 0.376, 0.386, 0.393, 0.366, 0.390, 0.388, 0.395, 0.417, 0.440, 0.445];
const RECORDED = [
  [295, 1923, 2797], [478, 1965, 2688], [509, 1917, 2617], [659, 1740, 2485], [765, 1724, 2501], [752, 1300, 2698],
  [715, 1180, 2691], [665, 932, 2814], [563, 835, 2637], [518, 947, 2355], [430, 917, 2087],
];
const COMPUTED = [
  [325, 2139, 2976], [413, 2103, 2626], [484, 1887, 2404], [565, 1595, 2200], [810, 1655, 2310], [593, 836, 3099],
  [694, 942, 2948], [557, 709, 3176], [499, 768, 2421], [477, 789, 2499], [314, 702, 2298],
];

const table = ROWS.trim().split('\n').map((r) => r.trim().split(/\s+/).map(Number));

export const MRI_VOWELS: MriVowel[] = IPA.map((ipa, j) => ({
  ipa,
  areas: table.map((r) => r[j]),
  dx: DX[j],
  recorded: RECORDED[j] as [number, number, number],
  computed: COMPUTED[j] as [number, number, number],
}));

/** A measured area function as a tube for the acoustic models. */
export function mriAreaFunction(v: MriVowel): AreaFunction {
  const n = v.areas.length;
  return { areas: Float64Array.from(v.areas), length: n * v.dx, dx: v.dx, teethIndex: n - 3, lipsIndex: n - 2 };
}

/**
 * Shape distance between two area functions stretched to the same length:
 * root mean square difference of the log areas over the first `span` of the
 * tract (0.9 leaves out the lips, which MRI segments poorly). 0.1 means the
 * areas differ by about 10 %, 0.7 by a factor of two.
 */
export function shapeDistance(a: ArrayLike<number>, b: ArrayLike<number>, span = 0.9, k = 88): number {
  const at = (x: ArrayLike<number>, f: number) => {
    const p = Math.min(x.length - 1, Math.max(0, f * x.length - 0.5));
    const i = Math.floor(p), t = p - i;
    return x[i] + (x[Math.min(x.length - 1, i + 1)] - x[i]) * t;
  };
  const m = Math.round(k * span);
  let s = 0;
  for (let j = 0; j < m; j++) {
    const f = (j + 0.5) / k;
    s += (Math.log(Math.max(0.01, at(a, f))) - Math.log(Math.max(0.01, at(b, f)))) ** 2;
  }
  return Math.sqrt(s / m);
}

/** Narrowest section more than `from` cm above the glottis (cm^2). */
export function narrowestAbove(areas: ArrayLike<number>, dx: number, from = 2.6): number {
  let m = Infinity;
  for (let i = Math.ceil(from / dx); i < areas.length; i++) m = Math.min(m, areas[i]);
  return m;
}
