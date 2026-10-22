/**
 * AudioWorklet processor: runs the voice on the audio thread. All the logic
 * (the messages, the programs, the analysis streams) lives in ProgramRunner.
 */
import { ProgramRunner, RunnerIn } from './programRunner';

// Minimal declarations of the AudioWorkletGlobalScope (not in lib.dom).
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

class VoiceProcessor extends AudioWorkletProcessor {
  private runner: ProgramRunner;

  constructor() {
    super();
    this.runner = new ProgramRunner(sampleRate, (m, transfer) => this.port.postMessage(m, transfer ?? []));
    this.port.onmessage = (e: MessageEvent<RunnerIn>) => this.runner.handle(e.data);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const ch0 = out[0];
    this.runner.process(ch0);
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    return true;
  }
}

registerProcessor('voice-processor', VoiceProcessor);
