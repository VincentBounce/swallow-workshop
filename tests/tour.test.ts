import { describe, it, expect, beforeAll, vi } from 'vitest';
import { voice, BREATH_MS } from '../src/ui/voice/voice';
import { LESSONS, TourAction, openStep } from '../src/ui/tour';
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

const tries = () => LESSONS.flatMap((l) => l.steps.flatMap((s) => s.try ?? []));

describe('the guided lessons', () => {
  it('are short steps: one idea, a few sounds', () => {
    for (const [li, l] of LESSONS.entries()) {
      expect(l.steps.length, `lesson ${li}`).toBeLessThanOrEqual(7);
      for (const s of l.steps) {
        for (const lang of ['it', 'en'] as const) expect(s.text[lang].length, `${li}: ${s.text.en}`).toBeLessThanOrEqual(220);
        expect((s.try ?? []).length, `${li}: ${s.text.en}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('every step opens in silence, and every sound of it is heard as you see it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    try {
      for (const [li, l] of LESSONS.entries()) {
        for (const [si, s] of l.steps.entries()) {
          voice.holdPhoneme('a');
          openStep(s);
          const at = `lesson ${li} step ${si}`;
          // nothing sounds until the reader asks
          expect(voice.lanes.performer.kind, at).toBe('hands');
          expect(voice.manual.phonate, at).toBe(false);
          for (const a of s.try ?? []) {
            const before = voice.manual;
            await press(a);
            const where = `${at}: ${a.label.en}`;
            const p = voice.lanes.performer;
            // it sounds: the lungs blow, or a performer plays
            expect(voice.soundOn, where).toBe(true);
            // the engine has the hands' parameters (or a program sent with them)
            const sent = sink.lastParams()!;
            if (p.kind === 'hands' || p.kind === 'glide') expect(sent.params, where).toEqual(voice.effective());
            else expect(sink.programs().at(-1)!.id, where).toBe(p.id);
            // a sound that moves the head is heard: the head is the filter, or a performer plays it
            const posture = (q: typeof before) => JSON.stringify({ ...q.articulators, velum: 0 }); // the velum works with a tube too
            if (posture(before) !== posture(voice.manual) && p.kind === 'hands') expect(voice.lanes.filter.kind, where).toBe('head');
            // let the sentences (some speak two in a row) and glides end, as when the reader listens
            for (let k = 0; k < 4 && voice.lanes.performer.kind !== 'hands'; k++) {
              const q = voice.lanes.performer;
              if (q.kind === 'sentence' || q.kind === 'melody' || q.kind === 'clip') sink.onEnded(q.id, 'done');
              await vi.advanceTimersByTimeAsync(3000);
            }
            expect(voice.lanes.performer.kind, where).toBe('hands');
          }
          // and then it rests: nothing drones on (a breath after the last change, which may come a moment later)
          await vi.advanceTimersByTimeAsync(BREATH_MS + 1000);
          expect(voice.soundOn, `${at}, a breath later`).toBe(false);
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('after a measured tube, opening the jaw is heard on the head', async () => {
    const mri = tries().find((a) => a.label.en === 'The measured “ee”')!;
    const jaw = tries().find((a) => a.label.en === 'Jaw open')!;
    mri.run();
    expect(voice.lanes.filter.kind).toBe('tube');
    jaw.run();
    expect(voice.lanes.filter.kind).toBe('head');
    expect(sink.lastParams()!.params.tubeMode).toBe(false);
    expect(sink.lastParams()!.params.articulators.jaw).toBe(0.9);
  });

  it('a sentence the reader speaks is a program with its score', async () => {
    const say = tries().find((a) => a.label.en === 'Speak a sentence')!;
    const n = sink.programs().length;
    say.run();
    for (let i = 0; i < 20 && sink.programs().length === n; i++) await new Promise((r) => setTimeout(r, 5));
    const prog = sink.programs().at(-1)!;
    expect(prog.score?.phones.length).toBeGreaterThan(5);
    expect(voice.lock('posture')?.by).toBe('sentence');
    sink.onEnded(prog.id, 'done');
  });
});
