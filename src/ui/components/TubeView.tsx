import { useRef } from 'react';
import { store, useParams, useUi } from '../store';
import { useL } from '../i18n';
import { useAnimatedCanvas, C, fieldColor, label, fmtHz } from '../canvas';
import { standingWave } from '../../dsp/tract/acoustics';
import { portArea } from '../../dsp/tract/nasal';
import { C_SOUND } from '../../dsp/constants';

const CTRL = 16;

/**
 * The vocal tract straightened into a tube: radius from the area function,
 * coloured by the sound field. Standing waves at a formant show where the
 * pressure and the air velocity peak. In "tube mode" the area function is
 * drawn by hand (the head is bypassed).
 */
export function TubeView() {
  const L = useL();
  const p = useParams();
  const ui = useUi();
  const geo = useRef({ x0: 0, x1: 1, yc: 0, k: 1 });
  const drawing = useRef(false);

  const ref = useAnimatedCanvas(({ ctx, w, h }) => {
    const prm = store.params;
    const { af, formants } = store.derived();
    const tel = store.ui.audioOn ? store.telemetry : null;
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, w, h);
    const x0 = 46, x1 = w - 20;
    const yc = h * 0.58;
    const maxR = Math.min(h * 0.34, 60);
    const rOf = (a: number) => Math.sqrt(Math.max(a, 0) / 8) * maxR; // 8 cm^2 -> full radius
    geo.current = { x0, x1, yc, k: maxR };
    const n = af.areas.length;
    const X = (i: number) => x0 + (i / n) * (x1 - x0);
    // nasal branch
    const port = portArea(store.currentArticulators().velum, prm.anatomy.nasalLeak, prm.anatomy.scale);
    const J = Math.round(0.43 * n);
    if (port > 0.01) {
      const bx = X(J), r = rOf(port);
      ctx.fillStyle = `rgba(42,212,189,${0.2 + 0.4 * Math.min(1, port / 1.2)})`;
      ctx.beginPath();
      ctx.moveTo(bx - r, yc - rOf(af.areas[J]));
      ctx.bezierCurveTo(bx - r, yc - maxR * 1.3, bx + 30, yc - maxR * 1.45, x1 - 40, yc - maxR * 1.5);
      ctx.lineTo(x1 - 40, yc - maxR * 1.5 + 10);
      ctx.bezierCurveTo(bx + 30, yc - maxR * 1.3, bx + r, yc - maxR * 1.1, bx + r, yc - rOf(af.areas[J]));
      ctx.fill();
      label(ctx, L({ it: 'naso', en: 'nose' }), x1 - 60, yc - maxR * 1.5 - 10, C.teal);
    }
    // tube sections
    for (let i = 0; i < n; i++) {
      const r = rOf(af.areas[i]);
      let v = 0.2;
      if (tel) v = store.ui.field === 'velocity' ? tel.uRms[i] : tel.pRms[i];
      ctx.fillStyle = fieldColor(v, tel ? 0.9 : 0.5);
      ctx.fillRect(X(i), yc - r, X(i + 1) - X(i) + 0.5, 2 * r);
    }
    ctx.strokeStyle = 'rgba(247,112,138,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const r = rOf(af.areas[i]); ctx.lineTo(X(i), yc - r); ctx.lineTo(X(i + 1), yc - r); }
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const r = rOf(af.areas[i]); ctx.lineTo(X(i), yc + r); ctx.lineTo(X(i + 1), yc + r); }
    ctx.stroke();
    // standing wave at a formant
    const sw = store.ui.standing;
    if (sw > 0 && formants[sw - 1]) {
      const f = formants[sw - 1].f;
      const prof = standingWave(af, f, { port, scale: prm.anatomy.scale });
      let pm = 1e-12, um = 1e-12;
      for (let i = 0; i <= n; i++) { pm = Math.max(pm, prof.p[i]); um = Math.max(um, prof.u[i]); }
      const base = yc + maxR + 26;
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.amber; ctx.beginPath();
      for (let i = 0; i <= n; i++) { const y = base - (prof.p[i] / pm) * 22; if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); }
      ctx.stroke();
      ctx.strokeStyle = C.sky; ctx.beginPath();
      for (let i = 0; i <= n; i++) { const y = base - (prof.u[i] / um) * 22; if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); }
      ctx.stroke();
      label(ctx, `F${sw} ${fmtHz(f)}: ${L({ it: 'pressione', en: 'pressure' })}`, x0 + 70, base + 10, C.amber);
      label(ctx, L({ it: 'velocità dell’aria', en: 'air velocity' }), x0 + 210, base + 10, C.sky);
    }
    // tube mode control points (16 drawn by hand, or the 44 of a measured shape)
    if (prm.tubeMode) {
      const m = prm.tubeAreas.length;
      for (let i = 0; i < m; i++) {
        const x = x0 + ((i + 0.5) / m) * (x1 - x0);
        const r = rOf(prm.tubeAreas[i] ?? 3);
        ctx.fillStyle = C.text;
        ctx.beginPath(); ctx.arc(x, yc - r, m > CTRL ? 2.5 : 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // axis
    ctx.fillStyle = C.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(L({ it: 'glottide', en: 'glottis' }), x0, yc + maxR + 4);
    ctx.fillText(L({ it: 'labbra', en: 'lips' }), x1, yc + maxR + 4);
    label(ctx, `L = ${af.length.toFixed(1)} cm · ${L({ it: 'un tubo uniforme così risuonerebbe a', en: 'a uniform tube this long would ring at' })} ${Math.round(C_SOUND / (4 * af.length))} / ${Math.round((3 * C_SOUND) / (4 * af.length))} / ${Math.round((5 * C_SOUND) / (4 * af.length))} Hz`, 10, 46, C.text, undefined, 'left');
    if (formants.length) label(ctx, `${L({ it: 'formanti di questa forma', en: 'formants of this shape' })}: ${formants.slice(0, 3).map((f) => Math.round(f.f)).join(' / ')} Hz`, 10, 66, C.teal, undefined, 'left');
  });

  const edit = (e: React.PointerEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const g = geo.current;
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const frac = (px - g.x0) / (g.x1 - g.x0);
    if (frac < 0 || frac >= 1) return;
    const rad = Math.abs(py - g.yc) / g.k;
    const area = Math.max(0.0, Math.min(12, rad * rad * 8));
    store.setParams((p) => {
      if (!p.tubeMode) {
        const af = store.derived().af;
        p.tubeAreas = Array.from({ length: CTRL }, (_, k) => af.areas[Math.min(af.areas.length - 1, Math.floor(((k + 0.5) / CTRL) * af.areas.length))]);
        p.tubeLength = af.length;
        p.tubeMode = true;
      }
      p.tubeAreas[Math.floor(frac * p.tubeAreas.length)] = area < 0.02 ? 0.0 : area;
      p.phonate = true;
    });
  };

  return (
    <div className="view-panel">
      <canvas ref={ref} className="fill"
        onPointerDown={(e) => { drawing.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); edit(e); }}
        onPointerMove={(e) => { if (drawing.current) edit(e); }}
        onPointerUp={() => { drawing.current = false; }} />
      <div className="overlay-top right">
        {[0, 1, 2, 3].map((k) => (
          <button key={k} className={ui.standing === k ? 'chip on amber' : 'chip'} onClick={() => store.setUi({ standing: k })}>{k === 0 ? L({ it: 'niente onde', en: 'no waves' }) : `F${k}`}</button>
        ))}
      </div>
      <div className="overlay-bottom row">
        <span className="hint">{p.tubeMode ? L({ it: 'Modalità tubo: disegna il profilo trascinando.', en: 'Tube mode: draw the profile by dragging.' }) : L({ it: 'Trascina sul tubo per disegnarlo a mano.', en: 'Drag on the tube to draw it by hand.' })}</span>
        {p.tubeMode && <>
          <label className="mini">L {p.tubeLength.toFixed(1)} cm<input type="range" min={8} max={26} step={0.1} value={p.tubeLength} onChange={(e) => store.setParams((q) => { q.tubeLength = Number(e.target.value); })} /></label>
          <button className="chip" onClick={() => store.setParams((q) => { q.tubeAreas = new Array(CTRL).fill(3); q.tubeLength = 17.5; })}>{L({ it: 'Uniforme', en: 'Uniform' })}</button>
          <button className="chip on" onClick={() => store.setParams((q) => { q.tubeMode = false; })}>{L({ it: 'Torna alla testa', en: 'Back to the head' })}</button>
        </>}
      </div>
    </div>
  );
}
