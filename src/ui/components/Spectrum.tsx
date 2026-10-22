import { useRef, useState } from 'react';
import { store, useUi } from '../store';
import { voice } from '../voice/voice';
import { useT, useL } from '../i18n';
import { useAnimatedCanvas, C, fmtHz, label } from '../canvas';
import { spectrumDb, sourceHarmonics, filterResponse } from '../analysis';

/**
 * Spectrum view: measured spectrum of the output (white), the harmonics the
 * model predicts (source harmonics times the filter, amber stems), the
 * spectral envelope (the curve through their tips) and the filter alone
 * (teal), with the formants F1-F3 labelled.
 */
export function Spectrum() {
  const t = useT();
  const L = useL();
  const ui = useUi();
  const [fmax, setFmax] = useState(5000);
  const avg = useRef<Float32Array | null>(null);
  const mic = useRef<Float32Array | null>(null);
  const buf = useRef(new Float32Array(4096));

  const ref = useAnimatedCanvas(({ ctx, w, h }) => {
    const p = voice.sounding();
    const tel = store.ui.audioOn ? store.telemetry : null;
    const { af, formants } = store.derived();
    const a = p.articulators;
    const padL = 38, padB = 22, padT = 10, padR = 10;
    const W = w - padL - padR, H = h - padT - padB;
    const X = (f: number) => padL + (f / fmax) * W;
    const DB_TOP = 0, DB_RANGE = 80;
    const Y = (db: number) => padT + ((DB_TOP - db) / DB_RANGE) * H;
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.font = '10px system-ui'; ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = fmax > 6000 ? 2000 : 1000;
    for (let f = 0; f <= fmax; f += step / 2) {
      ctx.globalAlpha = f % step === 0 ? 1 : 0.4;
      ctx.beginPath(); ctx.moveTo(X(f), padT); ctx.lineTo(X(f), padT + H); ctx.stroke();
      if (f % step === 0) ctx.fillText(f === 0 ? '0' : (f / 1000) + 'k', X(f), padT + H + 5);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let db = 0; db >= -DB_RANGE; db -= 20) {
      ctx.beginPath(); ctx.moveTo(padL, Y(db)); ctx.lineTo(padL + W, Y(db)); ctx.stroke();
      ctx.fillText(String(db), padL - 5, Y(db));
    }
    ctx.save();
    ctx.translate(10, padT + H / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText('dB', 0, 0);
    ctx.restore();

    // predicted harmonics: source x filter
    // with the audio on, harmonics only while the folds really vibrate;
    // with the audio off, the prediction for the current settings
    const f0 = tel ? tel.f0 : p.voicing ? p.source.f0 : 0;
    const resp = filterResponse(af, p, a.velum, fmax, 220);
    const magAt = (f: number) => {
      const fr = resp.freqs, m = resp.mag;
      const x = ((f - fr[0]) / (fr[fr.length - 1] - fr[0])) * (fr.length - 1);
      const i = Math.max(0, Math.min(fr.length - 2, Math.floor(x))), u = Math.max(0, Math.min(1, x - i));
      return m[i] * (1 - u) + m[i + 1] * u;
    };
    // measured spectrum
    let measuredMax = -200;
    let meas: Float32Array | null = null;
    if (store.ring.total > 4096 && (tel || voice.running)) {
      store.readRing('out', 4096, buf.current);
      meas = spectrumDb(buf.current, 4096, 4096, meas ?? undefined);
      if (!avg.current || avg.current.length !== meas.length) avg.current = meas.slice();
      else for (let k = 0; k < meas.length; k++) avg.current[k] = 0.6 * avg.current[k] + 0.4 * meas[k];
      const fsr = voice.sampleRate;
      for (let k = 1; k < meas.length; k++) { const f = (k * fsr) / 4096; if (f > fmax) break; if (avg.current[k] > measuredMax) measuredMax = avg.current[k]; }
    }
    const K = f0 > 0 ? Math.min(400, Math.floor(fmax / f0)) : 0;
    const src = K > 0 ? sourceHarmonics(p, K) : null;
    let predMax = -200;
    const pred: number[] = [];
    for (let k = 1; k <= K; k++) {
      const v = 20 * Math.log10(src![k] * magAt(k * f0) + 1e-12);
      pred.push(v);
      if (v > predMax) predMax = v;
    }
    const offset = measuredMax > -150 ? measuredMax - predMax : -6 - predMax;
    // filter alone
    let fmaxDb = -200;
    const fdb: number[] = [];
    for (let i = 0; i < resp.freqs.length; i++) { const v = 20 * Math.log10(resp.mag[i] + 1e-9); fdb.push(v); if (v > fmaxDb) fmaxDb = v; }
    if (store.ui.envelope) {
      ctx.strokeStyle = C.teal; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let i = 0; i < fdb.length; i++) { const x = X(resp.freqs[i]), y = Y(fdb[i] - fmaxDb - 4); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // envelope through the harmonic tips (source tilt x filter), drawn smooth
    if (K > 1 && store.ui.envelope) {
      ctx.strokeStyle = 'rgba(246,168,35,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < resp.freqs.length; i++) {
        const f = resp.freqs[i];
        const kf = Math.max(1, Math.min(K, f / f0));
        const k0 = Math.floor(kf), k1 = Math.min(K, k0 + 1), u = kf - k0;
        const sl = Math.exp(Math.log(src![k0] + 1e-12) * (1 - u) + Math.log(src![k1] + 1e-12) * u);
        const v = 20 * Math.log10(sl * resp.mag[i] + 1e-12) + offset;
        if (i) ctx.lineTo(X(f), Y(v)); else ctx.moveTo(X(f), Y(v));
      }
      ctx.stroke();
    }
    // harmonic stems
    if (store.ui.showHarmonics && K > 0) {
      for (let k = 1; k <= K; k++) {
        const v = pred[k - 1] + offset;
        const x = X(k * f0);
        ctx.strokeStyle = k === 1 ? C.amber : 'rgba(246,168,35,0.55)';
        ctx.lineWidth = K > 60 ? 1 : 2;
        ctx.beginPath(); ctx.moveTo(x, Y(-DB_RANGE)); ctx.lineTo(x, Y(Math.max(-DB_RANGE, v))); ctx.stroke();
        if (K <= 60) { ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(x, Y(Math.max(-DB_RANGE, v)), 2.2, 0, Math.PI * 2); ctx.fill(); }
      }
      label(ctx, `F0 ${Math.round(f0)} Hz`, X(f0) + 36, Y(-DB_RANGE) - 12, C.amber);
    }
    // measured
    if (avg.current && measuredMax > -150) {
      const fsr = voice.sampleRate;
      ctx.strokeStyle = 'rgba(231,235,243,0.85)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      let first = true;
      for (let k = 1; k < avg.current.length; k++) {
        const f = (k * fsr) / 4096;
        if (f > fmax) break;
        const y = Y(Math.max(-DB_RANGE - 5, avg.current[k]));
        if (first) { ctx.moveTo(X(f), y); first = false; } else ctx.lineTo(X(f), y);
      }
      ctx.stroke();
    }
    // microphone
    const an = voice.micAnalyser;
    if (store.ui.micOn && an) {
      if (!mic.current || mic.current.length !== an.fftSize) mic.current = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(mic.current as Float32Array<ArrayBuffer>);
      const md = spectrumDb(mic.current, mic.current.length, mic.current.length);
      const fsr = voice.sampleRate;
      ctx.strokeStyle = 'rgba(69,184,245,0.85)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 1; k < md.length; k++) {
        const f = (k * fsr) / mic.current.length;
        if (f > fmax) break;
        const y = Y(Math.max(-DB_RANGE - 5, md[k] + 10));
        if (k === 1) ctx.moveTo(X(f), y); else ctx.lineTo(X(f), y);
      }
      ctx.stroke();
    }
    // formant labels
    formants.slice(0, 4).forEach((fm, i) => {
      if (fm.f > fmax) return;
      const x = X(fm.f);
      ctx.strokeStyle = 'rgba(42,212,189,0.5)'; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT + 22); ctx.lineTo(x, padT + H); ctx.stroke(); ctx.setLineDash([]);
      label(ctx, `F${i + 1} ${fmtHz(fm.f)}`, x, padT + 40 + (i % 2) * 18, C.teal);
    });
  });

  return (
    <div className="view-panel">
      <canvas ref={ref} className="fill" />
      <div className="overlay-top right">
        <button className={ui.showHarmonics ? 'chip on amber' : 'chip'} onClick={() => store.setUi({ showHarmonics: !ui.showHarmonics })}>{t('harmonics')}</button>
        <button className={ui.envelope ? 'chip on teal' : 'chip'} onClick={() => store.setUi({ envelope: !ui.envelope })}>{t('envelope')}</button>
        <button className="chip" onClick={() => setFmax(fmax === 5000 ? 10000 : 5000)}>{fmax === 5000 ? '0–5 kHz' : '0–10 kHz'}</button>
      </div>
      <div className="legend">
        <span className="lg"><span className="dot white" />{L({ it: 'misurato', en: 'measured' })}</span>
        <span className="lg"><span className="dot amber" />{L({ it: 'armoniche e inviluppo', en: 'harmonics and envelope' })}</span>
        <span className="lg"><span className="dot teal dashed" />{L({ it: 'solo filtro', en: 'filter alone' })}</span>
        {ui.micOn && <span className="lg"><span className="dot sky" />{L({ it: 'microfono', en: 'microphone' })}</span>}
      </div>
    </div>
  );
}
