import { useRef } from 'react';
import { store, useUi } from '../store';
import { voice } from '../voice/voice';
import { useT, useL } from '../i18n';
import { useAnimatedCanvas, C, heat } from '../canvas';
import { getFFT, hann } from '../../dsp/util/fft';
import { melBank, applyMel, MelBank } from '../../dsp/analysis/mel';

const COLS = 560;
const ROWS = 256;
const HOP_S = 0.005;
const FMAX = 8000;

/**
 * Scrolling spectrogram of the output. The analysis window (slice length) is
 * adjustable: long slices resolve the harmonics, short ones resolve every
 * glottal pulse. The log-mel mode groups the spectrum into 80 mel bands
 * (0-8 kHz) and takes the logarithm, as speech models do.
 */
export function Spectrogram() {
  const t = useT();
  const L = useL();
  const ui = useUi();
  const state = useRef<{ img: ImageData | null; off: HTMLCanvasElement | null; lastTotal: number; key: string; bank: MelBank | null; win: Float64Array | null; frame: Float32Array }>({
    img: null, off: null, lastTotal: 0, key: '', bank: null, win: null, frame: new Float32Array(8192),
  });

  const ref = useAnimatedCanvas(({ ctx, w, h }) => {
    const st = state.current;
    const fs = voice.sampleRate;
    const winN = Math.max(32, Math.round((store.ui.specWindow / 1000) * fs));
    let fftN = 512;
    while (fftN < winN || fftN < 1024) fftN *= 2;
    const mel = store.ui.mel;
    const key = `${winN}|${fftN}|${mel}|${fs}`;
    if (!st.off) {
      st.off = document.createElement('canvas');
      st.off.width = COLS; st.off.height = ROWS;
      const octx = st.off.getContext('2d')!;
      octx.fillStyle = '#090b14'; octx.fillRect(0, 0, COLS, ROWS);
    }
    const octx = st.off.getContext('2d')!;
    if (key !== st.key) {
      st.key = key;
      st.win = hann(winN);
      st.bank = mel ? melBank(80, fftN, fs, 0, FMAX) : null;
    }
    const hop = Math.round(HOP_S * fs);
    const ring = store.ring;
    if (!store.ui.freeze && ring.total > st.lastTotal) {
      let avail = ring.total - st.lastTotal;
      if (avail > hop * COLS) { st.lastTotal = ring.total - hop * COLS; avail = hop * COLS; }
      const ncol = Math.floor(avail / hop);
      if (ncol > 0) {
        // shift the image left
        octx.drawImage(st.off, -ncol, 0);
        const fft = getFFT(fftN);
        const re = new Float64Array(fftN), im = new Float64Array(fftN);
        const col = octx.createImageData(1, ROWS);
        for (let c = 0; c < ncol; c++) {
          const endTotal = st.lastTotal + (c + 1) * hop;
          const back = ring.total - endTotal; // samples between this column's end and the newest sample
          const n = winN;
          re.fill(0); im.fill(0);
          const RING = ring.out.length;
          const start = (ring.w - back - n + RING * 8) & (RING - 1);
          const w = st.win!;
          let ws = 0;
          for (let i = 0; i < n; i++) { re[i] = ring.out[(start + i) & (RING - 1)] * w[i]; ws += w[i]; }
          fft.transform(re, im);
          const norm = 4 / (ws * ws);
          const d = col.data;
          if (st.bank) {
            const pw = new Float64Array(fftN / 2 + 1);
            for (let k = 0; k <= fftN / 2; k++) pw[k] = (re[k] * re[k] + im[k] * im[k]) * norm;
            const m = applyMel(st.bank, pw);
            for (let r = 0; r < ROWS; r++) {
              const band = Math.min(79, Math.floor(((ROWS - 1 - r) / ROWS) * 80));
              const v = (m[band] / Math.LN10 * 10 + 105) / 85; // natural log -> dB, mapped
              const [cr, cg, cb] = heat(v);
              d[r * 4] = cr; d[r * 4 + 1] = cg; d[r * 4 + 2] = cb; d[r * 4 + 3] = 255;
            }
          } else {
            for (let r = 0; r < ROWS; r++) {
              const f = ((ROWS - 1 - r) / (ROWS - 1)) * FMAX;
              const kf = (f / fs) * fftN;
              const k0 = Math.floor(kf), u = kf - k0;
              const p0 = (re[k0] * re[k0] + im[k0] * im[k0]), p1 = (re[k0 + 1] * re[k0 + 1] + im[k0 + 1] * im[k0 + 1]);
              const db = 10 * Math.log10((p0 * (1 - u) + p1 * u) * norm + 1e-14);
              const [cr, cg, cb] = heat((db + 100) / 80);
              d[r * 4] = cr; d[r * 4 + 1] = cg; d[r * 4 + 2] = cb; d[r * 4 + 3] = 255;
            }
          }
          octx.putImageData(col, COLS - ncol + c, 0);
        }
        st.lastTotal += ncol * hop;
      }
    }
    // draw
    const padL = 38, padB = 18;
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(st.off, padL, 0, w - padL, h - padB);
    ctx.fillStyle = C.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const H = h - padB;
    if (mel) {
      // label a few mel band centres in Hz
      const ticks = [0, 500, 1000, 2000, 4000, 8000];
      const m = (f: number) => 2595 * Math.log10(1 + f / 700);
      for (const f of ticks) {
        const y = H - (m(f) / m(FMAX)) * H;
        ctx.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), padL - 5, Math.max(6, Math.min(H - 4, y)));
      }
    } else {
      for (let f = 0; f <= FMAX; f += 2000) ctx.fillText(f ? f / 1000 + 'k' : '0', padL - 5, Math.max(6, Math.min(H - 4, H - (f / FMAX) * H)));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const secs = COLS * HOP_S;
    for (let s = 0; s <= secs; s += 0.5) ctx.fillText(`-${(secs - s).toFixed(1)} s`, padL + (s / secs) * (w - padL), H + 3);
    if (ring.total === 0) {
      ctx.fillStyle = 'rgba(231,235,243,0.6)'; ctx.font = '12px system-ui';
      ctx.fillText(t('noAudio'), padL + (w - padL) / 2, H / 2);
    }
  });

  return (
    <div className="view-panel spectrogram">
      <canvas ref={ref} className="fill" />
      <div className="overlay-top right">
        <label className="mini">
          {t('window')} {ui.specWindow} ms
          <input type="range" min={3} max={80} step={1} value={ui.specWindow} onChange={(e) => store.setUi({ specWindow: Number(e.target.value) })} />
        </label>
        <button className={ui.mel ? 'chip on violet' : 'chip'} onClick={() => store.setUi({ mel: !ui.mel })}>{ui.mel ? t('mel') : t('linear')}</button>
      </div>
      <div className="overlay-bottom hint">
        {ui.specWindow >= 25
          ? L({ it: 'Fette lunghe: si vedono le armoniche (righe orizzontali), ma gli eventi rapidi si sfocano.', en: 'Long slices: the harmonics show as horizontal lines, but fast events blur.' })
          : ui.specWindow <= 8
            ? L({ it: 'Fette corte: si vede ogni impulso delle corde vocali (righe verticali), ma le armoniche si fondono.', en: 'Short slices: every pulse of the vocal folds shows as a vertical line, but the harmonics merge.' })
            : L({ it: 'Compromesso tra tempo e frequenza.', en: 'A compromise between time and frequency.' })}
      </div>
    </div>
  );
}
