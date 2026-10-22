import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceController } from '../src/ui/voice/voice';
import { controlOf, leafPaths } from '../src/ui/voice/controls';
import { VoiceEngine } from '../src/dsp/engine/engine';
import { defaultParams, Score } from '../src/dsp/engine/params';
import { contourScore } from '../src/ui/presets';
import { buildScore } from '../src/dsp/speech/sequencer';
import { textToPhones } from '../src/dsp/speech/g2p';
import { FakeSink, FakeClock, settle } from './voiceFakes';

const L = { it: 'prova', en: 'test' };
const sentence = (): Score => buildScore(textToPhones('papà', 'it'), { lang: 'it' });

/** Telemetry of a real engine, with the posture and pitch we want the controller to see. */
function telemetryAt(jaw: number, f0: number) {
  const t = new VoiceEngine(48000, defaultParams()).telemetry();
  return { ...t, articulators: { ...t.articulators, jaw }, f0Target: f0 };
}

describe('the voice controller', () => {
  let sink: FakeSink, clock: FakeClock, v: VoiceController;
  beforeEach(async () => {
    sink = new FakeSink(); clock = new FakeClock();
    v = new VoiceController(clock);
    v.attach(sink);
    await v.ensureAudio();
  });

  it('maps every parameter to one control', () => {
    const missing = leafPaths(defaultParams()).filter((p) => controlOf(p) === null);
    expect(missing).toEqual([]);
  });

  it('sends every edit of the hands to the engine', () => {
    expect(v.edit((p) => { p.articulators.jaw = 0.3; })).toBe(true);
    expect(sink.lastParams()!.params.articulators.jaw).toBe(0.3);
    expect(sink.lastParams()!.program).toBe(0);
  });

  it('locks the tract while a sentence speaks, and takes over on request', async () => {
    void v.speak(sentence(), L);
    await settle();
    const prog = sink.programs()[0];
    expect(prog.score).toBeDefined();
    expect(v.lock('posture')?.by).toBe('sentence');
    expect(v.lock('pitch')?.by).toBe('sentence');
    expect(v.lock('volume')).toBeNull();
    const jaw = v.manual.articulators.jaw;
    expect(v.edit((p) => { p.articulators.jaw = 0.9; })).toBe(false);
    expect(v.manual.articulators.jaw).toBe(jaw);
    expect(v.edit((p) => { p.volume = -6; })).toBe(true);
    expect(sink.lastParams()!.program).toBe(prog.id);
    // taking over keeps the posture and pitch that were sounding
    sink.onTelemetry(telemetryAt(0.62, 171), prog.id);
    expect(v.edit((p) => { p.articulators.tongueX = 0.5; }, { takeOver: true })).toBe(true);
    expect(sink.stops()).toContain(prog.id);
    expect(v.lanes.performer.kind).toBe('hands');
    expect(v.manual.articulators.jaw).toBeCloseTo(0.62);
    expect(v.manual.articulators.tongueX).toBe(0.5);
    expect(v.manual.source.f0).toBeCloseTo(171);
    // the stop reached the engine before the new parameters
    const iStop = sink.sent.findIndex((m) => m.type === 'stop');
    expect(sink.sent.slice(iStop).some((m) => m.type === 'params' && m.program === 0)).toBe(true);
  });

  it('returns to the hands, with the lungs off, when a sentence ends', async () => {
    v.edit((p) => { p.phonate = true; });
    const done = v.speak(sentence(), L);
    await settle();
    const id = sink.programs()[0].id;
    expect(sink.programs()[0].after.phonate).toBe(false);
    sink.onEnded(id + 99, 'done'); // someone else's end changes nothing
    expect(v.lanes.performer.kind).toBe('sentence');
    sink.onEnded(id, 'done');
    expect(await done).toBe('done');
    expect(v.lanes.performer.kind).toBe('hands');
    expect(v.manual.phonate).toBe(false);
    expect(v.lock('posture')).toBeNull();
  });

  it('a melody leaves the tract to the hands and plays the buzz alone without a timer', async () => {
    const score = contourScore([{ t: 0, f0: 120 }, { t: 1, f0: 180 }], 8);
    expect(score.frames[0].art).toBeUndefined();
    void v.sing(score, { buzz: true, label: L });
    await settle();
    expect(v.effective().bypassTract).toBe(true);
    expect(v.manual.bypassTract).toBe(false);
    expect(v.lock('posture')).toBeNull();
    expect(v.lock('pitch')?.by).toBe('melody');
    expect(v.edit((p) => { p.articulators.jaw = 0.8; })).toBe(true);
    expect(sink.lastParams()!.params.articulators.jaw).toBe(0.8);
    expect(sink.lastParams()!.params.bypassTract).toBe(true);
    expect(sink.lastParams()!.after.bypassTract).toBe(false);
    sink.onEnded(sink.programs()[0].id, 'done');
    expect(v.effective().bypassTract).toBe(false);
  });

  it('a tube locks the head until the head is the filter again', () => {
    v.loadTube([3, 1, 0.5, 4], 17, { it: 'tubo', en: 'tube' });
    expect(v.lanes.filter.kind).toBe('tube');
    expect(v.manual.tubeMode).toBe(true);
    expect(v.lock('posture')?.by).toBe('tube');
    expect(v.lock('velum')).toBeNull();
    expect(v.edit((p) => { p.articulators.jaw = 0.9; })).toBe(false);
    // choosing a vowel is an explicit act: back to the head
    expect(v.holdPhoneme('i')).toBe(true);
    expect(v.lanes.filter.kind).toBe('head');
    expect(sink.lastParams()!.params.tubeMode).toBe(false);
  });

  it('no filter locks the tract and the nose', () => {
    expect(v.setFilter('bypass')).toBe(true);
    expect(v.lock('posture')?.by).toBe('bypass');
    expect(v.lock('nose')?.by).toBe('bypass');
    expect(v.lock('pitch')).toBeNull();
    expect(v.setFilter('head')).toBe(true);
    expect(v.lock('posture')).toBeNull();
  });

  it('glides the pitch and keeps the end value', async () => {
    const done = v.glide(100, 200, 1, L);
    expect(v.lock('pitch')?.by).toBe('glide');
    expect(v.edit((p) => { p.source.f0 = 300; })).toBe(false);
    clock.advance(500);
    expect(v.manual.source.f0).toBeGreaterThan(130);
    expect(v.manual.source.f0).toBeLessThan(160);
    clock.advance(600);
    expect(await done).toBe('done');
    expect(v.manual.source.f0).toBeCloseTo(200);
    expect(v.lock('pitch')).toBeNull();
  });

  it('a clip owns everything but the volume and hands back the samples heard', async () => {
    const p = defaultParams(); p.phonate = true; p.anatomy.scale = 0.74;
    const r = v.playClip(p, 1.5, L);
    await settle();
    const prog = sink.programs()[0];
    expect(prog.seconds).toBe(1.5);
    expect(prog.capture).toBe(true);
    expect(prog.params.anatomy.scale).toBe(0.74);
    expect(v.sounding().anatomy.scale).toBe(0.74);
    expect(v.lock('noise')?.by).toBe('clip');
    expect(v.lock('volume')).toBeNull();
    sink.onEnded(prog.id, 'done', new Float32Array(72000));
    const res = await r;
    expect(res.result).toBe('done');
    expect(res.samples?.length).toBe(72000);
    expect(v.sounding().anatomy.scale).toBe(1);
  });

  it('a new performance replaces the old one, whose promise says stopped', async () => {
    const first = v.speak(sentence(), L);
    await settle();
    void v.speak(sentence(), L);
    await settle();
    expect(await first).toBe('stopped');
    const [a, b] = sink.programs();
    expect(sink.stops()).toContain(a.id);
    sink.onEnded(a.id, 'replaced');
    expect(v.lanes.performer.kind === 'sentence' && v.lanes.performer.id).toBe(b.id);
  });

  it('shows what sounds: telemetry while it is fresh, the hands otherwise', () => {
    v.edit((p) => { p.articulators.jaw = 0.2; });
    sink.onTelemetry(telemetryAt(0.5, 140), 0);
    expect(v.sounding().articulators.jaw).toBe(0.5);
    clock.advance(1000);
    expect(v.sounding().articulators.jaw).toBe(0.2);
  });

  it('the Sound button stops everything and lets the audio sleep', async () => {
    await v.setSound(true);
    expect(v.manual.phonate).toBe(true);
    expect(v.soundOn).toBe(true);
    void v.speak(sentence(), L);
    await settle();
    await v.setSound(false);
    expect(v.lanes.performer.kind).toBe('hands');
    expect(v.manual.phonate).toBe(false);
    clock.advance(400);
    expect(sink.suspends).toBe(1);
    expect(v.soundOn).toBe(false);
  });
});
