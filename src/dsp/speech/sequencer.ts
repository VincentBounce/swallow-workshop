import { Articulators, ARTICULATOR_KEYS, DEFAULT_ARTICULATORS } from '../tract/types';
import { PHONEMES, Phoneme } from './phonemes';
import { Phone, Lang } from './g2p';
import { Score, ScoreFrame, ScorePhone } from '../engine/params';

/**
 * Turns phones into a gestural score: piecewise targets for every articulator
 * and for the source (abduction, F0, lung pressure). The engine smooths the
 * targets with critically damped dynamics (TAM), so movements overlap.
 *
 * Coarticulation (Öhman 1966): a consonant only sets the articulators it
 * needs; the others are interpolated from the surrounding vowels, so the
 * tongue body glides from vowel to vowel through /p/ or /t/, and the lips
 * round ahead of /u/ during the preceding consonants.
 */
export interface ProsodyOptions {
  /** base pitch, Hz */
  f0: number;
  /** pitch range (semitones) of accents */
  accent: number;
  /** declination over the utterance (semitones) */
  declination: number;
  /** speaking rate multiplier (>1 faster) */
  rate: number;
  /** lung pressure, cm H2O */
  ps: number;
  /** language: affects aspiration of voiceless stops */
  lang: Lang;
  /** optional user contour: points (t in 0..1 of the utterance, f0 in Hz) */
  contour?: { t: number; f0: number }[];
  /** articulatory lead of targets before the acoustic segment, s */
  lead: number;
}

export const DEFAULT_PROSODY: ProsodyOptions = { f0: 120, accent: 3, declination: 3, rate: 1, ps: 8, lang: 'it', lead: 0.03 };

interface Seg {
  ipa: string;
  ph: Phoneme;
  t0: number;
  t1: number;
  stress: boolean;
  /** which part of a stop: closure or release */
  part?: 'closure' | 'release';
  label: string;
}

const FRAME = 0.005;

/** Keys a consonant constrains even if its spec omits them (none by default). */
function specifiedKeys(ph: Phoneme): (keyof Articulators)[] {
  if (ph.manner === 'vowel') return ARTICULATOR_KEYS;
  return Object.keys(ph.art) as (keyof Articulators)[];
}

export function buildScore(phones: Phone[], opts: Partial<ProsodyOptions> = {}): Score {
  const o: ProsodyOptions = { ...DEFAULT_PROSODY, ...opts };
  // expand affricates and attach durations
  const segs: Seg[] = [];
  let t = 0.06; // breath onset
  const rate = Math.max(0.3, o.rate);
  const lastVowelIdx = (() => {
    for (let i = phones.length - 1; i >= 0; i--) if (PHONEMES[phones[i].ipa]?.manner === 'vowel') return i;
    return -1;
  })();
  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    const ph = PHONEMES[p.ipa];
    if (!ph) continue;
    const parts: [string, number][] = ph.manner === 'affricate' && ph.parts
      ? [[ph.parts[0], 0.55], [ph.parts[1], 0.6]]
      : [[p.ipa, 1]];
    for (const [ipa, frac] of parts) {
      const q = PHONEMES[ipa];
      let dur = q.dur * frac;
      if (q.manner === 'vowel') {
        if (p.stress) dur *= 1.35;
        if (i === lastVowelIdx) dur *= 1.4; // phrase-final lengthening
        if (p.pause) dur *= 1.25;
      } else if (p.long) dur *= 1.9;
      dur /= rate;
      if (q.manner === 'stop' || (ph.manner === 'affricate' && ipa === ph.parts?.[0])) {
        const closure = dur * 0.75;
        segs.push({ ipa, ph: q, t0: t, t1: t + closure, stress: false, part: 'closure', label: ph.manner === 'affricate' ? p.ipa : ipa });
        t += closure;
        const rel = Math.max(0.012, dur * 0.25);
        segs.push({ ipa, ph: q, t0: t, t1: t + rel, stress: false, part: 'release', label: ph.manner === 'affricate' ? p.ipa : ipa });
        t += rel;
      } else {
        segs.push({ ipa, ph: q, t0: t, t1: t + dur, stress: !!p.stress && q.manner === 'vowel', label: ph.manner === 'affricate' ? p.ipa : ipa });
        t += dur;
      }
    }
    if (p.pause) {
      const d = (p.pause === 'long' ? 0.28 : 0.16) / rate;
      segs.push({ ipa: '_', ph: PHONEMES._, t0: t, t1: t + d, stress: false, label: '_' });
      t += d;
    }
  }
  const duration = t + 0.05;
  const lead = o.lead;

  // per-key anchor points: (time, value) at specified segments
  const anchors: Record<string, { t0: number; t1: number; v: number }[]> = {};
  for (const k of ARTICULATOR_KEYS) anchors[k] = [];
  for (const s of segs) {
    if (s.ph.manner === 'silence' || s.ph.manner === 'glottal') continue;
    let art: Partial<Articulators> = s.ph.art;
    if (s.part === 'release') {
      // at the release the closing articulator opens toward the next vowel: leave it free
      art = {};
    }
    const keys = s.part === 'release' ? [] : specifiedKeys(s.ph);
    for (const k of keys) {
      const v = art[k] ?? DEFAULT_ARTICULATORS[k];
      anchors[k].push({ t0: s.t0 - lead, t1: s.t1 - lead, v });
    }
  }
  const valueAt = (k: keyof Articulators, time: number): number => {
    const a = anchors[k];
    if (!a.length) return DEFAULT_ARTICULATORS[k];
    if (time <= a[0].t0) return a[0].v;
    for (let i = 0; i < a.length; i++) {
      if (time >= a[i].t0 && time <= a[i].t1) return a[i].v;
      if (i + 1 < a.length && time > a[i].t1 && time < a[i + 1].t0) {
        const u = (time - a[i].t1) / (a[i + 1].t0 - a[i].t1);
        return a[i].v + (a[i + 1].v - a[i].v) * u;
      }
    }
    return a[a.length - 1].v;
  };

  // F0 contour
  const vowelSegs = segs.filter((s) => s.ph.manner === 'vowel');
  const f0At = (time: number): number => {
    if (o.contour && o.contour.length >= 2) {
      const u = Math.min(1, Math.max(0, time / duration));
      const c = o.contour;
      if (u <= c[0].t) return c[0].f0;
      for (let i = 1; i < c.length; i++) {
        if (u <= c[i].t) {
          const w = (u - c[i - 1].t) / Math.max(1e-6, c[i].t - c[i - 1].t);
          return c[i - 1].f0 * Math.pow(c[i].f0 / c[i - 1].f0, w);
        }
      }
      return c[c.length - 1].f0;
    }
    let st = -o.declination * (time / duration);
    for (const v of vowelSegs) {
      if (!v.stress) continue;
      // smooth accent (raised cosine) peaking within the stressed vowel
      const c = 0.5 * (v.t0 + v.t1), w = (v.t1 - v.t0) * 1.6 + 0.08;
      const d = Math.abs(time - c);
      if (d < w) st += o.accent * 0.5 * (1 + Math.cos((Math.PI * d) / w));
    }
    // question: final rise
    const last = phones[phones.length - 1];
    if (last?.question) st += 5 * Math.max(0, (time - (duration - 0.35)) / 0.35);
    else st -= 2 * Math.max(0, (time - (duration - 0.3)) / 0.3);
    return o.f0 * Math.pow(2, st / 12);
  };

  // abduction / pressure / trill
  const segAt = (time: number): Seg | null => {
    for (const s of segs) if (time >= s.t0 && time < s.t1) return s;
    return null;
  };
  const aspirated = o.lang === 'en';
  const frames: ScoreFrame[] = [];
  const n = Math.ceil((duration + 0.25) / FRAME);
  for (let i = 0; i <= n; i++) {
    const time = i * FRAME;
    const art = {} as Articulators;
    for (const k of ARTICULATOR_KEYS) art[k] = valueAt(k, time);
    // glottal gestures lead the acoustic segment slightly
    const sg = segAt(time + 0.01);
    let abd = 0;
    if (!sg) abd = time < 0.06 ? 0.25 : 0.9;
    else if (sg.ph.manner === 'silence') abd = 0.9;
    else if (sg.part === 'release' && !sg.ph.voiced) abd = aspirated ? 0.6 : 0.1;
    else abd = sg.ph.abduction;
    // English aspiration continues into the following vowel onset
    if (aspirated && sg?.ph.manner === 'vowel') {
      const prev = segs[segs.indexOf(sg) - 1];
      if (prev && prev.part === 'release' && !prev.ph.voiced && time - sg.t0 < 0.04) abd = 0.45;
    }
    const tr = sg && sg.ph.manner === 'trill' ? 1 : 0;
    // lungs: on during the utterance, off at the end
    const ps = time < duration ? o.ps * (1 - 0.15 * (time / duration)) : 0;
    frames.push({ t: time, art, abduction: abd, f0: f0At(time), ps, trill: tr });
  }
  const sp: ScorePhone[] = [];
  for (const s of segs) {
    const prev = sp[sp.length - 1];
    if (prev && prev.ipa === s.label && s.part === 'release') { prev.t1 = s.t1; continue; }
    sp.push({ ipa: s.label, t0: s.t0, t1: s.t1 });
  }
  return { frames, phones: sp, duration };
}

/** A sustained vowel or a glide between targets, for the singing / A-B demos. */
export function sustainScore(
  targets: { art: Articulators; dur: number; f0: number; f0End?: number }[],
  ps = 8,
): Score {
  const frames: ScoreFrame[] = [];
  const phones: ScorePhone[] = [];
  let t = 0;
  for (const tg of targets) {
    const n = Math.max(1, Math.round(tg.dur / FRAME));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const f0 = tg.f0End ? tg.f0 * Math.pow(tg.f0End / tg.f0, u) : tg.f0;
      frames.push({ t: t + i * FRAME, art: { ...tg.art }, abduction: 0, f0, ps, trill: 0 });
    }
    phones.push({ ipa: '', t0: t, t1: t + tg.dur });
    t += tg.dur;
  }
  const last = frames[frames.length - 1];
  for (let i = 1; i < 30; i++) frames.push({ ...last, t: t + i * FRAME, ps: 0 });
  return { frames, phones, duration: t };
}
