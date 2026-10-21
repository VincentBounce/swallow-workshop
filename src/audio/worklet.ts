/**
 * AudioWorklet processor: runs the voice engine on the audio thread.
 *
 * Messages in:  { type: 'params', params } | { type: 'score', score } |
 *               { type: 'stop' } | { type: 'snap' }
 * Messages out: { type: 'telemetry', telemetry } (about 60 per second) and
 *               { type: 'stream', out, flow, noise } (blocks of STREAM samples)
 */
import { VoiceEngine } from '../dsp/engine/engine';
import type { EngineParams, Score } from '../dsp/engine/params';

// Minimal declarations of the AudioWorkletGlobalScope (not in lib.dom).
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

type InMsg =
  | { type: 'params'; params: EngineParams }
  | { type: 'score'; score: Score }
  | { type: 'stop' }
  | { type: 'snap' };

const STREAM = 1024;
const TELEMETRY_BLOCKS = 6; // 6 x 128 samples = 16 ms at 48 kHz

class VoiceProcessor extends AudioWorkletProcessor {
  private engine: VoiceEngine;
  private blocks = 0;
  private started = false;

  constructor() {
    super();
    this.engine = new VoiceEngine(sampleRate);
    this.newStreams();
    this.port.onmessage = (e: MessageEvent<InMsg>) => this.onMessage(e.data);
  }

  private newStreams(): void {
    this.engine.streams = { out: new Float32Array(STREAM), flow: new Float32Array(STREAM), noise: new Float32Array(STREAM) };
    this.engine.streamPos = 0;
  }

  private onMessage(m: InMsg): void {
    switch (m.type) {
      case 'params':
        this.engine.setParams(m.params);
        if (!this.started) { this.engine.snapArticulators(); this.started = true; }
        break;
      case 'score': this.engine.playScore(m.score); break;
      case 'stop': this.engine.stopScore(); break;
      case 'snap': this.engine.snapArticulators(); break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const ch0 = out[0];
    this.engine.process(ch0, ch0.length);
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    const st = this.engine.streams;
    if (st && this.engine.streamPos >= STREAM) {
      this.port.postMessage({ type: 'stream', out: st.out, flow: st.flow, noise: st.noise }, [st.out.buffer, st.flow.buffer, st.noise.buffer]);
      this.newStreams();
    }
    if (++this.blocks >= TELEMETRY_BLOCKS) {
      this.blocks = 0;
      this.port.postMessage({ type: 'telemetry', telemetry: this.engine.telemetry() });
    }
    return true;
  }
}

registerProcessor('voice-processor', VoiceProcessor);
