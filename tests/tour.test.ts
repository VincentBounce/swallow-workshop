import { describe, it, expect, beforeAll, vi } from 'vitest';
import { voice } from '../src/ui/voice/voice';
import { CHAPTERS, TourAction } from '../src/ui/tour';
import { FakeSink } from './voiceFakes';
import { loadEnglishLexicon } from './helpers';

const sink = new FakeSink();

beforeAll(async () => {
  loadEnglishLexicon();
  voice.attach(sink);
  await voice.ensureAudio();
});

/** Runs an action as a reader would and lets its timers and promises finish. */
async function press(a: TourAction): Promise<void> {
  a.run();
  await vi.advanceTimersByTimeAsync(50);
}

describe('the guided tour', () => {
  it('every step leaves what you see and what the engine plays in agreement', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    try {
      for (const [ci, ch] of CHAPTERS.entries()) {
        const steps = [...ch.actions, ...(ch.experiments ?? []).flatMap((e) => e.steps)];
        for (const a of steps) {
          const before = voice.manual;
          await press(a);
          const where = `chapter ${ci}: ${a.label.en}`;
          const p = voice.lanes.performer;
          // the engine has the hands' parameters (or a program sent with them)
          const sent = sink.lastParams()!;
          if (p.kind === 'hands' || p.kind === 'glide') expect(sent.params, where).toEqual(voice.effective());
          else expect(sink.programs().at(-1)!.id, where).toBe(p.id);
          // a step that moves the head is heard: the head is the filter, or a performer plays it
          const posture = (q: typeof before) => JSON.stringify({ ...q.articulators, velum: 0 }); // the velum works with a tube too
          const moved = posture(before) !== posture(voice.manual);
          if (moved && p.kind === 'hands') expect(voice.lanes.filter.kind, where).toBe('head');
          // let the sentences (some steps speak two in a row) and glides end, as when the reader listens
          for (let k = 0; k < 4 && voice.lanes.performer.kind !== 'hands'; k++) {
            const q = voice.lanes.performer;
            if (q.kind === 'sentence' || q.kind === 'melody' || q.kind === 'clip') sink.onEnded(q.id, 'done');
            await vi.advanceTimersByTimeAsync(3000);
          }
          expect(voice.lanes.performer.kind, where).toBe('hands');
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('after a measured tube, opening the jaw is heard on the head', async () => {
    const mri = CHAPTERS.flatMap((c) => c.actions).find((a) => a.label.en === 'The measured “ee”')!;
    const jaw = CHAPTERS.flatMap((c) => c.experiments ?? []).flatMap((e) => e.steps).find((a) => a.label.en === 'Open the jaw')!;
    mri.run();
    expect(voice.lanes.filter.kind).toBe('tube');
    jaw.run();
    expect(voice.lanes.filter.kind).toBe('head');
    expect(sink.lastParams()!.params.tubeMode).toBe(false);
    expect(sink.lastParams()!.params.articulators.jaw).toBe(0.9);
  });

  it('a sentence the reader speaks is a program with its score', async () => {
    const say = CHAPTERS.flatMap((c) => c.actions).find((a) => a.label.en === 'Speak a sentence')!;
    const n = sink.programs().length;
    say.run();
    for (let i = 0; i < 20 && sink.programs().length === n; i++) await new Promise((r) => setTimeout(r, 5));
    const prog = sink.programs().at(-1)!;
    expect(prog.score?.phones.length).toBeGreaterThan(5);
    expect(voice.lock('posture')?.by).toBe('sentence');
    sink.onEnded(prog.id, 'done');
  });
});
