import type { Telemetry } from '../src/dsp/engine/engine';
import type { EngineParams } from '../src/dsp/engine/params';
import type { VoiceSink, StreamBlock, Program, EndReason } from '../src/ui/voice/sink';
import type { Clock } from '../src/ui/voice/voice';

export type SinkMsg =
  | { type: 'params'; params: EngineParams; after: EngineParams; program: number }
  | { type: 'program'; program: Program }
  | { type: 'stop'; id: number };

/** A sink that records what the controller sends, in order. */
export class FakeSink implements VoiceSink {
  running = false;
  readonly sampleRate = 48000;
  sent: SinkMsg[] = [];
  starts = 0;
  suspends = 0;
  micAnalyser: AnalyserNode | null = null;
  onTelemetry: (t: Telemetry, program: number) => void = () => {};
  onStream: (s: StreamBlock) => void = () => {};
  onEnded: (id: number, reason: EndReason, captured?: Float32Array) => void = () => {};
  onState: (running: boolean) => void = () => {};

  async start(): Promise<void> { this.starts++; this.running = true; this.onState(true); }
  async suspend(): Promise<void> { this.suspends++; this.running = false; this.onState(false); }
  params(params: EngineParams, after: EngineParams, program: number): void { this.sent.push({ type: 'params', params, after, program }); }
  program(p: Program): void { this.sent.push({ type: 'program', program: p }); }
  stop(id: number): void { this.sent.push({ type: 'stop', id }); }
  async enableMic(): Promise<AnalyserNode> { throw new Error('no microphone in the tests'); }
  disableMic(): void {}

  lastParams(): Extract<SinkMsg, { type: 'params' }> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) { const m = this.sent[i]; if (m.type === 'params') return m; }
    return undefined;
  }
  programs(): Program[] { return this.sent.filter((m): m is Extract<SinkMsg, { type: 'program' }> => m.type === 'program').map((m) => m.program); }
  stops(): number[] { return this.sent.filter((m): m is Extract<SinkMsg, { type: 'stop' }> => m.type === 'stop').map((m) => m.id); }
}

/** A clock moved by hand. */
export class FakeClock implements Clock {
  t = 0;
  private timers: { at: number; every: number; fn: () => void; alive: boolean }[] = [];
  now(): number { return this.t; }
  every(ms: number, fn: () => void): () => void { const x = { at: this.t + ms, every: ms, fn, alive: true }; this.timers.push(x); return () => { x.alive = false; }; }
  after(ms: number, fn: () => void): () => void { const x = { at: this.t + ms, every: 0, fn, alive: true }; this.timers.push(x); return () => { x.alive = false; }; }
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.alive && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.t = due.at;
      if (due.every) due.at += due.every; else due.alive = false;
      due.fn();
    }
    this.t = end;
    this.timers = this.timers.filter((x) => x.alive);
  }
}

/** Lets pending promises (the controller's awaits) run. */
export const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
