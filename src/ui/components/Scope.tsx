import { useRef, useState } from 'react';
import { store } from '../store';
import { voice } from '../voice/voice';
import { useL, useT } from '../i18n';
import { useAnimatedCanvas, C, label } from '../canvas';

/**
 * Oscilloscope: the pressure wave at the microphone (output), the glottal
 * airflow (the train of puffs) and the turbulence sources, triggered on the
 * opening of the glottis so that the repeating shape stands still.
 */
export function Scope() {
  const L = useL();
  const t = useT();
  const [ms, setMs] = useState(25);
  const [show, setShow] = useState({ out: true, flow: true, noise: false });
  const bufs = useRef({ out: new Float32Array(16384), flow: new Float32Array(16384), noise: new Float32Array(16384) });

  const ref = useAnimatedCanvas(({ ctx, w, h }) => {
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, w, h);
    const fs = voice.sampleRate;
    const n = Math.round((ms / 1000) * fs);
    const need = n + Math.round(0.03 * fs);
    const tel = store.ui.audioOn ? store.telemetry : null;
    // grid
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const x = (i / 10) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.fillStyle = C.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${(ms / 10).toFixed(1)} ms / div`, 6, h - 4);
    if (!tel || store.ring.total < need) {
      ctx.fillStyle = 'rgba(231,235,243,0.6)'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('noAudio'), w / 2, h / 2);
      return;
    }
    const b = bufs.current;
    const out = store.readRing('out', need, b.out.subarray(0, need));
    const flow = store.readRing('flow', need, b.flow.subarray(0, need));
    const noise = store.readRing('noise', need, b.noise.subarray(0, need));
    // trigger: last rising crossing of the mean flow, leaving n samples after it
    let mean = 0;
    for (let i = 0; i < need; i++) mean += flow[i];
    mean /= need;
    let trig = need - n;
    for (let i = need - n; i > 1; i--) { if (flow[i - 1] < mean && flow[i] >= mean) { trig = i; break; } }
    const start = Math.max(0, trig - Math.round(n * 0.1));
    const draw = (x: Float32Array, color: string, scale: number, lw = 1.6) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = x[start + i] * scale;
        const px = (i / n) * w, py = h / 2 - v * (h / 2) * 0.9;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    };
    const peak = (x: Float32Array, off = 0) => { let m = 1e-9; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(x[start + i] - off)); return m; };
    if (show.flow) {
      let mf = 1e-9; for (let i = 0; i < n; i++) mf = Math.max(mf, flow[start + i]);
      // flow is always >= 0: draw from the bottom
      ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const px = (i / n) * w, py = h - 8 - (flow[start + i] / mf) * (h * 0.42); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke();
      label(ctx, L({ it: 'flusso alla glottide (sbuffi)', en: 'glottal airflow (puffs)' }), 10, h - 34, C.amber, undefined, 'left');
    }
    if (show.noise) { draw(noise, C.violet, 0.8 / peak(noise), 1); }
    if (show.out) { draw(out, C.text, 0.95 / peak(out), 1.6); label(ctx, L({ it: 'onda di pressione (uscita)', en: 'pressure wave (output)' }), 10, 44, C.text, undefined, 'left'); }
    if (tel.f0 > 0) label(ctx, `${L({ it: 'periodo', en: 'period' })} ${(1000 / tel.f0).toFixed(1)} ms · ${tel.f0.toFixed(0)} Hz`, 10, 64, C.amber, undefined, 'left');
  });

  return (
    <div className="view-panel">
      <canvas ref={ref} className="fill" />
      <div className="overlay-top right">
        <button className={show.out ? 'chip on' : 'chip'} onClick={() => setShow({ ...show, out: !show.out })}>{L({ it: 'Uscita', en: 'Output' })}</button>
        <button className={show.flow ? 'chip on amber' : 'chip'} onClick={() => setShow({ ...show, flow: !show.flow })}>{L({ it: 'Flusso', en: 'Flow' })}</button>
        <button className={show.noise ? 'chip on violet' : 'chip'} onClick={() => setShow({ ...show, noise: !show.noise })}>{L({ it: 'Rumore', en: 'Noise' })}</button>
        <label className="mini">{ms} ms<input type="range" min={5} max={200} value={ms} onChange={(e) => setMs(Number(e.target.value))} /></label>
      </div>
    </div>
  );
}
