import { useRef, useState } from 'react';
import { useL } from '../i18n';
import { useAnimatedCanvas, C, label } from '../canvas';
import { drawHead, headViewport, newHeadLayer, HeadViewport } from '../head/draw';
import { computeGeometry, TractGeometry } from '../../dsp/tract/geometry';
import { DEFAULT_ANATOMY } from '../../dsp/tract/types';
import { SWALLOWS, SwallowPhase, SwallowPose, SwallowSequence, bolusPoint, swallowDuration, swallowMarks, swallowPose } from '../../dsp/swallow/sequence';

type Bi = { it: string; en: string };

const PHASE_NAMES: Record<SwallowPhase, Bi> = {
  rest: { it: 'Riposo', en: 'Rest' },
  oralPrep: { it: 'Preparazione orale', en: 'Oral preparation' },
  oralTransit: { it: 'Transito orale', en: 'Oral transit' },
  pharyngeal: { it: 'Fase faringea', en: 'Pharyngeal phase' },
};
const PHASE_COLORS: Record<SwallowPhase, string> = { rest: C.sky, oralPrep: C.teal, oralTransit: C.amber, pharyngeal: C.violet };

/** The bolus, a mouthful of purée. */
const BOLUS = '#8fd16a';
/** Teeth apart beyond this (cm) are shown as a gap. */
const GAP_SHOWN = 0.05;

/**
 * What the swallow shows on a head: the bolus along its path, squeezed by the
 * passage; a bracket in front of the incisors with the gap between them; a ring
 * where the tip touches the ridge or the teeth. Their names stack at the top right.
 */
function drawMarks(ctx: CanvasRenderingContext2D, g: TractGeometry, p: SwallowPose, vp: HeadViewport, w: number, L: (t: Bi) => string): void {
  const X = (x: number) => vp.ox + x * vp.k, Y = (y: number) => vp.oy - y * vp.k;
  // the bolus, fading out down the oesophagus (there is none at rest)
  const fade = p.phase === 'rest' ? 0 : Math.max(0, Math.min(1, (p.bolus + 0.3) / 0.15));
  if (fade > 0) {
    const q = bolusPoint(g, p.bolus);
    const along = 0.75 * g.scale * vp.k, across = Math.max(0.18, Math.min(0.45, 0.9 * q.half)) * vp.k;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(X(q.x), Y(q.y));
    ctx.rotate(Math.atan2(-q.dy, q.dx));
    const gr = ctx.createRadialGradient(-along * 0.3, -across * 0.4, 1, 0, 0, along);
    gr.addColorStop(0, '#d9f5c4'); gr.addColorStop(0.5, BOLUS); gr.addColorStop(1, '#4f8f36');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(0, 0, along, across, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // a mark drawn over the tissue: a dark halo under the colour, so it reads on pink lips and tongue alike
  const stroke = (c: string) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(11,14,20,0.85)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.stroke();
  };
  const m = swallowMarks(g);
  const names: [string, string][] = [];
  // the gap between the incisor edges, as a dimension in front of the lips: a line from each edge to a bracket
  const sl = g.slit, bx = X(g.landmarks.lipFront[0] + 0.5 * g.scale);
  const apart = m.toothGap > GAP_SHOWN;
  const gapColor = apart ? C.rose : C.teal;
  ctx.save();
  ctx.setLineDash([2, 3]); ctx.strokeStyle = gapColor; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(sl.ux), Y(sl.uy)); ctx.lineTo(bx, Y(sl.uy)); ctx.moveTo(X(sl.lx), Y(sl.ly)); ctx.lineTo(bx, Y(sl.ly)); ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(bx - 6, Y(sl.uy)); ctx.lineTo(bx, Y(sl.uy)); ctx.lineTo(bx, Y(sl.ly)); ctx.lineTo(bx - 6, Y(sl.ly));
  stroke(gapColor);
  names.push([apart ? `${L({ it: 'Denti separati', en: 'Teeth apart' })} ${(m.toothGap * 10).toFixed(1)} mm` : L({ it: 'Denti serrati', en: 'Teeth together' }), gapColor]);
  // what the tip touches
  if (m.tipContact) {
    const c = m.tipContact === 'incisor' ? C.rose : C.teal;
    ctx.beginPath(); ctx.arc(X(g.tipPoint[0]), Y(g.tipPoint[1]), 0.45 * g.scale * vp.k, 0, Math.PI * 2);
    stroke(c);
    names.push([m.tipContact === 'incisor' ? L({ it: 'Lingua contro i denti', en: 'Tongue against the teeth' }) : L({ it: 'Punta sul palato', en: 'Tip on the palate' }), c]);
  }
  names.forEach(([text, c], i) => label(ctx, text, w - 12, 18 + 22 * i, c, undefined, 'right'));
}

/** The playback speeds, slowest last. */
const SPEEDS: [number, string][] = [[1, '×1'], [0.5, '×½'], [0.25, '×¼']];
/** Both sequences loop together on the longer one (each rests at its end meanwhile). */
const PERIOD = Math.max(...Object.values(SWALLOWS).map(swallowDuration));

/** The shared clock: the sequence time `from` at the instant `at` (performance.now, ms), running at `speed` while playing. */
interface Clock { at: number; from: number; playing: boolean; speed: number }
const clockTime = (c: Clock, now = performance.now()): number => (c.playing ? c.from + ((now - c.at) / 1000) * c.speed : c.from) % PERIOD;

/** The stretches of a sequence, in order: each stage from its first key to the next stage's first key (s); a stage may come back (the rest). */
function phaseSpans(seq: SwallowSequence): { phase: SwallowPhase; t0: number; t1: number }[] {
  const spans: { phase: SwallowPhase; t0: number; t1: number }[] = [];
  for (const k of seq.keys) {
    const last = spans[spans.length - 1];
    if (last?.phase === k.phase) continue;
    if (last) last.t1 = k.t;
    spans.push({ phase: k.phase, t0: k.t, t1: k.t });
  }
  spans[spans.length - 1].t1 = swallowDuration(seq);
  return spans;
}

/** The bar of the stages on a w x h head canvas: from x0 to x1 at height y (CSS pixels), grabbed within `grab` of it. */
const bar = (w: number, h: number) => ({ x0: 12, x1: w - 12, y: h - 14, grab: 16 });

/** One head playing one sequence on the shared clock, with its name, its stage and a bar of the three stages; dragging along the bar moves the clock (`seek`, `held` while the button is down). */
function SwallowHead({ seq, name, clock, seek }: { seq: SwallowSequence; name: Bi; clock: React.RefObject<Clock>; seek: (t: number, held: boolean) => void }) {
  const L = useL();
  const layer = useRef(newHeadLayer());
  const spans = phaseSpans(seq);
  const end = swallowDuration(seq);
  const ref = useAnimatedCanvas(({ ctx, w, h, dpr }) => {
    const t = Math.min(end, clockTime(clock.current));
    const p = swallowPose(seq, t);
    const geom = computeGeometry(p.a, DEFAULT_ANATOMY, p.teeth);
    const vp = headViewport(w, h);
    drawHead(ctx, layer.current, { geom, an: DEFAULT_ANATOMY, a: p.a, teeth: p.teeth }, vp, w, h, dpr, { field: 'pressure', tel: null });
    drawMarks(ctx, geom, p, vp, w, L);
    label(ctx, L(name), 12, 18, C.text, undefined, 'left');
    label(ctx, L(PHASE_NAMES[p.phase]), 12, 40, PHASE_COLORS[p.phase], undefined, 'left');
    // the three stages along the sequence, the current one bright, and where the clock is
    const { x0, x1, y } = bar(w, h), bw = x1 - x0;
    for (const s of spans) {
      ctx.fillStyle = PHASE_COLORS[s.phase];
      ctx.globalAlpha = s.phase === p.phase ? 0.95 : 0.3;
      ctx.fillRect(x0 + (s.t0 / end) * bw + 1, y - 3, ((s.t1 - s.t0) / end) * bw - 2, 6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.text;
    ctx.beginPath(); ctx.arc(x0 + (t / end) * bw, y, 5, 0, Math.PI * 2); ctx.fill();
  });
  // the time under the pointer, or null when it is off the bar
  const timeAt = (e: React.PointerEvent, anywhere = false): number | null => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const b = bar(r.width, r.height), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!anywhere && Math.abs(y - b.y) > b.grab) return null;
    return end * Math.max(0, Math.min(1, (x - b.x0) / (b.x1 - b.x0)));
  };
  const dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    const t = timeAt(e);
    if (t === null) return;
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    seek(t, true);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current) { seek(timeAt(e, true)!, true); return; }
    (e.target as HTMLElement).style.cursor = timeAt(e) === null ? 'default' : 'grab';
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    seek(timeAt(e, true)!, false);
  };
  return <canvas ref={ref} className="fill" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />;
}

/**
 * Swallow: the adult swallow and the infantile (atypical) one side by side,
 * on the same head and the same clock, silent. Play, pause, slow down.
 */
export function Swallow() {
  const L = useL();
  const clock = useRef<Clock>({ at: performance.now(), from: 0, playing: true, speed: 1 });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  // every change restarts the clock from the time it shows now
  const set = (o: Partial<Clock>) => {
    const now = performance.now();
    clock.current = { ...clock.current, from: clockTime(clock.current, now), at: now, ...o };
    setPlaying(clock.current.playing);
    setSpeed(clock.current.speed);
  };
  // the clock stands still at the dragged time while the bar is held, then plays on as it did before
  const wasPlaying = useRef(true);
  const dragHeld = useRef(false);
  const seek = (t: number, held: boolean) => {
    if (held && !dragHeld.current) wasPlaying.current = clock.current.playing;
    dragHeld.current = held;
    set({ from: t, playing: held ? false : wasPlaying.current });
  };
  return (
    <main className="swallow">
      <section className="swallow-stage">
        <div className="swallow-head ds-card"><SwallowHead seq={SWALLOWS.adult} name={{ it: 'Deglutizione adulta', en: 'Adult swallow' }} clock={clock} seek={seek} /></div>
        <div className="swallow-head ds-card"><SwallowHead seq={SWALLOWS.infant} name={{ it: 'Deglutizione infantile (atipica)', en: 'Infantile (atypical) swallow' }} clock={clock} seek={seek} /></div>
      </section>
      <section className="quick swallow-controls">
        <button className={playing ? 'btn on' : 'btn primary'} onClick={() => set({ playing: !playing })}>{playing ? '❚❚ ' + L({ it: 'Pausa', en: 'Pause' }) : '▶ ' + L({ it: 'Riproduci', en: 'Play' })}</button>
        <button className="btn" onClick={() => set({ from: 0 })}>↺ {L({ it: 'Dall’inizio', en: 'From the start' })}</button>
        <div className="seg" role="group" aria-label={L({ it: 'Velocità', en: 'Speed' })}>
          {SPEEDS.map(([s, name]) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => set({ speed: s })}>{name}</button>)}
        </div>
      </section>
    </main>
  );
}
