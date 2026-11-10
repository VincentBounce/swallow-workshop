import { describe, expect, it } from 'vitest';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { ARTICULATOR_KEYS, ARTICULATOR_RANGES, DEFAULT_ANATOMY } from '../src/dsp/tract/types';
import { SWALLOWS, SWALLOW_PHASES, swallowDuration, swallowMarks, swallowPose, SwallowSequence } from '../src/dsp/swallow/sequence';

const marksAt = (seq: SwallowSequence, t: number) => {
  const p = swallowPose(seq, t);
  return { ...swallowMarks(computeGeometry(p.a, DEFAULT_ANATOMY, p.teeth)), phase: p.phase, bolus: p.bolus };
};
/** Instants every 50 ms over the sequence. */
const times = (seq: SwallowSequence) => Array.from({ length: Math.floor(swallowDuration(seq) / 0.05) + 1 }, (_, i) => i * 0.05);

describe('swallow sequences', () => {
  for (const seq of Object.values(SWALLOWS)) {
    describe(seq.id, () => {
      it('keys are in time order and every articulator stays in its range', () => {
        for (let i = 1; i < seq.keys.length; i++) expect(seq.keys[i].t).toBeGreaterThan(seq.keys[i - 1].t);
        for (const t of times(seq)) {
          const { a } = swallowPose(seq, t);
          for (const k of ARTICULATOR_KEYS) {
            expect(a[k]).toBeGreaterThanOrEqual(ARTICULATOR_RANGES[k][0]);
            expect(a[k]).toBeLessThanOrEqual(ARTICULATOR_RANGES[k][1]);
          }
        }
      });
      it('goes through the three stages in order, and the bolus only moves back and down', () => {
        const seen = times(seq).map((t) => swallowPose(seq, t).phase);
        expect([...new Set(seen)]).toEqual(SWALLOW_PHASES);
        // from the end of the oral preparation the bolus never comes forward again
        const from = seq.keys.find((k) => k.phase === 'oralTransit')!.t;
        let last = Infinity;
        for (const t of times(seq).filter((t) => t >= from)) { const b = swallowPose(seq, t).bolus; expect(b).toBeLessThanOrEqual(last + 1e-9); last = b; }
        expect(last).toBeLessThan(0);
      });
      it('keeps the lips closed while the bolus is in the mouth', () => {
        for (const t of times(seq)) { const m = marksAt(seq, t); if (m.bolus > 0.3) expect(m.lipsShut, `t ${t}`).toBe(true); }
      });
      it('holds each key at its time', () => {
        for (const k of seq.keys) for (const [n, v] of Object.entries(k.a)) expect(swallowPose(seq, k.t).a[n as keyof typeof k.a]).toBeCloseTo(v as number, 9);
      });
    });
  }

  it('adult: teeth together and the tip on the ridge behind the upper incisors, through the oral transit', () => {
    const seq = SWALLOWS.adult;
    for (const t of times(seq).filter((t) => t >= 0.4 && t <= 1.7)) {
      const m = marksAt(seq, t);
      expect(m.toothGap, `t ${t}`).toBeLessThan(0);
      expect(m.tipContact, `t ${t}`).toBe('palate');
      expect(m.tipForward, `t ${t}`).toBeLessThan(-0.4);
    }
  });

  it('infant: teeth apart and the tip between or against the incisors, pushing on them in the thrust', () => {
    const seq = SWALLOWS.infant;
    for (const t of times(seq).filter((t) => t >= 0.4 && t <= 1.8)) {
      const m = marksAt(seq, t);
      expect(m.toothGap, `t ${t}`).toBeGreaterThan(0.2);
      expect(m.tipForward, `t ${t}`).toBeGreaterThan(-0.1);
      expect(m.tipContact, `t ${t}`).not.toBe('palate');
    }
    expect(marksAt(seq, 0.8).tipContact).toBe('incisor');
  });
});
