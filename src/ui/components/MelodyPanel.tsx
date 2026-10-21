import { useEffect, useRef, useState } from 'react';
import { store, useParams } from '../store';
import { useL } from '../i18n';
import { Section, Toggle } from './controls';
import { useAnimatedCanvas, C, noteName, label } from '../canvas';
import { contourScore } from '../presets';

const DUR = 3.2;
const NPTS = 160;
const FLO = 55, FHI = 520;

/** A statement contour: rise to an accent, slow declination, final fall. */
function defaultContour(base: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < NPTS; i++) {
    const t = (i / (NPTS - 1)) * DUR;
    let st = -3 * (t / DUR);
    st += 4 * Math.exp(-0.5 * ((t - 0.55) / 0.18) ** 2) + 2.5 * Math.exp(-0.5 * ((t - 1.7) / 0.2) ** 2);
    if (t > 2.6) st -= 5 * ((t - 2.6) / 0.6);
    const unvoiced = (t > 0.95 && t < 1.08) || (t > 2.1 && t < 2.2);
    out.push(unvoiced ? 0 : base * Math.pow(2, st / 12));
  }
  return out;
}

export const melodyState = { contour: defaultContour(120) };

/**
 * Melody: draw the pitch contour of a sentence and play it with the buzz
 * alone (no filter), as a sung vowel, or use it when speaking. A keyboard
 * plays sustained notes (singing).
 */
export function MelodyPanel() {
  const L = useL();
  const p = useParams();
  const [, force] = useState(0);
  const [octave, setOctave] = useState(p.source.f0 > 170 ? 4 : 3);
  const [vib, setVib] = useState(true);
  const playing = useRef<{ t0: number; dur: number } | null>(null);
  const restore = useRef<number | null>(null);

  const ref = useAnimatedCanvas(({ ctx, w, h }) => {
    const c = melodyState.contour;
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, w, h);
    const X = (i: number) => 34 + (i / (NPTS - 1)) * (w - 44);
    const Y = (f: number) => 8 + (Math.log(FHI / f) / Math.log(FHI / FLO)) * (h - 26);
    ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let m = 33; m <= 72; m++) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      if (f < FLO || f > FHI) continue;
      const isC = m % 12 === 0, isA = m % 12 === 9;
      ctx.strokeStyle = isC ? C.grid2 : C.grid;
      ctx.globalAlpha = isC || isA ? 1 : 0.35;
      ctx.beginPath(); ctx.moveTo(34, Y(f)); ctx.lineTo(w - 10, Y(f)); ctx.stroke();
      ctx.globalAlpha = 1;
      if (isC || isA) { ctx.fillStyle = C.muted; ctx.fillText(noteName(f), 30, Y(f)); }
    }
    // contour
    ctx.strokeStyle = C.amber; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < NPTS; i++) {
      if (c[i] > 0) { if (pen) ctx.lineTo(X(i), Y(c[i])); else { ctx.moveTo(X(i), Y(c[i])); pen = true; } } else pen = false;
    }
    ctx.stroke();
    // playhead
    const pl = playing.current;
    if (pl) {
      const t = (performance.now() / 1000 - pl.t0) / pl.dur;
      if (t > 1.05) playing.current = null;
      else { ctx.strokeStyle = 'rgba(231,235,243,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(t * (NPTS - 1)), 8); ctx.lineTo(X(t * (NPTS - 1)), h - 18); ctx.stroke(); }
    }
    ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let s = 0; s <= DUR; s += 0.5) ctx.fillText(`${s.toFixed(1)} s`, X((s / DUR) * (NPTS - 1)), h - 15);
    label(ctx, L({ it: 'disegna la melodia (tasto destro o Maiusc: cancella = senza voce)', en: 'draw the melody (right button or Shift: erase = unvoiced)' }), w / 2, 14, C.muted);
  });

  const last = useRef<number | null>(null);
  const paint = (e: React.PointerEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - 34) / (r.width - 44)) * (NPTS - 1));
    if (i < 0 || i >= NPTS) return;
    const erase = e.shiftKey || e.buttons === 2;
    const f = erase ? 0 : FHI * Math.pow(FLO / FHI, (e.clientY - r.top - 8) / (r.height - 26));
    const c = melodyState.contour;
    const a = last.current ?? i;
    const lo = Math.min(a, i), hi = Math.max(a, i);
    for (let k = lo; k <= hi; k++) c[k] = Math.max(0, Math.min(FHI, f));
    last.current = i;
    force((x) => x + 1);
  };

  const play = (mode: 'buzz' | 'vowel') => {
    const c = melodyState.contour;
    const pts = c.map((f0, i) => ({ t: (i / (NPTS - 1)) * DUR, f0 }));
    const prm = store.params;
    const score = contourScore(pts, { ...prm.articulators }, Math.max(6, prm.source.ps));
    if (restore.current) { clearTimeout(restore.current); restore.current = null; }
    const wasBypass = prm.bypassTract;
    if (mode === 'buzz') store.setParams((q) => { q.bypassTract = true; });
    else store.setParams((q) => { q.bypassTract = false; });
    void store.speak(score);
    playing.current = { t0: performance.now() / 1000, dur: DUR };
    if (mode === 'buzz') restore.current = window.setTimeout(() => { store.setParams((q) => { q.bypassTract = wasBypass; }); }, (DUR + 0.6) * 1000);
  };

  // keyboard
  const held = useRef<string | null>(null);
  const noteOn = (m: number) => {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    store.setParams((q) => { q.source.f0 = f; q.phonate = true; q.abduction = 0; q.source.vibratoDepth = vib ? 35 : 0; });
    if (!store.audio.running) void store.startAudio();
  };
  const noteOff = () => store.setParams((q) => { q.phonate = false; });
  useEffect(() => {
    const keys = 'awsedftgyhujk';
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.repeat) return;
      const i = keys.indexOf(e.key.toLowerCase());
      if (i < 0) return;
      held.current = e.key;
      noteOn(12 * (octave + 1) + i);
    };
    const up = (e: KeyboardEvent) => { if (held.current === e.key) { held.current = null; noteOff(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  const whites = [0, 2, 4, 5, 7, 9, 11];
  const keysUi: { m: number; black: boolean; x: number }[] = [];
  let wx = 0;
  for (let o = 0; o < 2; o++) for (let s = 0; s < 12; s++) {
    const m = 12 * (octave + 1 + o) + s;
    const black = !whites.includes(s);
    keysUi.push({ m, black, x: black ? wx - 0.3 : wx });
    if (!black) wx += 1;
  }
  keysUi.push({ m: 12 * (octave + 3), black: false, x: wx });
  const nW = wx + 1;
  return (
    <div className="panel-body">
      <Section title={L({ it: 'La melodia della voce', en: 'The melody of speech' })} accent={C.amber}
        info={L({
          it: 'Quando parliamo la nota non sta mai ferma: quella fondamentale in movimento è l’intonazione. Suonata dal solo ronzio si segue la melodia, ma non ci sono parole e della persona si capisce poco più di quanto è acuta: il resto lo fa il filtro.',
          en: 'When we talk the pitch never stops moving: that moving fundamental is intonation. Played by the buzz alone you can follow the tune, but there are no words and little of the person beyond how high it sits: the rest comes from the filter.',
        })}>
        <canvas ref={ref} className="melody-canvas" onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); last.current = null; paint(e); }}
          onPointerMove={(e) => { if (e.buttons) paint(e); }} onPointerUp={() => { last.current = null; }} />
        <div className="row wrap">
          <button className="btn primary" onClick={() => play('buzz')}>{L({ it: 'Suona col solo ronzio', en: 'Play with the buzz alone' })}</button>
          <button className="btn" onClick={() => play('vowel')}>{L({ it: 'Canta con la vocale attuale', en: 'Sing with the current vowel' })}</button>
          <button className="chip" onClick={() => { melodyState.contour = defaultContour(store.params.source.f0); force((x) => x + 1); }}>{L({ it: 'Frase tipo', en: 'Sample sentence' })}</button>
          <button className="chip" onClick={() => { melodyState.contour = defaultContour(store.params.source.f0).map((f, i) => (f > 0 && i > NPTS * 0.8 ? f * Math.pow(2, (6 * (i - NPTS * 0.8)) / (NPTS * 0.2) / 12) : f)); force((x) => x + 1); }}>{L({ it: 'Domanda', en: 'Question' })}</button>
          <button className="chip" onClick={() => { melodyState.contour = new Array(NPTS).fill(store.params.source.f0); force((x) => x + 1); }}>{L({ it: 'Piatta (robot)', en: 'Flat (robot)' })}</button>
        </div>
      </Section>
      <Section title={L({ it: 'Canta', en: 'Sing' })} accent={C.amber}
        info={L({ it: 'Tieni premuto un tasto (o usa la tastiera del computer: A W S E D F T G Y H U J K). La vocale resta quella scelta: cambia solo la nota, le armoniche scorrono sotto lo stesso inviluppo.', en: 'Hold a key (or use the computer keyboard: A W S E D F T G Y H U J K). The vowel stays the same: only the pitch changes, the harmonics slide under the same envelope.' })}>
        <div className="row">
          <button className="chip" onClick={() => setOctave(Math.max(1, octave - 1))}>−8va</button>
          <span className="small">C{octave}–C{octave + 2}</span>
          <button className="chip" onClick={() => setOctave(Math.min(5, octave + 1))}>+8va</button>
          <Toggle label="vibrato" value={vib} onChange={setVib} />
        </div>
        <div className="keyboard" style={{ ['--n' as string]: nW }}>
          {keysUi.map((k) => (
            <button key={k.m} className={k.black ? 'key black' : 'key'} style={{ left: `${(k.x / nW) * 100}%`, width: `${((k.black ? 0.6 : 1) / nW) * 100}%` }}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); noteOn(k.m); }} onPointerUp={noteOff} onPointerCancel={noteOff}>
              {!k.black && k.m % 12 === 0 ? noteName(440 * Math.pow(2, (k.m - 69) / 12)) : ''}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
