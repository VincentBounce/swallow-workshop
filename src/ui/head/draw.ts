/**
 * The head drawn on a canvas for one posture: the background, the painted
 * head (or the plain drawing while the painting loads), the air coloured by
 * the sound field and the rim. The head view adds its handles and the moving
 * air on top; the swallow view draws two of these side by side.
 */
import { C, fieldColor } from '../canvas';
import type { FieldMode } from '../store';
import { canonToWorld, TractGeometry, Solid } from '../../dsp/tract/geometry';
import { Anatomy, Articulators, Teeth } from '../../dsp/tract/types';
import { N_SECTIONS } from '../../dsp/tract/areaFunction';
import type { Telemetry } from '../../dsp/engine/engine';
import { HEAD_BACK, HEAD_FRONT_UP, CHIN, NASAL_CENTRE, NASAL_HALF, chinWeight } from './outline';
import { headScene, mul, Mat, HeadScene } from './scene';
import { getBackdrop, paintBackdrop, paintSoftParts, paintRim, paintGlow, fadeNeck } from './painter';

/** What the head shows: the geometry computed from the same anatomy, articulators and teeth. */
export interface HeadPosture { geom: TractGeometry; an: Anatomy; a: Articulators; teeth: Teeth }

/** Where the world (cm) sits on the canvas (CSS pixels): x' = ox + x k, y' = oy - y k. */
export interface HeadViewport { ox: number; oy: number; k: number }

/** The fixed frame of a w x h canvas (for a man's head, so a child's head looks smaller); a tall canvas shows the whole head. */
export function headViewport(w: number, h: number): HeadViewport {
  const X0 = -5.4, X1 = 11.8, Y0 = -3.4;
  let Y1 = 16.8;
  if (h / w > (Y1 - Y0) / (X1 - X0)) Y1 = Math.min(19.9, Y0 + (h / w) * (X1 - X0));
  const k = Math.min(w / (X1 - X0), h / (Y1 - Y0));
  return { ox: (w - (X1 - X0) * k) / 2 - X0 * k, oy: h - ((h - (Y1 - Y0) * k) / 2) + Y0 * k, k };
}

/** The painted head on a layer of its own, painted again only when the posture or the canvas changes. */
export interface HeadLayer { cv: HTMLCanvasElement; key: string; sc: HeadScene | null }
export const newHeadLayer = (): HeadLayer => ({ cv: document.createElement('canvas'), key: '', sc: null });

/** What sounds, for the colours: the field to show and the telemetry (null when silent). */
export interface HeadSound { field: FieldMode; tel: Telemetry | null }

/** Draws the head of posture `p` over the whole w x h canvas (CSS pixels, at `dpr`). */
export function drawHead(
  ctx: CanvasRenderingContext2D, layer: HeadLayer, p: HeadPosture, vp: HeadViewport, w: number, h: number, dpr: number, sound: HeadSound,
): void {
  const { geom, an, a } = p;
  const { ox, oy, k } = vp;
  const { field, tel } = sound;
  const s = an.scale * 0.9;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy - y * k;
  const path = (pts: number[], close = true) => {
    ctx.beginPath();
    ctx.moveTo(X(pts[0]), Y(pts[1]));
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(X(pts[i]), Y(pts[i + 1]));
    if (close) ctx.closePath();
  };

  // background
  const bg = ctx.createRadialGradient(w * 0.55, h * 0.45, 10, w * 0.55, h * 0.45, Math.max(w, h) * 0.75);
  bg.addColorStop(0, '#141a26');
  bg.addColorStop(1, C.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const nasalFlow = tel ? Math.min(1, Math.abs(tel.uNose) / 250) : 0;
  const port = tel ? tel.nasalPort : 0;
  const bd = getBackdrop();
  if (!bd) {
    paintFlat(ctx, geom, an, a, X, Y, path, k, s, field, tel, canonToWorld(NASAL_CENTRE, an, a), port, nasalFlow);
    return;
  }
  // the painted head, with everything that bounds the air drawn from the geometry
  const world: Mat = mul([dpr, 0, 0, dpr, 0, 0], [k, 0, 0, -k, ox, oy]);
  const key = JSON.stringify([w, h, dpr, ox, oy, k, a, an, p.teeth]);
  if (layer.key !== key || !layer.sc) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (layer.cv.width !== cw || layer.cv.height !== ch) { layer.cv.width = cw; layer.cv.height = ch; }
    const lc = layer.cv.getContext('2d')!;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, cw, ch);
    layer.sc = headScene(geom, an, a);
    paintBackdrop(lc, layer.sc, world, bd);
    paintSoftParts(lc, layer.sc, world, bd);
    fadeNeck(lc, layer.sc, world);
    // the crown fades into the top edge instead of being cut by it
    const top = lc.createLinearGradient(0, 0, 0, 36 * dpr);
    top.addColorStop(0, 'rgba(0,0,0,1)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    lc.globalCompositeOperation = 'destination-out';
    lc.fillStyle = top;
    lc.fillRect(0, 0, cw, 36 * dpr);
    lc.globalCompositeOperation = 'source-over';
    layer.key = key;
  }
  const sc = layer.sc;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.cv, 0, 0);
  paintGlow(ctx, sc, world, port > 0.02 ? Math.min(1, port / 1.2) * (0.35 + 0.65 * nasalFlow) : 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the opening between the lips is air too, as dark as silent air
  if (sc.mouth.length) {
    path(sc.mouth);
    ctx.fillStyle = '#05070c';
    ctx.fill();
    ctx.fillStyle = fieldColor(0.12, 0.28);
    ctx.fill();
  }
  drawChannel(ctx, geom, X, Y, field, tel);
  paintRim(ctx, sc, world);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** The plain drawing, while the painted head loads (or if it cannot). */
function paintFlat(
  ctx: CanvasRenderingContext2D, geom: TractGeometry, an: Anatomy, a: Articulators, X: (x: number) => number, Y: (y: number) => number,
  path: (pts: number[], close?: boolean) => void, k: number, s: number, field: FieldMode, tel: Telemetry | null, nc: number[], port: number, nasalFlow: number,
): void {
  // head silhouette
  const back = canonToWorld(HEAD_BACK, { ...an, pharynx: 1 }, { ...a, larynx: 0 });
  const frontUp = canonToWorld(HEAD_FRONT_UP, an, a);
  const chin = canonToWorld(CHIN, { ...an, pharynx: 1 }, { ...a, larynx: 0 }, chinWeight);
  const silhouette = [...back, ...frontUp, ...chin];
  const sk = ctx.createLinearGradient(X(-5), 0, X(10), 0);
  sk.addColorStop(0, '#1a1622');
  sk.addColorStop(0.6, '#2a2130');
  sk.addColorStop(1, '#3a2836');
  path(silhouette);
  ctx.fillStyle = sk;
  ctx.fill();
  ctx.strokeStyle = 'rgba(247,112,138,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // eye and ear (decorative)
  const eye = canonToWorld([7.4, 15.9], an, a);
  ctx.strokeStyle = 'rgba(231,235,243,0.25)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(X(eye[0]), Y(eye[1]), 0.55 * k * s, 0.22 * k * s, 0, Math.PI * 0.05, Math.PI * 0.95);
  ctx.stroke();
  const ear = canonToWorld([-2.6, 13.4], an, a);
  ctx.beginPath();
  ctx.ellipse(X(ear[0]), Y(ear[1]), 0.9 * k * s, 1.5 * k * s, -0.15, 0, Math.PI * 2);
  ctx.stroke();

  // vertebrae (decorative)
  ctx.fillStyle = 'rgba(216,210,194,0.07)';
  for (let i = 0; i < 6; i++) {
    const v = canonToWorld([-2.9, -2.6 + i * 1.9, -1.7, -1.1 + i * 1.9], an, a);
    ctx.beginPath();
    ctx.roundRect(X(v[0]), Y(v[3]), (v[2] - v[0]) * k, (v[3] - v[1]) * k, 4);
    ctx.fill();
  }

  // nasal cavity
  const up: number[] = [], lo: number[] = [];
  for (let i = 0; i < NASAL_HALF.length; i++) {
    const j = Math.min(NASAL_HALF.length - 2, i);
    const dx = nc[2 * j + 2] - nc[2 * j], dy = nc[2 * j + 3] - nc[2 * j + 1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const hw = NASAL_HALF[i] * s;
    up.push(nc[2 * i] + nx * hw, nc[2 * i + 1] + ny * hw);
    lo.unshift(nc[2 * i + 1] - ny * hw);
    lo.unshift(nc[2 * i] - nx * hw);
  }
  path([...up, ...lo]);
  ctx.fillStyle = '#06080d';
  ctx.fill();
  if (port > 0.02) {
    ctx.fillStyle = `rgba(42,212,189,${0.1 + 0.45 * Math.min(1, port / 1.2) * (0.35 + 0.65 * nasalFlow)})`;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(200,107,124,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // turbinates
  ctx.strokeStyle = 'rgba(200,107,124,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const c0 = canonToWorld([3.0 + i * 1.6, 12.95 + 0.05 * i], an, a);
    ctx.beginPath();
    ctx.ellipse(X(c0[0]), Y(c0[1]), 0.75 * k * s, 0.16 * k * s, 0.06, 0, Math.PI * 2);
    ctx.stroke();
  }

  // vocal tract air channel coloured by the sound field
  drawChannel(ctx, geom, X, Y, field, tel);

  // solids (the soft tissue behind and below the tract is clipped to the head)
  for (const sol of geom.solids) {
    const soft = sol.id === 'wall' || sol.id === 'larynx' || sol.id === 'floor';
    if (soft) { ctx.save(); path(silhouette); ctx.clip(); }
    drawSolid(ctx, sol, path, X, s);
    if (soft) ctx.restore();
  }
}

function drawSolid(ctx: CanvasRenderingContext2D, sol: Solid, path: (pts: number[], close?: boolean) => void, X: (x: number) => number, s: number): void {
  const pts = sol.pts;
  path(pts);
  switch (sol.id) {
    case 'tongue': {
      const g = ctx.createLinearGradient(X(sol.minX), 0, X(sol.maxX), 0);
      g.addColorStop(0, '#f08aa0'); g.addColorStop(1, '#a8445e');
      ctx.fillStyle = g; break;
    }
    case 'upperIncisor': case 'lowerIncisor': ctx.fillStyle = C.tooth; break;
    case 'palate': ctx.fillStyle = '#cdbfa6'; break;
    case 'velum': ctx.fillStyle = '#c4687d'; break;
    case 'upperLip': case 'lowerLip': ctx.fillStyle = C.lip; break;
    case 'wall': {
      const g = ctx.createLinearGradient(X(-2.4 * s), 0, X(-0.45 * s), 0);
      g.addColorStop(0, 'rgba(120,60,80,0)'); g.addColorStop(0.55, 'rgba(150,72,94,0.35)'); g.addColorStop(1, '#a24f66');
      ctx.fillStyle = g; break;
    }
    case 'larynx': {
      const g = ctx.createLinearGradient(X(0.4 * s), 0, X(2.6 * s), 0);
      g.addColorStop(0, '#a24f66'); g.addColorStop(1, 'rgba(120,60,80,0)');
      ctx.fillStyle = g; break;
    }
    case 'floor': ctx.fillStyle = 'rgba(147,72,92,0.75)'; break;
  }
  ctx.fill();
  if (sol.id === 'upperIncisor' || sol.id === 'lowerIncisor') { ctx.strokeStyle = '#b9b09b'; ctx.lineWidth = 1; ctx.stroke(); }
  else if (sol.id === 'tongue' || sol.id === 'upperLip' || sol.id === 'lowerLip' || sol.id === 'velum') { ctx.strokeStyle = 'rgba(255,220,225,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
}

export function rayPoints(geom: TractGeometry, i: number): [number, number, number, number] {
  const r = geom.rays[i], h = geom.hits[i];
  return [r.sx + r.nx * (r.t0 + h.tLow), r.sy + r.ny * (r.t0 + h.tLow), r.sx + r.nx * (r.t0 + h.tUp), r.sy + r.ny * (r.t0 + h.tUp)];
}

function drawChannel(ctx: CanvasRenderingContext2D, geom: TractGeometry, X: (x: number) => number, Y: (y: number) => number, mode: FieldMode, tel: Telemetry | null): void {
  const n = geom.lastRay;
  // dark air first
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const q = rayPoints(geom, i); if (i === 0) ctx.moveTo(X(q[0]), Y(q[1])); else ctx.lineTo(X(q[0]), Y(q[1])); }
  for (let i = n; i >= 0; i--) { const q = rayPoints(geom, i); ctx.lineTo(X(q[2]), Y(q[3])); }
  ctx.closePath();
  ctx.fillStyle = '#05070c';
  ctx.fill();
  const L = geom.length;
  for (let i = 0; i < n; i++) {
    const h = geom.hits[i], h2 = geom.hits[i + 1];
    if (h.d <= 0 && h2.d <= 0) continue;
    const k = Math.max(0, Math.min(N_SECTIONS - 1, Math.floor((geom.s[i] / L) * N_SECTIONS)));
    // silent air stays dark, with a hint of the field's colour
    let v = 0.12;
    let alpha = 0.28;
    if (tel) {
      if (mode === 'pressure') v = tel.pRms[k];
      else if (mode === 'velocity') v = tel.uRms[k];
      else {
        const u = k <= tel.constrictionIndex ? tel.ug : tel.uMouth;
        const vel = u / Math.max(h.area, 0.02);
        v = Math.min(1, Math.log10(1 + vel / 30) / 2.3);
      }
      alpha = 0.85;
    }
    const a = rayPoints(geom, i), b = rayPoints(geom, i + 1);
    ctx.beginPath();
    ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(a[2]), Y(a[3])); ctx.lineTo(X(b[2]), Y(b[3])); ctx.lineTo(X(b[0]), Y(b[1]));
    ctx.closePath();
    ctx.fillStyle = fieldColor(v, alpha);
    ctx.fill();
  }
}
