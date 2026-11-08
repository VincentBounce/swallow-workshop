import { useRef, useState } from 'react';
import { voice } from '../voice/voice';
import { useL } from '../i18n';
import { Section, Slider } from './controls';
import { useAnimatedCanvas, C, label } from '../canvas';
import { melodyState } from './MelodyPanel';
import { welch } from '../../dsp/util/fft';
import { Rng } from '../../dsp/util/rng';

const DUR = 3.2;

/**
 * The excitation of the speech model of the paper Teacher in the Loop, as the
 * paper describes it and nothing more: nine sine waves at 1..9 times the
 * fundamental, all starting together (locked to the pitch); where the melody
 * is zero they switch off and a soft noise takes their place; a set of
 * learned numbers mixes the nine sines into one signal, the excitation, which
 * a learned filter (the decoder) then turns into a voice.
 */
function excitation(weights: number[], contour: number[], FS: number): Float32Array {
  const n = Math.round(DUR * FS);
  const out = new Float32Array(n);
  const rng = new Rng(7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * (contour.length - 1);
    const j = Math.min(contour.length - 2, Math.floor(x)), u = x - j;
    const a = contour[j], b = contour[j + 1];
    const f0 = a > 0 && b > 0 ? a + (b - a) * u : u < 0.5 ? a : b;
    if (f0 > 0) {
      ph += (2 * Math.PI * f0) / FS;
      if (ph > 2 * Math.PI * 1000) ph -= 2 * Math.PI * 1000;
      let s = 0;
      for (let k = 1; k <= 9; k++) s += weights[k - 1] * Math.sin(k * ph);
      out[i] = 0.12 * s;
    } else {
      out[i] = 0.02 * rng.gauss();
    }
  }
  for (let i = 0; i < 1200; i++) { out[i] *= i / 1200; out[n - 1 - i] *= i / 1200; }
  return out;
}

export function MachinePanel() {
  const L = useL();
  const [w, setW] = useState<number[]>([1, 0.7, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.12]);
  const spec = useRef<{ s: Float64Array; fs: number } | null>(null);
  const play = () => {
    const fs = voice.sampleRate;
    const x = excitation(w, melodyState.contour, fs);
    spec.current = { s: welch(x, 8192), fs };
    void voice.playSamples(x, { it: 'l’eccitazione', en: 'the excitation' });
  };
  const ref = useAnimatedCanvas(({ ctx, w: cw, h }) => {
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, cw, h);
    const fmax = 4000;
    const X = (f: number) => 30 + (f / fmax) * (cw - 40);
    const Y = (db: number) => 10 + (-db / 70) * (h - 28);
    ctx.strokeStyle = C.grid; ctx.fillStyle = C.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let f = 0; f <= fmax; f += 1000) { ctx.beginPath(); ctx.moveTo(X(f), 10); ctx.lineTo(X(f), h - 18); ctx.stroke(); ctx.fillText(f ? f / 1000 + 'k' : '0', X(f), h - 15); }
    // nine stems at a typical F0
    const f0 = (melodyState.contour.filter((f) => f > 0).reduce((a, b) => a + b, 0) / Math.max(1, melodyState.contour.filter((f) => f > 0).length)) || 120;
    let mx = 1e-9; for (const v of w) mx = Math.max(mx, Math.abs(v));
    for (let k = 1; k <= 9; k++) {
      const db = 20 * Math.log10(Math.abs(w[k - 1]) / mx + 1e-6);
      ctx.strokeStyle = C.amber; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(X(k * f0), Y(-70)); ctx.lineTo(X(k * f0), Y(Math.max(-70, db))); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(169,139,250,0.12)';
    ctx.fillRect(X(9 * f0 + f0 / 2), 10, cw - 10 - X(9 * f0 + f0 / 2), h - 28);
    label(ctx, L({ it: 'oltre la 9ª armonica: tocca al filtro appreso', en: 'beyond the 9th harmonic: up to the learned filter' }), Math.min(cw - 120, X(9 * f0) + 130), 22, C.violet);
    const sp = spec.current;
    if (sp) {
      const s = sp.s, FS = sp.fs;
      let m = -200; for (let k = 1; k < s.length; k++) m = Math.max(m, 10 * Math.log10(s[k] + 1e-20));
      ctx.strokeStyle = 'rgba(231,235,243,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < s.length; k++) { const f = (k * FS) / 8192; if (f > fmax) break; const y = Y(Math.max(-70, 10 * Math.log10(s[k] + 1e-20) - m)); if (k === 1) ctx.moveTo(X(f), y); else ctx.lineTo(X(f), y); }
      ctx.stroke();
    }
  });
  return (
    <div className="panel-body">
      <Section title={L({ it: 'Come la costruisce un modello', en: 'How a model builds it' })} accent={C.violet}
        info={L({
          it: 'Questa scheda riassume solo come costruisce una voce il modello vocale del lavoro «Teacher in the Loop». Il ronzio lì è quasi tutto matematica: dalla melodia prevista nascono nove sinusoidi, a una, due, tre… fino a nove volte la fondamentale. Partono insieme e l’armonica k gira esattamente k volte più veloce, così restano agganciate alla nota. Nove armoniche arrivano solo a circa 2 kHz: sopra deve pensarci la rete. Dove la melodia prevista va a zero (la «s» di «hiss») le sinusoidi si spengono e al loro posto c’è un rumore leggero. Dieci numeri appresi mescolano le nove sinusoidi in un solo segnale, l’eccitazione; poi un filtro appreso (il decoder) la trasforma in voce, e il colore della voce vive nei suoi pesi.',
          en: 'This tab only summarizes how the speech model of the “Teacher in the Loop” paper builds a voice. Its buzz is mostly math: from the predicted melody come nine sine waves, at one, two, three… up to nine times the fundamental. They start together and harmonic k turns exactly k times faster, so they stay locked to the pitch. Nine harmonics reach only about 2 kHz: above that the network has to do the work. Where the predicted melody drops to zero (the s of “hiss”) the sines switch off and a soft noise takes their place. Ten learned numbers mix the nine sines into one signal, the excitation; then a learned filter (the decoder) turns it into a voice, and the color of the voice lives in its weights.',
        })}>
        <p className="small">{L({ it: 'Prova a mescolare a mano le nove sinusoidi (nel modello lo fanno numeri appresi) e ascolta l’eccitazione sulla melodia disegnata nella scheda «Melodia».', en: 'Try mixing the nine sines by hand (in the model learned numbers do it) and listen to the excitation on the melody drawn in the “Melody” tab.' })}</p>
        {w.map((v, i) => (
          <Slider key={i} label={`${i + 1} × F0`} value={v} min={-1} max={1} onChange={(x) => setW(w.map((y, j) => (j === i ? x : y)))} color={C.amber} />
        ))}
        <div className="row">
          <button className="btn primary" onClick={play}>{L({ it: 'Ascolta l’eccitazione', en: 'Listen to the excitation' })}</button>
          <button className="chip" onClick={() => setW([1, 0, 0, 0, 0, 0, 0, 0, 0])}>{L({ it: 'Solo la fondamentale', en: 'Fundamental only' })}</button>
          <button className="chip" onClick={() => setW([1, 1, 1, 1, 1, 1, 1, 1, 1])}>{L({ it: 'Tutte uguali', en: 'All equal' })}</button>
        </div>
        <canvas ref={ref} className="ab-canvas" />
      </Section>
    </div>
  );
}
