import { describe, expect, it } from 'vitest';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { ARTICULATOR_KEYS, ARTICULATOR_RANGES, DEFAULT_ANATOMY } from '../src/dsp/tract/types';
import { SWALLOWS, SWALLOW_PHASES, bolusPoint, swallowDuration, swallowMarks, swallowPose, SwallowSequence } from '../src/dsp/swallow/sequence';

const marksAt = (seq: SwallowSequence, t: number) => {
  const p = swallowPose(seq, t);
  return { ...swallowMarks(computeGeometry(p.a, DEFAULT_ANATOMY, p.teeth)), phase: p.phase, bolus: p.bolus };
};
/** When the swallow itself starts, after the rest (s). */
const start = (seq: SwallowSequence) => seq.keys.find((k) => k.phase === 'oralPrep')!.t;
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
      it('goes from rest through the three stages in order and back to rest, and the bolus only moves back and down', () => {
        const seen = times(seq).map((t) => swallowPose(seq, t).phase);
        expect([...new Set(seen)]).toEqual(SWALLOW_PHASES);
        expect(seen[0]).toBe('rest');
        expect(seen[seen.length - 1]).toBe('rest');
        // from the end of the oral preparation the bolus never comes forward again
        const from = seq.keys.find((k) => k.phase === 'oralTransit')!.t;
        let last = Infinity;
        for (const t of times(seq).filter((t) => t >= from)) { const b = swallowPose(seq, t).bolus; expect(b).toBeLessThanOrEqual(last + 1e-9); last = b; }
        expect(last).toBeLessThan(0);
      });
      it('keeps the lips closed while the bolus is in the mouth', () => {
        for (const t of times(seq)) { const m = marksAt(seq, t); if (m.phase !== 'rest' && m.bolus > 0.3) expect(m.lipsShut, `t ${t}`).toBe(true); }
      });
      it('holds each key at its time', () => {
        for (const k of seq.keys) for (const [n, v] of Object.entries(k.a)) expect(swallowPose(seq, k.t).a[n as keyof typeof k.a]).toBeCloseTo(v as number, 9);
      });
    });
  }

  it('adult: teeth together and the tip on the ridge behind the upper incisors, through the oral transit', () => {
    const seq = SWALLOWS.adult;
    for (const t of times(seq).filter((t) => t >= start(seq) + 0.4 && t <= start(seq) + 1.7)) {
      const m = marksAt(seq, t);
      expect(m.toothGap, `t ${t}`).toBeLessThan(0);
      expect(m.tipContact, `t ${t}`).toBe('palate');
      expect(m.tipForward, `t ${t}`).toBeLessThan(-0.4);
    }
  });

  it('infant: teeth apart and the tip between or against the incisors, pushing on them in the thrust', () => {
    const seq = SWALLOWS.infant;
    for (const t of times(seq).filter((t) => t >= start(seq) + 0.4 && t <= start(seq) + 1.8)) {
      const m = marksAt(seq, t);
      expect(m.toothGap, `t ${t}`).toBeGreaterThan(0.2);
      expect(m.tipForward, `t ${t}`).toBeGreaterThan(-0.1);
      expect(m.tipContact, `t ${t}`).not.toBe('palate');
    }
    expect(marksAt(seq, start(seq) + 0.8).tipContact).toBe('incisor');
  });

  it('adult rest: tip on the palate behind the incisors, lips closed, teeth a little apart', () => {
    const m = marksAt(SWALLOWS.adult, 0);
    expect(m.phase).toBe('rest');
    expect(m.tipContact).toBe('palate');
    expect(m.tipForward).toBeLessThan(-0.4);
    expect(m.lipsShut).toBe(true);
    expect(m.toothGap).toBeGreaterThan(0.05);
    expect(m.toothGap).toBeLessThan(0.3);
  });

  it('infantile rest: tongue low on the lower incisors, off the palate, mouth open', () => {
    const seq = SWALLOWS.infant;
    const p = swallowPose(seq, 0);
    const g = computeGeometry(p.a, DEFAULT_ANATOMY, p.teeth);
    const m = swallowMarks(g);
    expect(m.tipContact).toBe(null);
    expect(m.lipsShut).toBe(false);
    expect(m.toothGap).toBeGreaterThan(0.2);
    // the tip lies below the lower incisor's edge, in front of it
    expect(g.tipPoint[1]).toBeLessThan(g.landmarks.lowerEdge[1]);
    expect(g.tipPoint[0]).toBeGreaterThan(g.landmarks.lowerEdge[0]);
  });

  it('the bolus path runs without a jump from the lips down past the glottis, along the back wall low in the throat', () => {
    for (const seq of Object.values(SWALLOWS)) for (const t of times(seq)) {
      const p = swallowPose(seq, t);
      const g = computeGeometry(p.a, DEFAULT_ANATOMY, p.teeth);
      let last: { x: number; y: number } | null = null;
      for (let b = 1; b >= -0.3; b -= 0.01) {
        const q = bolusPoint(g, b);
        if (last) expect(Math.hypot(q.x - last.x, q.y - last.y), `${seq.id} t ${t} b ${b.toFixed(2)}`).toBeLessThan(0.6);
        last = q;
      }
      expect(bolusPoint(g, -0.2).y).toBeLessThan(g.landmarks.glottis[1] - 2);
      // in the lower pharynx the bolus is behind the middle of the passage (toward the back wall, smaller x)
      const mid = g.hits[Math.round(g.lastRay * 0.12)];
      const q = bolusPoint(g, g.s[Math.round(g.lastRay * 0.12)] / g.length);
      expect(q.x).toBeLessThan(mid.mx);
    }
  });
});

