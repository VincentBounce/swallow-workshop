/**
 * The audio-thread side of the voice: one engine, fed by the parameters of
 * the hands or by one program at a time (a sentence, a melody, a clip).
 * It runs inside the AudioWorklet and, unchanged, in Node for the tests.
 *
 * Messages in:
 *   { type: 'params', params, after, program } the parameters to sound now
 *       (`params`) and once the running program is over (`after`, the
 *       hands); `program` is the id the sender believes is running, so that
 *       parameters meant for a program that has already ended fall back to
 *       `after`
 *   { type: 'program', program } starts a program, replacing the running one
 *   { type: 'stop', id }         stops that program (ignored if it is over)
 * Messages out:
 *   { type: 'telemetry', telemetry, program } about 60 per second
 *   { type: 'stream', out, flow, noise }      blocks of STREAM samples
 *   { type: 'ended', id, reason, captured? }  once per program
 */
import { VoiceEngine, Telemetry } from '../dsp/engine/engine';
import type { EngineParams, Score } from '../dsp/engine/params';

/** A performance run by the engine; while it plays the hands only reach what it leaves free. */
export interface Program {
  id: number;
  /** parameters while the program plays */
  params: EngineParams;
  /** parameters the engine returns to when the program ends on its own */
  after: EngineParams;
  /** a score (sentence or melody): the program ends with it */
  score?: Score;
  /** samples heard instead of the engine's voice, at the engine's rate (the engine runs on, silent) */
  samples?: Float32Array;
  /** glottal flow shown with the samples */
  flow?: Float32Array;
  /** a hold of `params` for this long, s */
  seconds?: number;
  /** jump the articulators to the program's posture (a short fade hides the jump) */
  snap?: boolean;
  /** send back the samples heard */
  capture?: boolean;
}

export type EndReason = 'done' | 'stopped' | 'replaced';

export type RunnerIn =
  | { type: 'params'; params: EngineParams; after: EngineParams; program: number }
  | { type: 'program'; program: Program }
  | { type: 'stop'; id: number };

export type RunnerOut =
  | { type: 'telemetry'; telemetry: Telemetry; program: number }
  | { type: 'stream'; out: Float32Array; flow: Float32Array; noise: Float32Array }
  | { type: 'ended'; id: number; reason: EndReason; captured?: Float32Array };

export const STREAM = 1024;
const TELEMETRY_BLOCKS = 6; // 6 x 128 samples = 16 ms at 48 kHz
/** fade over a jump of the posture or a switch to samples, s */
const FADE = 0.005;

export class ProgramRunner {
  readonly engine: VoiceEngine;
  private prog: Program | null = null;
  /** a program waiting for the fade-out before it starts */
  private queued: Program | null = null;
  private pos = 0;
  private length = 0;
  private captured: Float32Array | null = null;
  private gain = 1;
  private gainTarget = 1;
  private readonly gainStep: number;
  private started = false;
  private blocks = 0;

  constructor(readonly fs: number, private readonly post: (m: RunnerOut, transfer?: Transferable[]) => void) {
    this.engine = new VoiceEngine(fs);
    this.gainStep = 1 / Math.max(1, FADE * fs);
    this.newStreams();
  }

  /** id of the program playing (0 = the hands) */
  get playing(): number { return this.prog?.id ?? 0; }

  private newStreams(): void {
    this.engine.streams = { out: new Float32Array(STREAM), flow: new Float32Array(STREAM), noise: new Float32Array(STREAM) };
    this.engine.streamPos = 0;
  }

  handle(m: RunnerIn): void {
    switch (m.type) {
      case 'params': {
        const p = this.prog ?? this.queued;
        if (p) {
          p.after = m.after;
          if (m.program === p.id) {
            p.params = m.params;
            if (p === this.prog) this.engine.setParams(m.params);
          }
        } else this.engine.setParams(m.after);
        if (!this.started) { this.engine.snapArticulators(); this.started = true; }
        break;
      }
      case 'program': {
        const p = m.program;
        if (this.prog) this.end('replaced');
        if (this.queued) { this.post({ type: 'ended', id: this.queued.id, reason: 'replaced' }); this.queued = null; }
        if ((p.snap || p.samples) && this.started && this.gain > 0) {
          this.queued = p;
          this.gainTarget = 0;
        } else this.begin(p);
        break;
      }
      case 'stop':
        if (this.prog?.id === m.id) this.end('stopped');
        else if (this.queued?.id === m.id) {
          this.post({ type: 'ended', id: m.id, reason: 'stopped' });
          this.queued = null;
          this.gainTarget = 1;
        }
        break;
    }
  }

  private begin(p: Program): void {
    this.prog = p;
    this.pos = 0;
    this.engine.setParams(p.params);
    if (p.snap || !this.started) { this.engine.snapArticulators(); this.started = true; }
    if (p.score) this.engine.playScore(p.score);
    this.length = p.samples ? p.samples.length : p.seconds ? Math.round(p.seconds * this.fs) : 0;
    const cap = this.length || (p.score ? Math.ceil((p.score.duration + 0.5) * this.fs) : 0);
    this.captured = p.capture && cap > 0 ? new Float32Array(cap) : null;
    this.gainTarget = 1;
  }

  private end(reason: EndReason): void {
    const p = this.prog;
    if (!p) return;
    if (p.score && this.engine.isPlaying) this.engine.stopScore();
    this.engine.setParams(p.after);
    this.prog = null;
    const cap = this.captured;
    this.captured = null;
    if (cap) {
      const c = cap.slice(0, Math.min(cap.length, this.pos));
      this.post({ type: 'ended', id: p.id, reason, captured: c }, [c.buffer]);
    } else this.post({ type: 'ended', id: p.id, reason });
  }

  /** Renders one block (mono) and posts the analysis streams and the telemetry. */
  process(out: Float32Array): void {
    const n = out.length;
    const st = this.engine.streams!;
    const k0 = this.engine.streamPos;
    this.engine.process(out, n);
    const written = this.engine.streamPos - k0;
    const p = this.prog;
    if (p?.samples) {
      const g = Math.pow(10, this.engine.params.volume / 20);
      const s = p.samples, fl = p.flow;
      for (let i = 0; i < n; i++) {
        const j = this.pos + i;
        out[i] = j < s.length ? s[j] * g : 0;
      }
      for (let i = 0; i < written; i++) {
        const j = this.pos + i;
        st.out[k0 + i] = out[i];
        st.flow[k0 + i] = fl && j < fl.length ? fl[j] : 0;
        st.noise[k0 + i] = 0;
      }
    }
    // fades: out before a jump, back in after it
    if (this.gain !== 1 || this.gainTarget !== 1) {
      for (let i = 0; i < n; i++) {
        if (this.gain < this.gainTarget) this.gain = Math.min(this.gainTarget, this.gain + this.gainStep);
        else if (this.gain > this.gainTarget) this.gain = Math.max(this.gainTarget, this.gain - this.gainStep);
        out[i] *= this.gain;
        if (i < written) st.out[k0 + i] = out[i];
      }
    }
    if (p) {
      const cap = this.captured;
      if (cap) for (let i = 0; i < n && this.pos + i < cap.length; i++) cap[this.pos + i] = out[i];
      this.pos += n;
      if (p.score ? !this.engine.isPlaying : this.length > 0 && this.pos >= this.length) this.end('done');
    }
    if (this.queued && this.gain === 0) {
      const q = this.queued;
      this.queued = null;
      this.begin(q);
    }
    if (this.engine.streamPos >= STREAM) {
      this.post({ type: 'stream', out: st.out, flow: st.flow, noise: st.noise }, [st.out.buffer, st.flow.buffer, st.noise.buffer]);
      this.newStreams();
    }
    if (++this.blocks >= TELEMETRY_BLOCKS) {
      this.blocks = 0;
      this.post({ type: 'telemetry', telemetry: this.engine.telemetry(), program: this.playing });
    }
  }
}
