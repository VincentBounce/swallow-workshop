import { PHONEMES } from './phonemes';

/** A phone of an utterance after grapheme-to-phoneme conversion. */
export interface Phone {
  ipa: string;
  stress?: boolean;
  /** geminate (Italian double consonant) */
  long?: boolean;
  /** word boundary after this phone */
  wordEnd?: boolean;
  /** prosodic break (comma, full stop) after this phone */
  pause?: 'short' | 'long';
  /** question intonation at the end of the phrase */
  question?: boolean;
}

export type Lang = 'it' | 'en';

const IT_VOWELS = 'aeiouàèéìíòóùú';
const isV = (c: string | undefined) => !!c && IT_VOWELS.includes(c);
const isFrontV = (c: string | undefined) => !!c && 'eiéèìí'.includes(c);
const VOICED_C = 'bdgvlmnrz';

function baseVowel(c: string): { ipa: string; accent: boolean } {
  switch (c) {
    case 'à': return { ipa: 'a', accent: true };
    case 'è': return { ipa: 'ɛ', accent: true };
    case 'é': return { ipa: 'e', accent: true };
    case 'ì': case 'í': return { ipa: 'i', accent: true };
    case 'ò': return { ipa: 'ɔ', accent: true };
    case 'ó': return { ipa: 'o', accent: true };
    case 'ù': case 'ú': return { ipa: 'u', accent: true };
    default: return { ipa: c, accent: false };
  }
}

/**
 * Italian orthography to phones. Rules: c/g before e/i, ch/gh, sc(i), gn, gl(i),
 * qu, z, geminates, silent h, intervocalic s voiced (northern norm),
 * default stress on the penultimate syllable unless an accent is written.
 */
export function italianWord(word: string): Phone[] {
  const w = word.toLowerCase();
  const out: Phone[] = [];
  let accentIdx = -1;
  let i = 0;
  const push = (ipa: string, extra: Partial<Phone> = {}) => out.push({ ipa, ...extra });
  while (i < w.length) {
    const c = w[i], n = w[i + 1], n2 = w[i + 2];
    // geminates: double consonant letter
    if (!isV(c) && c === n && c !== 'h') {
      const ph = italianConsonant(w, i + 1);
      if (ph) { push(ph.ipa, { long: true }); i += 1 + ph.len; continue; }
    }
    if (isV(c)) {
      const v = baseVowel(c);
      // i/u as glides before another vowel (ie, uo, ia...) unless accented
      if ((v.ipa === 'i' || v.ipa === 'u') && !v.accent && isV(n) && out.length > 0) {
        push(v.ipa === 'i' ? 'j' : 'w'); i++; continue;
      }
      if (v.accent) accentIdx = out.length;
      push(v.ipa);
      i++;
      continue;
    }
    if (c === 'h') { i++; continue; }
    if (c === "'" ) { i++; continue; }
    const ph = italianConsonant(w, i);
    if (ph) { push(ph.ipa); i += ph.len; continue; }
    i++;
    void n2;
  }
  // stress: written accent, else penultimate vowel
  const vowelIdx = out.map((p, k) => (PHONEMES[p.ipa]?.manner === 'vowel' ? k : -1)).filter((k) => k >= 0);
  let st = accentIdx;
  if (st < 0 && vowelIdx.length) st = vowelIdx.length >= 2 ? vowelIdx[vowelIdx.length - 2] : vowelIdx[0];
  if (st >= 0) out[st].stress = true;
  // intervocalic s -> z (northern Italian), s before voiced consonant -> z
  for (let k = 0; k < out.length; k++) {
    if (out[k].ipa !== 's' || out[k].long) continue;
    const prev = out[k - 1], next = out[k + 1];
    const pv = prev && PHONEMES[prev.ipa]?.manner === 'vowel';
    const nv = next && PHONEMES[next.ipa]?.manner === 'vowel';
    if ((pv && nv) || (next && VOICED_C.includes(next.ipa))) out[k].ipa = 'z';
  }
  if (out.length) out[out.length - 1].wordEnd = true;
  return out;
}

function italianConsonant(w: string, i: number): { ipa: string; len: number } | null {
  const c = w[i], n = w[i + 1], n2 = w[i + 2];
  switch (c) {
    case 'c':
      if (n === 'h') return { ipa: 'k', len: 2 };
      if (n === 'i' && isV(n2)) return { ipa: 'tʃ', len: 2 };
      if (isFrontV(n)) return { ipa: 'tʃ', len: 1 };
      if (n === 'q') return { ipa: 'k', len: 2 };
      return { ipa: 'k', len: 1 };
    case 'g':
      if (n === 'h') return { ipa: 'g', len: 2 };
      if (n === 'n') return { ipa: 'ɲ', len: 2 };
      if (n === 'l' && n2 === 'i') return isV(w[i + 3]) ? { ipa: 'ʎ', len: 3 } : { ipa: 'ʎ', len: 2 };
      if (n === 'i' && isV(n2)) return { ipa: 'dʒ', len: 2 };
      if (isFrontV(n)) return { ipa: 'dʒ', len: 1 };
      return { ipa: 'g', len: 1 };
    case 's':
      if (n === 'c' && n2 === 'i' && isV(w[i + 3])) return { ipa: 'ʃ', len: 3 };
      if (n === 'c' && isFrontV(n2)) return { ipa: 'ʃ', len: 2 };
      return { ipa: 's', len: 1 };
    case 'q': return { ipa: 'k', len: 1 };
    case 'z': return { ipa: 'ts', len: 1 };
    case 'x': return { ipa: 'ks', len: 1 };
    case 'j': return { ipa: 'j', len: 1 };
    case 'y': return { ipa: 'j', len: 1 };
    case 'w': return { ipa: 'w', len: 1 };
    case 'k': return { ipa: 'k', len: 1 };
    default:
      if ('bdfglmnprtv'.includes(c)) return { ipa: c, len: 1 };
      return null;
  }
}

/** Small English lexicon for the examples of the explainer (IPA, General American). */
export const ENGLISH_LEXICON: Record<string, string> = {
  heed: 'hˈid', hid: 'hˈɪd', head: 'hˈɛd', had: 'hˈæd', hod: 'hˈɑd', hawed: 'hˈɔd', hood: 'hˈʊd', "who'd": 'hˈud',
  hud: 'hˈʌd', heard: 'hˈɝd', father: 'fˈɑðəɹ', hiss: 'hˈɪs', this: 'ðˈɪs', see: 'sˈi', buzz: 'bˈʌz',
  filter: 'fˈɪltəɹ', voice: 'vˈɔɪs', is: 'ɪz', made: 'mˈeɪd', of: 'ʌv', a: 'ə', and: 'ænd', the: 'ðə',
  hello: 'hɛlˈoʊ', world: 'wˈɝld', sing: 'sˈɪŋ', she: 'ʃˈi', sea: 'sˈi', shoe: 'ʃˈu', zoo: 'zˈu',
  hot: 'hˈɑt', mama: 'mˈɑmə', no: 'nˈoʊ', yes: 'jˈɛs', we: 'wˈi', red: 'ɹˈɛd', thin: 'θˈɪn',
  speech: 'spˈitʃ', sound: 'sˈaʊnd', melody: 'mˈɛlədi',
};

const IPA_SYMBOLS = Object.keys(PHONEMES).sort((a, b) => b.length - a.length);
const IPA_ALIASES: Record<string, string> = { 'ɝ': 'ɹ', 'ɐ': 'ə', 'ɚ': 'ə', 'ɡ': 'g', 'ɾ': 'r', 'ʁ': 'r', 'ɫ': 'l', 'ç': 'ʃ', 'x': 'k', 'ʔ': '_', 'ɒ': 'ɔ', 'y': 'i', 'ø': 'e', 'œ': 'ɛ' };

/** Parses an IPA string into phones (stress marks ˈ, length marks ː). */
export function parseIpa(s: string): Phone[] {
  const out: Phone[] = [];
  let stressNext = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === 'ˈ') { stressNext = true; i++; continue; }
    if (c === 'ˌ' || c === '.' || c === '/' || c === '[' || c === ']') { i++; continue; }
    if (c === 'ː' || c === ':') { if (out.length) out[out.length - 1].long = true; i++; continue; }
    if (c === ' ') { if (out.length) out[out.length - 1].wordEnd = true; i++; continue; }
    if (c === ',' || c === '|') { if (out.length) out[out.length - 1].pause = 'short'; i++; continue; }
    if (c === '‖' || c === '!' || c === ';') { if (out.length) out[out.length - 1].pause = 'long'; i++; continue; }
    if (c === '?') { if (out.length) { out[out.length - 1].pause = 'long'; out[out.length - 1].question = true; } i++; continue; }
    let matched = '';
    for (const sym of IPA_SYMBOLS) if (s.startsWith(sym, i)) { matched = sym; break; }
    if (!matched && IPA_ALIASES[c]) { out.push({ ipa: IPA_ALIASES[c], stress: stressNext }); stressNext = false; i++; continue; }
    if (matched) {
      // stress applies to the next vowel
      const ph = PHONEMES[matched];
      const p: Phone = { ipa: matched };
      if (stressNext && ph.manner === 'vowel') { p.stress = true; stressNext = false; }
      out.push(p);
      i += matched.length;
      continue;
    }
    i++;
  }
  return out;
}

/** Text (Italian or English words, or /IPA/) to phones. */
export function textToPhones(text: string, lang: Lang): Phone[] {
  const t = text.trim();
  if ((t.startsWith('/') && t.endsWith('/')) || (t.startsWith('[') && t.endsWith(']'))) return parseIpa(t.slice(1, -1));
  const out: Phone[] = [];
  const tokens = t.split(/(\s+|[,.;!?])/).filter((x) => x && !/^\s+$/.test(x));
  for (const tok of tokens) {
    if (/^[,;]$/.test(tok)) { if (out.length) out[out.length - 1].pause = 'short'; continue; }
    if (/^[.!]$/.test(tok)) { if (out.length) out[out.length - 1].pause = 'long'; continue; }
    if (tok === '?') { if (out.length) { out[out.length - 1].pause = 'long'; out[out.length - 1].question = true; } continue; }
    const word = tok.toLowerCase().replace(/[^a-zàèéìíòóùú']/g, '');
    if (!word) continue;
    let phones: Phone[];
    if (lang === 'en') {
      const ipa = ENGLISH_LEXICON[word];
      phones = ipa ? parseIpa(ipa) : italianWord(word);
    } else phones = italianWord(word);
    if (phones.length) phones[phones.length - 1].wordEnd = true;
    out.push(...phones);
  }
  return out;
}
