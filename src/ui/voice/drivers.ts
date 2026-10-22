import type { Score } from '../../dsp/engine/params';
import { ControlId, CONTROL_IDS } from './controls';

export type Bi = { it: string; en: string };

/** What filters the sources: the head, a tube (drawn or measured), or nothing. */
export type Filter =
  | { kind: 'head' }
  | { kind: 'tube'; label: Bi }
  | { kind: 'bypass' };

/** Who plays the voice: the hands, or a performance that owns some controls while it lasts. */
export type Performer =
  | { kind: 'hands' }
  | { kind: 'sentence'; id: number; label: Bi; score: Score }
  | { kind: 'melody'; id: number; label: Bi; score: Score; buzz: boolean }
  | { kind: 'glide'; id: number; label: Bi }
  | { kind: 'clip'; id: number; label: Bi; samples: boolean };

export interface Lanes { filter: Filter; performer: Performer }

export type LockOwner = 'sentence' | 'melody' | 'glide' | 'clip' | 'tube' | 'bypass';
export interface Lock { by: LockOwner; label: Bi }

const ALL_BUT_VOLUME = CONTROL_IDS.filter((c) => c !== 'volume');

/** Controls a performer owns while it plays. */
export function performerLocks(p: Performer): ControlId[] {
  switch (p.kind) {
    case 'hands': return [];
    // a sentence moves the whole tract and the larynx, on the head
    case 'sentence': return ['posture', 'velum', 'pitch', 'lungs', 'glottis', 'filter'];
    // a melody leaves the tract to the hands: move the jaw while it sings
    case 'melody': return p.buzz ? ['pitch', 'lungs', 'glottis', 'filter'] : ['pitch', 'lungs', 'glottis'];
    case 'glide': return ['pitch'];
    case 'clip': return ALL_BUT_VOLUME;
  }
}

/** Controls a filter leaves without effect (the velum and the nose still work with a tube). */
export function filterLocks(f: Filter): ControlId[] {
  switch (f.kind) {
    case 'head': return [];
    case 'tube': return ['posture', 'teeth', 'body'];
    case 'bypass': return ['posture', 'velum', 'teeth', 'body', 'nose'];
  }
}

/** Who owns a control, if anyone but the hands; performers come before the filter. */
export function lockOf(l: Lanes, c: ControlId): Lock | null {
  const p = l.performer;
  if (p.kind !== 'hands' && performerLocks(p).includes(c)) return { by: p.kind, label: p.label };
  const f = l.filter;
  if (filterLocks(f).includes(c)) return f.kind === 'tube' ? { by: 'tube', label: f.label } : { by: 'bypass', label: { it: 'nessun filtro', en: 'no filter' } };
  return null;
}
