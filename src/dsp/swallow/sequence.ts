/**
 * Swallowing as key postures in time, on the same articulators and teeth that
 * shape the voice (no sound is made). Two sequences: the adult swallow (teeth
 * together, lips relaxed, tongue tip on the ridge behind the upper incisors, a
 * wave of the tongue from front to back) and the infantile, or atypical, one
 * (teeth apart, tip between or against the incisors, lips and chin tight,
 * tongue thrust forward). Same speaker for both, so only the pattern differs.
 */
import { Articulators, Teeth, DEFAULT_ARTICULATORS, DEFAULT_TEETH, ARTICULATOR_KEYS, ARTICULATOR_RANGES } from '../tract/types';
import { TractGeometry } from '../tract/geometry';

/** The named stages of a swallow. */
export type SwallowPhase = 'oralPrep' | 'oralTransit' | 'pharyngeal';
export const SWALLOW_PHASES: SwallowPhase[] = ['oralPrep', 'oralTransit', 'pharyngeal'];

export type SwallowId = 'adult' | 'infant';

/** One key posture: from `t` (s) the stage is `phase`, until the next key. */
export interface SwallowKey {
  t: number;
  phase: SwallowPhase;
  /** articulators away from rest */
  a: Partial<Articulators>;
  /** where the bolus is along the centreline: 1 at the lips, 0 at the glottis, below 0 down the oesophagus (fraction of the tract length) */
  bolus: number;
}

export interface SwallowSequence { id: SwallowId; keys: SwallowKey[]; teeth: Teeth }

/** The posture of a sequence at one instant. */
export interface SwallowPose { a: Articulators; teeth: Teeth; phase: SwallowPhase; bolus: number }

const ADULT: SwallowKey[] = [
  // the bolus gathered on the tongue, lips closed and relaxed, the back of the tongue sealed against the lowered velum
  { t: 0.0, phase: 'oralPrep', a: { jaw: 0.15, lipOpen: -0.25, tongueY: 0.3, tipX: 0.2, tipY: 1.2, velum: 0.4 }, bolus: 0.75 },
  // teeth together, tip on the ridge behind the upper incisors
  { t: 0.4, phase: 'oralPrep', a: { jaw: 0, lipOpen: -0.1, tongueX: 0.6, tongueY: 0.3, tipX: 0.2, tipY: 1.6, velum: 0.4 }, bolus: 0.72 },
  // the wave: the tongue presses up against the palate from front to back
  { t: 0.8, phase: 'oralTransit', a: { jaw: 0, lipOpen: -0.1, tongueX: 0, tongueY: 1.3, tipX: 0.2, tipY: 1.6, velum: 0.2 }, bolus: 0.55 },
  { t: 1.1, phase: 'oralTransit', a: { jaw: 0, lipOpen: -0.1, tongueX: -1.0, tongueY: 1.4, tongueRoot: -0.6, tipX: 0.2, tipY: 1.6, velum: 0 }, bolus: 0.38 },
  // the velum shut, the root pushes back and the larynx rises: the bolus goes down
  { t: 1.4, phase: 'pharyngeal', a: { jaw: 0, lipOpen: -0.1, tongueX: -1.2, tongueY: 1.2, tongueRoot: -1.2, tipX: 0.2, tipY: 1.5, velum: 0, larynx: 1.0 }, bolus: 0.15 },
  { t: 1.7, phase: 'pharyngeal', a: { jaw: 0, lipOpen: -0.1, tongueX: -0.6, tongueY: 0.6, tongueRoot: -0.6, tipX: 0.2, tipY: 1.2, velum: 0, larynx: 0.8 }, bolus: -0.15 },
  { t: 2.1, phase: 'pharyngeal', a: { jaw: 0.1, lipOpen: -0.05, velum: 0 }, bolus: -0.3 },
];

const INFANT: SwallowKey[] = [
  // the bolus on the tongue, teeth apart
  { t: 0.0, phase: 'oralPrep', a: { jaw: 0.3, lipOpen: -0.3, tongueY: 0.2, tipX: 0.8, tipY: 0.4, velum: 0.4 }, bolus: 0.75 },
  // lips and chin tighten, the tip goes between the incisors
  { t: 0.4, phase: 'oralPrep', a: { jaw: 0.35, lipOpen: -0.35, lipProtrude: 0.4, tongueX: 1.0, tongueY: 0.2, tipX: 1.3, tipY: 0.3, velum: 0.4 }, bolus: 0.78 },
  // the thrust: the tongue pushes forward against the teeth
  { t: 0.8, phase: 'oralTransit', a: { jaw: 0.35, lipOpen: -0.35, lipProtrude: 0.5, tongueX: 1.3, tongueY: 0.3, tipX: 1.4, tipY: 0.4, velum: 0.3 }, bolus: 0.8 },
  // then the back of the tongue lifts while the tip stays forward
  { t: 1.2, phase: 'oralTransit', a: { jaw: 0.35, lipOpen: -0.35, lipProtrude: 0.4, tongueX: -0.6, tongueY: 1.0, tipX: 1.2, tipY: 0.3, velum: 0.1 }, bolus: 0.5 },
  { t: 1.5, phase: 'oralTransit', a: { jaw: 0.3, lipOpen: -0.3, lipProtrude: 0.3, tongueX: -1.0, tongueY: 1.1, tongueRoot: -0.6, tipX: 1.2, tipY: 0.3, velum: 0 }, bolus: 0.35 },
  { t: 1.8, phase: 'pharyngeal', a: { jaw: 0.3, lipOpen: -0.3, lipProtrude: 0.3, tongueX: -1.2, tongueY: 1.0, tongueRoot: -1.2, tipX: 1.2, tipY: 0.3, velum: 0, larynx: 1.0 }, bolus: 0.15 },
  { t: 2.1, phase: 'pharyngeal', a: { jaw: 0.3, lipOpen: -0.2, lipProtrude: 0.2, tongueX: -0.6, tongueY: 0.5, tongueRoot: -0.6, tipX: 1.0, tipY: 0.3, velum: 0, larynx: 0.8 }, bolus: -0.15 },
  { t: 2.5, phase: 'pharyngeal', a: { jaw: 0.25, lipOpen: -0.05, velum: 0 }, bolus: -0.3 },
];

export const SWALLOWS: Record<SwallowId, SwallowSequence> = {
  adult: { id: 'adult', keys: ADULT, teeth: DEFAULT_TEETH },
  infant: { id: 'infant', keys: INFANT, teeth: DEFAULT_TEETH },
};

/** Length of a sequence (s): the time of its last key. */
export const swallowDuration = (seq: SwallowSequence): number => seq.keys[seq.keys.length - 1].t;

const posture = (k: SwallowKey): Articulators => ({ ...DEFAULT_ARTICULATORS, ...k.a });

/** The posture at time t (clamped to the sequence): each articulator eases from one key to the next (smoothstep, so it starts and stops without a jolt). */
export function swallowPose(seq: SwallowSequence, t: number): SwallowPose {
  const ks = seq.keys;
  let i = 0;
  while (i < ks.length - 2 && t >= ks[i + 1].t) i++;
  const k0 = ks[i], k1 = ks[i + 1];
  const u = Math.max(0, Math.min(1, (t - k0.t) / (k1.t - k0.t)));
  const e = u * u * (3 - 2 * u);
  const p0 = posture(k0), p1 = posture(k1);
  const a = { ...p0 };
  for (const key of ARTICULATOR_KEYS) {
    const [lo, hi] = ARTICULATOR_RANGES[key];
    a[key] = Math.max(lo, Math.min(hi, p0[key] + (p1[key] - p0[key]) * e));
  }
  return { a, teeth: seq.teeth, phase: u >= 1 ? k1.phase : k0.phase, bolus: k0.bolus + (k1.bolus - k0.bolus) * e };
}

/** What the swallow view highlights, from the geometry of a pose. */
export interface SwallowMarks {
  /** vertical gap between the incisor edges (cm, negative = overlapping, teeth together) */
  toothGap: number;
  /** how far the tongue tip is in front of the upper incisor edge (cm, negative = behind it) */
  tipForward: number;
  /** what the front of the tongue touches: the upper incisor (pressing on the teeth) before the palate (the ridge behind them) */
  tipContact: 'palate' | 'incisor' | null;
  /** the lips are closed */
  lipsShut: boolean;
}

/** The front of the mouth, where the tip's contact is looked for: this far behind the teeth along the centreline (canonical cm). */
const FRONT = 3.5;

/** The marks of a geometry: the tooth gap, where the tip is, what the front of the tongue touches, and whether the lips are closed. */
export function swallowMarks(g: TractGeometry): SwallowMarks {
  let palate = false, incisor = false, lipsShut = false;
  for (let i = 0; i <= g.lastRay; i++) {
    const h = g.hits[i];
    if (h.d > 0) continue;
    if (h.upId === 'upperLip' && h.lowId === 'lowerLip') lipsShut = true;
    if (h.lowId !== 'tongue' || g.s[i] < g.teethPos - FRONT * g.scale) continue;
    if (h.upId === 'upperIncisor') incisor = true;
    if (h.upId === 'palate') palate = true;
  }
  return {
    toothGap: g.slit.vertical, tipForward: g.tipPoint[0] - g.landmarks.upperEdge[0],
    tipContact: incisor ? 'incisor' : palate ? 'palate' : null, lipsShut,
  };
}
