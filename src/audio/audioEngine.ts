import workletUrl from './worklet.ts?worker&url';
import type { Telemetry } from '../dsp/engine/engine';
import type { EngineParams, Score } from '../dsp/engine/params';

export interface StreamBlock { out: Float32Array; flow: Float32Array; noise: Float32Array }

/**
 * Main-thread side of the audio engine: owns the AudioContext, the worklet
 * node, offline-rendered clips (A/B experiments) and the optional microphone.
 */
export class AudioBridge {
  ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private master: GainNode | null = null;
  private clip: AudioBufferSourceNode | null = null;
  private pendingParams: EngineParams | null = null;
  private queued = false;
  micAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;

  onTelemetry: (t: Telemetry) => void = () => {};
  onStream: (s: StreamBlock) => void = () => {};
  onState: (running: boolean) => void = () => {};

  get running(): boolean { return !!this.ctx && this.ctx.state === 'running'; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 48000; }

  async start(params: EngineParams): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'voice-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d.type === 'telemetry') this.onTelemetry(d.telemetry as Telemetry);
        else if (d.type === 'stream') this.onStream(d as StreamBlock);
      };
      const master = ctx.createGain();
      master.gain.value = 1;
      node.connect(master).connect(ctx.destination);
      this.ctx = ctx; this.node = node; this.master = master;
      node.port.postMessage({ type: 'params', params });
      ctx.onstatechange = () => this.onState(this.running);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.onState(this.running);
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
    this.onState(this.running);
  }

  /**
   * Sends parameters to the worklet; several changes made in the same task
   * are coalesced into one message (a microtask, so it also works while the
   * page is in the background, where animation frames are paused).
   */
  setParams(p: EngineParams): void {
    this.pendingParams = p;
    if (this.queued || !this.node) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (this.pendingParams && this.node) this.node.port.postMessage({ type: 'params', params: this.pendingParams });
      this.pendingParams = null;
    });
  }

  playScore(score: Score): void { this.node?.port.postMessage({ type: 'score', score }); }
  stopScore(): void { this.node?.port.postMessage({ type: 'stop' }); }

  /** Plays an offline-rendered clip (it mixes with the live voice). */
  async playClip(samples: Float32Array, fs: number, onEnd?: () => void): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.stopClip();
    const buf = this.ctx.createBuffer(1, samples.length, fs);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master!);
    src.onended = () => { if (this.clip === src) this.clip = null; onEnd?.(); };
    src.start();
    this.clip = src;
  }

  stopClip(): void {
    if (this.clip) { try { this.clip.stop(); } catch { /* already stopped */ } this.clip = null; }
  }

  /** Opt-in microphone analysis (never routed to the speakers). */
  async enableMic(): Promise<AnalyserNode> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = this.ctx.createMediaStreamSource(stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 4096;
    an.smoothingTimeConstant = 0;
    src.connect(an);
    this.micStream = stream;
    this.micAnalyser = an;
    return an;
  }

  disableMic(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.micAnalyser = null;
  }
}
