import type { Phone } from './g2p';

/**
 * American English grapheme to phoneme conversion.
 *
 * 1. A pronunciation lexicon (about 89 000 words with primary and secondary
 *    stress; see scripts/build-lexicon.ts), loaded on demand.
 * 2. Inflections of known words: plural and possessive -s, past -ed, -ing,
 *    -er, -est, -ly, -ness, with the usual spelling changes (stop/stopped,
 *    make/making, city/cities) and the voicing rules of the endings.
 * 3. Compounds split into known words (voice + workshop).
 * 4. Letter-to-sound rules in the style of Elovitz, Johnson, McHugh & Shore
 *    (1976, NRL Report 7948) for anything else, with a simple stress rule.
 *
 * Pronunciations are written in a compact alphabet with one letter per
 * diphthong and affricate (A = eɪ, I = aɪ, O = oʊ, W = aʊ, Y = ɔɪ, ʤ, ʧ;
 * ᵊ and ᵻ are reduced vowels, ɾ the flap of "butter", ʔ a glottal stop) and
 * converted to the phones of the model by toPhones().
 */

let LEXICON: Map<string, string> | null = null;
let loading: Promise<void> | null = null;

/** Built-in words, so that the examples work before the lexicon has loaded. */
const BUILTIN: Record<string, string> = {
  a: 'ɐ', the: 'ðə', and: 'ænd', of: 'ʌv', is: 'ɪz', made: 'mˈAd', this: 'ðˈɪs', heed: 'hˈid', hid: 'hˈɪd', head: 'hˈɛd', had: 'hˈæd',
  hod: 'hˈɑd', hawed: 'hˈɔd', hood: 'hˈʊd', "who'd": 'hˈud', hud: 'hˈʌd', heard: 'hˈɜɹd', father: 'fˈɑðəɹ', hiss: 'hˈɪs', buzz: 'bˈʌz',
  filter: 'fˈɪltəɹ', voice: 'vˈYs', see: 'sˈi', she: 'ʃˈi', sing: 'sˈɪŋ', hello: 'həlˈO', world: 'wˈɜɹld', red: 'ɹˈɛd', thin: 'θˈɪn',
  speech: 'spˈiʧ', sound: 'sˈWnd', melody: 'mˈɛlədi', water: 'wˈɔɾəɹ', butter: 'bˈʌɾəɹ', little: 'lˈɪɾᵊl', button: 'bˈʌʔn',
};

/** Parses a "word<TAB>pronunciation" list into the lexicon. Returns the number of words. */
export function setEnglishLexicon(text: string): number {
  const m = new Map<string, string>();
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const tab = text.indexOf('\t', start);
    if (tab > start && tab < end) m.set(text.slice(start, tab), text.slice(tab + 1, end).trim());
    start = end + 1;
  }
  LEXICON = m;
  return m.size;
}

export function englishLexiconSize(): number { return LEXICON ? LEXICON.size : 0; }

/**
 * Loads the lexicon in the browser (gzip-compressed list, decompressed with
 * DecompressionStream; a server that already decompressed it also works).
 */
export function loadEnglishLexicon(url = 'lexicon/en-us.lex'): Promise<void> {
  if (LEXICON) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`lexicon: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let text: string;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(ds).text();
    } else text = new TextDecoder().decode(bytes);
    setEnglishLexicon(text);
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

function lookup(word: string): string | null {
  return LEXICON?.get(word) ?? BUILTIN[word] ?? null;
}

// ------------------------------------------------------------------ inflections

const VOWEL_LETTERS = 'aeiouy';
const SIBILANT_END = /[szʃʒʧʤ]$/;
const VOICELESS_END = /[ptkfθ]$/;

/** Last phoneme symbol of a pronunciation (stress marks skipped). */
function lastSymbol(ps: string): string {
  const s = ps.replace(/[ˈˌ]/g, '');
  return s[s.length - 1] ?? '';
}

function plural(ps: string): string {
  const last = lastSymbol(ps);
  if (SIBILANT_END.test(last)) return ps + 'ᵻz';
  if (VOICELESS_END.test(last)) return ps + 's';
  return ps + 'z';
}

function past(ps: string): string {
  const last = lastSymbol(ps);
  if (last === 't' || last === 'd') return ps + 'ᵻd';
  if (/[ptkfθsʃʧ]$/.test(last)) return ps + 't';
  return ps + 'd';
}

/** Candidate stems of an inflected spelling: stopped -> stop, making -> make, cities -> city. */
function stems(stem: string): string[] {
  const out = [stem];
  if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2] && !VOWEL_LETTERS.includes(stem[stem.length - 1])) out.push(stem.slice(0, -1));
  out.push(stem + 'e');
  if (stem.endsWith('i')) out.push(stem.slice(0, -1) + 'y');
  return out;
}

const SUFFIXES: [string, (ps: string) => string][] = [
  ["'s", plural], ['ies', (ps) => plural(ps)], ['es', plural], ['s', plural],
  ['ied', past], ['ed', past], ['ing', (ps) => ps + 'ɪŋ'], ['ingly', (ps) => ps + 'ɪŋli'],
  ['ers', (ps) => ps + 'əɹz'], ['er', (ps) => ps + 'əɹ'], ['est', (ps) => ps + 'ᵻst'],
  ['ly', (ps) => ps + 'li'], ['ness', (ps) => ps + 'nəs'], ['ment', (ps) => ps + 'mənt'],
  ['ful', (ps) => ps + 'fəl'], ['less', (ps) => ps + 'ləs'], ['able', (ps) => ps + 'əbᵊl'],
];

function inflected(word: string): string | null {
  for (const [suf, f] of SUFFIXES) {
    if (!word.endsWith(suf) || word.length < suf.length + 2) continue;
    let base = word.slice(0, -suf.length);
    if (suf === 'ies' || suf === 'ied') base += 'y';
    for (const s of stems(base)) {
      const ps = lookup(s) ?? compound(s);
      if (ps) return f(ps);
    }
  }
  return null;
}

/** Splits an unknown word into known words (fewest pieces), e.g. "voiceworkshop". */
function compound(word: string): string | null {
  const n = word.length;
  if (n < 6) return null;
  const best: ({ cost: number; ps: string } | null)[] = new Array(n + 1).fill(null);
  best[0] = { cost: 0, ps: '' };
  for (let i = 0; i < n; i++) {
    const b = best[i];
    if (!b) continue;
    for (let j = Math.min(n, i + 18); j >= i + 3; j--) {
      const ps = lookup(word.slice(i, j));
      if (!ps) continue;
      const c = b.cost + 1;
      if (!best[j] || best[j]!.cost > c) best[j] = { cost: c, ps: b.ps + ps };
    }
  }
  const r = best[n];
  return r && r.cost <= 3 ? r.ps : null;
}

// --------------------------------------------------------- letter to sound

type Rule = [string, string, string, string];

/**
 * Letter-to-sound rules [left context, letters, right context, phonemes] in
 * the notation of the NRL rules: '#' one or more vowels, ':' zero or more
 * consonants, '^' one consonant, '.' one voiced consonant, '+' a front vowel
 * (e, i, y), '%' a suffix (-e, -er, -es, -ed, -ing, -ely), '&' a sibilant,
 * '@' a consonant after which u is /u/, '*' one or more consonants, ' ' a
 * word boundary. Rules are tried in order; the first match wins.
 */
const RULES: Record<string, Rule[]> = {
  a: [
    [' ', 'a', ' ', 'ə'], [' ', 'are', ' ', 'ɑɹ'], [' ', 'ar', 'o', 'əɹ'], ['', 'ar', '#', 'ɛɹ'], ['^', 'as', '#', 'As'],
    ['', 'a', 'wa', 'ə'], ['', 'aw', '', 'ɔ'], [' :', 'any', '', 'ɛni'], ['', 'a', '^+#', 'A'], ['#:', 'ally', '', 'əli'],
    [' ', 'al', '#', 'əl'], ['', 'again', '', 'əɡɛn'], ['#:', 'ag', 'e', 'ɪʤ'], ['', 'a', '^+:#', 'æ'], [' :', 'a', '^+ ', 'A'],
    ['', 'a', '^%', 'A'], [' ', 'arr', '', 'əɹ'], ['', 'arr', '', 'æɹ'], [' :', 'ar', ' ', 'ɑɹ'], ['', 'ar', ' ', 'əɹ'],
    ['', 'ar', '', 'ɑɹ'], ['', 'air', '', 'ɛɹ'], ['', 'ai', '', 'A'], ['', 'ay', '', 'A'], ['', 'au', '', 'ɔ'],
    ['#:', 'al', ' ', 'əl'], ['#:', 'als', ' ', 'əlz'], ['', 'alk', '', 'ɔk'], ['', 'al', '^', 'ɔl'], [' :', 'able', '', 'Abəl'],
    ['', 'able', '', 'əbəl'], ['', 'ang', '+', 'Anʤ'], ['', 'a', '', 'æ'],
  ],
  b: [[' ', 'be', '^#', 'bɪ'], ['', 'being', '', 'biɪŋ'], [' ', 'both', ' ', 'bOθ'], [' ', 'bus', '#', 'bɪz'], ['', 'buil', '', 'bɪl'], ['', 'bb', '', 'b'], ['', 'b', '', 'b']],
  c: [
    [' ', 'ch', '^', 'k'], ['^e', 'ch', '', 'k'], ['', 'ch', '', 'ʧ'], [' s', 'ci', '#', 'sI'], ['', 'ci', 'a', 'ʃ'], ['', 'ci', 'o', 'ʃ'],
    ['', 'ci', 'en', 'ʃ'], ['', 'c', '+', 's'], ['', 'ck', '', 'k'], ['', 'com', '%', 'kʌm'], ['', 'cc', '+', 'ks'], ['', 'cc', '', 'k'], ['', 'c', '', 'k'],
  ],
  d: [
    ['#:', 'ded', ' ', 'dɪd'], ['.e', 'd', ' ', 'd'], ['#:^e', 'd', ' ', 't'], [' ', 'de', '^#', 'dɪ'], [' ', 'do', ' ', 'du'],
    [' ', 'does', '', 'dʌz'], [' ', 'doing', '', 'duɪŋ'], [' ', 'dow', '', 'dW'], ['', 'du', 'a', 'ʤu'], ['', 'dd', '', 'd'], ['', 'd', '', 'd'],
  ],
  e: [
    ['#:', 'e', ' ', ''], [' :', 'e', ' ', 'i'], ['#', 'ed', ' ', 'd'], ['#:', 'e', 'd ', ''], ['', 'ev', 'er', 'ɛv'], ['', 'e', '^%', 'i'],
    ['', 'eri', '#', 'iɹi'], ['', 'eri', '', 'ɛɹɪ'], ['#:', 'er', '#', 'əɹ'], ['', 'er', '#', 'ɛɹ'], ['', 'er', '', 'ɜɹ'],
    [' ', 'even', '', 'ivən'], ['#:', 'e', 'w', ''], ['@', 'ew', '', 'u'], ['', 'ew', '', 'ju'], ['', 'e', 'o', 'i'],
    ['#:&', 'es', ' ', 'ɪz'], ['#:', 'e', 's ', ''], ['#:', 'ely', ' ', 'li'], ['#:', 'ement', '', 'mənt'], ['', 'eful', '', 'fʊl'],
    ['', 'ee', '', 'i'], ['', 'earn', '', 'ɜɹn'], [' ', 'ear', '^', 'ɜɹ'], ['', 'ead', '', 'ɛd'], ['#:', 'ea', ' ', 'iə'],
    ['', 'ea', 'su', 'ɛ'], ['', 'ea', '', 'i'], ['', 'eigh', '', 'A'], ['', 'ei', '', 'i'], [' ', 'eye', '', 'I'], ['', 'ey', '', 'i'],
    ['', 'eu', '', 'ju'], ['', 'e', '', 'ɛ'],
  ],
  f: [['', 'ful', '', 'fʊl'], ['', 'ff', '', 'f'], ['', 'f', '', 'f']],
  g: [
    ['', 'giv', '', 'ɡɪv'], [' ', 'g', 'i^', 'ɡ'], ['', 'ge', 't', 'ɡɛ'], ['su', 'gges', '', 'ɡʤɛs'], ['', 'gg', '', 'ɡ'],
    [' b#', 'g', '', 'ɡ'], ['', 'g', '+', 'ʤ'], ['', 'great', '', 'ɡɹAt'], ['#', 'gh', '', ''], ['', 'g', '', 'ɡ'],
  ],
  h: [[' ', 'hav', '', 'hæv'], [' ', 'here', '', 'hiɹ'], [' ', 'hour', '', 'Wəɹ'], ['', 'how', '', 'hW'], ['', 'h', '#', 'h'], ['', 'h', '', '']],
  i: [
    [' ', 'in', '', 'ɪn'], [' ', 'i', ' ', 'I'], ['', 'in', 'd', 'In'], ['', 'ier', '', 'iəɹ'], ['#:r', 'ied', '', 'id'], ['', 'ied', ' ', 'Id'],
    ['', 'ien', '', 'iɛn'], ['', 'ie', 't', 'Iɛ'], [' :', 'i', '%', 'I'], ['', 'i', '%', 'i'], ['', 'ie', '', 'i'], ['', 'i', '^+:#', 'ɪ'],
    ['', 'ir', '#', 'Iɹ'], ['', 'iz', '%', 'Iz'], ['', 'is', '%', 'Iz'], ['', 'i', 'd%', 'I'], ['+^', 'i', '^+', 'ɪ'], ['', 'i', 't%', 'I'],
    ['#:^', 'i', '^+', 'ɪ'], ['', 'i', '^+', 'I'], ['', 'ir', '', 'ɜɹ'], ['', 'igh', '', 'I'], ['', 'ild', '', 'Ild'], ['', 'ign', ' ', 'In'],
    ['', 'ign', '^', 'In'], ['', 'ign', '%', 'In'], ['', 'ique', '', 'ik'], ['', 'i', '', 'ɪ'],
  ],
  j: [['', 'j', '', 'ʤ']],
  k: [[' ', 'k', 'n', ''], ['', 'k', '', 'k']],
  l: [['', 'lo', 'c#', 'lO'], ['l', 'l', '', ''], ['#:^', 'l', '%', 'əl'], ['', 'lead', '', 'lid'], ['', 'l', '', 'l']],
  m: [['', 'mov', '', 'muv'], ['', 'mm', '', 'm'], ['', 'm', '', 'm']],
  n: [
    ['e', 'ng', '+', 'nʤ'], ['', 'ng', 'r', 'ŋɡ'], ['', 'ng', '#', 'ŋɡ'], ['', 'ngl', '%', 'ŋɡəl'], ['', 'ng', '', 'ŋ'], ['', 'nk', '', 'ŋk'],
    [' ', 'now', ' ', 'nW'], ['', 'nn', '', 'n'], ['', 'n', '', 'n'],
  ],
  o: [
    ['', 'of', ' ', 'əv'], ['', 'orough', '', 'ɜɹO'], ['#:', 'or', ' ', 'əɹ'], ['#:', 'ors', ' ', 'əɹz'], ['', 'or', '', 'ɔɹ'],
    [' ', 'one', '', 'wʌn'], ['', 'ow', '', 'O'], [' ', 'over', '', 'Ovəɹ'], ['', 'ov', '', 'ʌv'], ['', 'o', '^%', 'O'], ['', 'o', '^en', 'O'],
    ['', 'o', '^i#', 'O'], ['', 'ol', 'd', 'Ol'], ['', 'ought', '', 'ɔt'], ['', 'ough', '', 'ʌf'], [' ', 'ou', '', 'W'], ['h', 'ou', 's#', 'W'],
    ['', 'ous', '', 'əs'], ['', 'our', '', 'ɔɹ'], ['', 'ould', '', 'ʊd'], ['^', 'ou', '^l', 'ʌ'], ['', 'oup', '', 'up'], ['', 'ou', '', 'W'],
    ['', 'oy', '', 'Y'], ['', 'oing', '', 'Oɪŋ'], ['', 'oi', '', 'Y'], ['', 'oor', '', 'ɔɹ'], ['', 'ook', '', 'ʊk'], ['', 'ood', '', 'ʊd'],
    ['', 'oo', '', 'u'], ['', 'o', 'e', 'O'], ['', 'o', ' ', 'O'], ['', 'oa', '', 'O'], [' ', 'only', '', 'Onli'], [' ', 'once', '', 'wʌns'],
    ['', "on't", '', 'Ont'], ['c', 'o', 'n', 'ɑ'], ['', 'o', 'ng', 'ɔ'], [' :^', 'o', 'n', 'ʌ'], ['i', 'on', '', 'ən'], ['#:', 'on', ' ', 'ən'],
    ['#^', 'on', '', 'ən'], ['', 'o', 'st ', 'O'], ['', 'of', '^', 'ɔf'], ['', 'other', '', 'ʌðəɹ'], ['', 'oss', ' ', 'ɔs'], ['#:^', 'om', '', 'ʌm'],
    ['', 'o', '', 'ɑ'],
  ],
  p: [['', 'ph', '', 'f'], ['', 'peop', '', 'pip'], ['', 'pow', '', 'pW'], ['', 'put', ' ', 'pʊt'], ['', 'pp', '', 'p'], ['', 'p', '', 'p']],
  q: [['', 'quar', '', 'kwɔɹ'], ['', 'qu', '', 'kw'], ['', 'q', '', 'k']],
  r: [[' ', 're', '^#', 'ɹi'], ['', 'rr', '', 'ɹ'], ['', 'r', '', 'ɹ']],
  s: [
    ['', 'sh', '', 'ʃ'], ['#', 'sion', '', 'ʒən'], ['', 'some', '', 'sʌm'], ['#', 'sur', '#', 'ʒəɹ'], ['', 'sur', '#', 'ʃəɹ'], ['#', 'su', '#', 'ʒu'],
    ['#', 'ssu', '#', 'ʃu'], ['#', 'sed', ' ', 'zd'], ['#', 's', '#', 'z'], ['', 'said', '', 'sɛd'], ['^', 'sion', '', 'ʃən'], ['', 's', 's', ''],
    ['.', 's', ' ', 'z'], ['#:.e', 's', ' ', 'z'], ['#:^##', 's', ' ', 'z'], ['#:^#', 's', ' ', 's'], ['u', 's', ' ', 's'], [' :#', 's', ' ', 'z'],
    [' ', 'sch', '', 'sk'], ['', 's', 'c+', ''], ['#', 'sm', '', 'zm'], ['', 's', '', 's'],
  ],
  t: [
    [' ', 'the', ' ', 'ðə'], ['', 'to', ' ', 'tu'], ['', 'that', ' ', 'ðæt'], [' ', 'this', ' ', 'ðɪs'], [' ', 'they', '', 'ðA'], [' ', 'there', '', 'ðɛɹ'],
    ['', 'ther', '', 'ðəɹ'], ['', 'their', '', 'ðɛɹ'], [' ', 'than', ' ', 'ðæn'], [' ', 'them', ' ', 'ðɛm'], ['', 'these', ' ', 'ðiz'],
    [' ', 'then', '', 'ðɛn'], ['', 'through', '', 'θɹu'], ['', 'those', '', 'ðOz'], ['', 'though', ' ', 'ðO'], [' ', 'thus', '', 'ðʌs'],
    ['', 'th', '', 'θ'], ['#:', 'ted', ' ', 'tɪd'], ['s', 'ti', '#n', 'ʧ'], ['', 'ti', 'o', 'ʃ'], ['', 'ti', 'a', 'ʃ'], ['', 'tien', '', 'ʃən'],
    ['', 'tur', '#', 'ʧəɹ'], ['', 'tu', 'a', 'ʧu'], [' ', 'two', '', 'tu'], ['', 'tt', '', 't'], ['', 't', '', 't'],
  ],
  u: [
    [' ', 'un', 'i', 'jun'], [' ', 'un', '', 'ʌn'], [' ', 'upon', '', 'əpɔn'], ['@', 'ur', '#', 'ʊɹ'], ['', 'ur', '#', 'jʊɹ'], ['', 'ur', '*', 'ɜɹ'],
    ['', 'u', '^ ', 'ʌ'], ['', 'u', '^^', 'ʌ'], ['', 'uy', '', 'I'], [' g', 'u', '#', ''], ['g', 'u', '%', ''], ['g', 'u', '#', 'w'],
    ['#n', 'u', '', 'ju'], ['@', 'u', '', 'u'], ['', 'u', '', 'ju'],
  ],
  v: [['', 'view', '', 'vju'], ['', 'v', '', 'v']],
  w: [
    [' ', 'were', '', 'wɜɹ'], ['', 'wa', 's', 'wɑ'], ['', 'wa', 't', 'wɑ'], ['', 'where', '', 'wɛɹ'], ['', 'what', '', 'wɑt'], ['', 'whol', '', 'hOl'],
    ['', 'who', '', 'hu'], ['', 'wh', '', 'w'], ['', 'war', '', 'wɔɹ'], ['', 'wor', '^', 'wɜɹ'], ['', 'wr', '', 'ɹ'], ['', 'w', '', 'w'],
  ],
  x: [['', 'x', '', 'ks']],
  y: [
    ['', 'young', '', 'jʌŋ'], [' ', 'you', '', 'ju'], [' ', 'yes', '', 'jɛs'], [' ', 'y', '', 'j'], ['#:^', 'y', ' ', 'i'], ['#:^', 'y', 'i', 'i'],
    [' :', 'y', ' ', 'I'], [' :', 'y', '#', 'I'], [' :', 'y', '^+:#', 'ɪ'], [' :', 'y', '^#', 'I'], ['', 'y', '', 'ɪ'],
  ],
  z: [['', 'zz', '', 'z'], ['', 'z', '', 'z']],
  "'": [['', "'", '', '']],
};

const isVowelL = (c: string | undefined) => !!c && 'aeiouy'.includes(c);
const isConsL = (c: string | undefined) => !!c && c >= 'a' && c <= 'z' && !'aeiou'.includes(c);
const VOICED_L = 'bdvgjlmnrwz';
const SUFFIX_L = ['er', 'e', 'es', 'ed', 'ing', 'ely'];

/** Matches a right context starting at position i of w (w padded with spaces). */
function matchRight(ctx: string, w: string, i: number): boolean {
  for (let k = 0; k < ctx.length; k++) {
    const c = ctx[k];
    switch (c) {
      case '#': if (!isVowelL(w[i])) return false; while (isVowelL(w[i])) i++; break;
      case ':': while (isConsL(w[i])) i++; break;
      case '^': if (!isConsL(w[i])) return false; i++; break;
      case '.': if (!w[i] || !VOICED_L.includes(w[i])) return false; i++; break;
      case '+': if (!w[i] || !'eiy'.includes(w[i])) return false; i++; break;
      case '*': if (!isConsL(w[i])) return false; while (isConsL(w[i])) i++; break;
      case '&': if (w.startsWith('ch', i) || w.startsWith('sh', i)) { i += 2; break; } if (!w[i] || !'scgzxj'.includes(w[i])) return false; i++; break;
      case '@': if (w.startsWith('th', i) || w.startsWith('ch', i) || w.startsWith('sh', i)) { i += 2; break; } if (!w[i] || !'tsrdlznj'.includes(w[i])) return false; i++; break;
      case '%': {
        const s = SUFFIX_L.find((x) => w.startsWith(x, i) && !/[a-z]/.test(w[i + x.length] ?? ' '));
        if (!s) return false;
        i += s.length;
        break;
      }
      default: if (w[i] !== c) return false; i++;
    }
  }
  return true;
}

/** Matches a left context ending just before position i (read right to left). */
function matchLeft(ctx: string, w: string, i: number): boolean {
  let j = i - 1;
  for (let k = ctx.length - 1; k >= 0; k--) {
    const c = ctx[k];
    switch (c) {
      case '#': if (!isVowelL(w[j])) return false; while (isVowelL(w[j])) j--; break;
      case ':': while (isConsL(w[j])) j--; break;
      case '^': if (!isConsL(w[j])) return false; j--; break;
      case '.': if (!w[j] || !VOICED_L.includes(w[j])) return false; j--; break;
      case '+': if (!w[j] || !'eiy'.includes(w[j])) return false; j--; break;
      case '*': if (!isConsL(w[j])) return false; while (isConsL(w[j])) j--; break;
      case '&': if (!w[j] || !'scgzxjh'.includes(w[j])) return false; j--; break;
      case '@': if (!w[j] || !'tsrdlznjh'.includes(w[j])) return false; j--; break;
      default: if (w[j] !== c) return false; j--;
    }
  }
  return true;
}

/** Letter-to-sound rules with a simple stress assignment. */
export function rulesWord(word: string): string {
  const w = ' ' + word + ' ';
  let i = 1, out = '';
  while (i < w.length - 1) {
    const rules = RULES[w[i]];
    let done = false;
    if (rules) {
      for (const [l, m, r, ps] of rules) {
        if (!w.startsWith(m, i)) continue;
        if (!matchLeft(l, w, i) || !matchRight(r, w, i + m.length)) continue;
        out += ps; i += m.length; done = true;
        break;
      }
    }
    if (!done) i++;
  }
  return addStress(out, word);
}

const PS_VOWELS = 'AIOWYaiuæɑɔəɛɜɪʊʌᵊᵻ';

/** Stress for words without a lexicon entry: first syllable of short words, antepenult or before -ion/-ic. */
function addStress(ps: string, word: string): string {
  const idx: number[] = [];
  for (let k = 0; k < ps.length; k++) if (PS_VOWELS.includes(ps[k]) && !(k > 0 && PS_VOWELS.includes(ps[k - 1]))) idx.push(k);
  if (!idx.length) return ps;
  let s = 0;
  if (/(tion|sion|ic|ical|ity|ious)$/.test(word) && idx.length >= 2) s = idx.length - 2;
  else if (idx.length >= 4) s = idx.length - 3;
  // a schwa is never stressed
  while (s < idx.length - 1 && ps[idx[s]] === 'ə') s++;
  return ps.slice(0, idx[s]) + 'ˈ' + ps.slice(idx[s]);
}

// ----------------------------------------------------------------- numbers

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** An integer in English words (American, no "and"); years 1100-1999 as two pairs. */
export function englishNumber(n: number): string {
  if (n < 0) return 'minus ' + englishNumber(-n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n >= 1100 && n < 2000 && n % 100 !== 0) return englishNumber(Math.floor(n / 100)) + ' ' + (n % 100 < 10 ? 'oh ' + ONES[n % 100] : englishNumber(n % 100));
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + englishNumber(n % 100) : '');
  for (const [v, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as [number, string][]) {
    if (n >= v) return englishNumber(Math.floor(n / v)) + ' ' + name + (n % v ? ' ' + englishNumber(n % v) : '');
  }
  return String(n);
}

// ----------------------------------------------------------------- phones

/** Function words: no pitch accent and reduced timing even if the lexicon stresses them. */
const FUNCTION_WORDS = new Set(('a an the and or but nor of to in on at by for from with as into onto upon than that this these those ' +
  'is am are was were be been being do does did have has had will would shall should can could may might must ' +
  'i me my we us our you your he him his she her it its they them their there here not no so if then').split(' '));

const LETTER_PHONES: Record<string, string[]> = {
  A: ['eɪ'], I: ['aɪ'], O: ['oʊ'], W: ['aʊ'], Y: ['ɔɪ'], Q: ['oʊ'], 'ʤ': ['dʒ'], 'ʧ': ['tʃ'], 'ɡ': ['g'], 'ɐ': ['ə'],
  'ɒ': ['ɑ'], 'ᵊ': ['ə'], 'ᵻ': ['ɪ'], 'a': ['a'], 'ɚ': ['ɚ'], 'ɝ': ['ɝ'],
};
const PHONE_VOWELS = new Set(['i', 'ɪ', 'e', 'ɛ', 'æ', 'a', 'ɑ', 'ɔ', 'o', 'ʊ', 'u', 'ʌ', 'ə', 'eɪ', 'aɪ', 'oʊ', 'aʊ', 'ɔɪ', 'ɝ', 'ɚ']);

/** Converts a pronunciation of the compact alphabet into phones of the model. */
export function toPhones(ps: string, func = false): Phone[] {
  const out: Phone[] = [];
  let stress: 0 | 1 | 2 = 0;
  const sym = [...ps];
  for (let k = 0; k < sym.length; k++) {
    const c = sym[k];
    if (c === 'ˈ') { stress = 1; continue; }
    if (c === 'ˌ') { stress = 2; continue; }
    const next = sym[k + 1];
    let afterR = k + 2;
    while (sym[afterR] === 'ˈ' || sym[afterR] === 'ˌ') afterR++;
    let ipas: string[];
    let reduced = c === 'ᵊ' || c === 'ᵻ';
    // r-coloured vowels: "bird" ɜɹ -> ɝ, unstressed "butter" əɹ -> ɚ (before a vowel the r starts the next syllable)
    if ((c === 'ɜ' || c === 'ə') && next === 'ɹ' && !(sym[afterR] && PS_VOWELS.includes(sym[afterR]))) {
      ipas = [c === 'ɜ' ? 'ɝ' : 'ɚ'];
      k++;
    } else if (c === 'ɜ') ipas = ['ɝ'];
    else ipas = LETTER_PHONES[c] ?? [c];
    for (const ipa of ipas) {
      const p: Phone = { ipa };
      if (PHONE_VOWELS.has(ipa)) {
        if (stress === 1 && !func) p.stress = true;
        else if (stress === 2 && !func) p.stress2 = true;
        if (reduced || (ipa === 'ə' && !stress)) p.reduced = true;
        stress = 0;
        reduced = false;
      }
      out.push(p);
    }
  }
  // dark l: an l that does not start a syllable (before a consonant or at the end of the word)
  for (let k = 0; k < out.length; k++) {
    if (out[k].ipa !== 'l') continue;
    const nx = out[k + 1];
    if (k > 0 && (!nx || !PHONE_VOWELS.has(nx.ipa))) out[k].ipa = 'ɫ';
  }
  if (func) for (const p of out) p.func = true;
  if (out.length) { out[0].wordStart = true; out[out.length - 1].wordEnd = true; }
  return out;
}

/** Pronunciation of one English word in the compact alphabet, and where it came from. */
export function englishPronunciation(word: string): { ps: string; source: 'lexicon' | 'inflection' | 'compound' | 'rules' } {
  const w = word.toLowerCase().replace(/’/g, "'");
  const direct = lookup(w);
  if (direct) return { ps: direct, source: 'lexicon' };
  const inf = inflected(w);
  if (inf) return { ps: inf, source: 'inflection' };
  const cmp = compound(w);
  if (cmp) return { ps: cmp, source: 'compound' };
  return { ps: rulesWord(w.replace(/[^a-z']/g, '')), source: 'rules' };
}

/**
 * Weak forms of function words, as they are said inside a sentence ("a cup
 * of tea" is ə kʌp əv ti); the lexicon gives the citation forms.
 */
const WEAK_FORMS: Record<string, string> = {
  a: 'ə', an: 'ən', the: 'ðə', and: 'ənd', of: 'əv', to: 'tə', for: 'fəɹ', from: 'fɹəm', at: 'ət', as: 'əz', or: 'əɹ', but: 'bət',
  was: 'wəz', were: 'wəɹ', are: 'əɹ', am: 'əm', can: 'kən', have: 'həv', has: 'həz', had: 'həd', does: 'dəz', than: 'ðən', that: 'ðət',
  them: 'ðəm', some: 'səm', your: 'jəɹ', you: 'ju', he: 'hi', she: 'ʃi', we: 'wi', me: 'mi', be: 'bi', been: 'bɪn', is: 'ɪz', his: 'hɪz',
  her: 'həɹ', there: 'ðəɹ', could: 'kəd', would: 'wəd', should: 'ʃəd', will: 'wəl', shall: 'ʃəl', must: 'məst',
};

/** One English word to phones. */
export function englishWord(word: string): Phone[] {
  const w = word.toLowerCase();
  const weak = WEAK_FORMS[w];
  return toPhones(weak ?? englishPronunciation(w).ps, FUNCTION_WORDS.has(w));
}
