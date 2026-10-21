import { useEffect, useRef } from 'react';

export const C = {
  bg: '#0b0e14',
  panel: '#121722',
  grid: '#1f2735',
  grid2: '#2a3446',
  text: '#e7ebf3',
  muted: '#8792a6',
  amber: '#f6a823',
  amberSoft: 'rgba(246,168,35,0.25)',
  teal: '#2ad4bd',
  tealSoft: 'rgba(42,212,189,0.22)',
  violet: '#a98bfa',
  violetSoft: 'rgba(169,139,250,0.25)',
  rose: '#f7708a',
  sky: '#45b8f5',
  bone: '#d8d2c2',
  tooth: '#f4eedf',
  tissue: '#c86b7c',
  tongue: '#df6f87',
  lip: '#e07a8b',
  skin: '#2a2230',
};

export interface CanvasInfo { ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number; t: number; dt: number }

/**
 * Canvas sized to its container (device pixel ratio aware), redrawn every
 * animation frame while mounted. The draw callback receives CSS-pixel sizes.
 */
export function useAnimatedCanvas(draw: (c: CanvasInfo) => void, animate = true): React.RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      try { drawRef.current({ ctx, w, h, dpr, t: now / 1000, dt }); } catch (e) { console.error(e); }
      if (animate) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [animate]);
  return ref;
}

/** Perceptual-ish colour map (dark blue -> violet -> amber -> pale yellow), v in 0..1. */
export function heat(v: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, v));
  const stops: [number, number, number, number][] = [
    [0.0, 9, 11, 20], [0.18, 38, 22, 78], [0.38, 108, 38, 132], [0.58, 196, 66, 98], [0.78, 246, 146, 40], [1.0, 252, 240, 170],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const t = (x - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  return [252, 240, 170];
}

/** Colour of the sound field inside the tract: teal (low) to amber (high). */
export function fieldColor(v: number, alpha = 1): string {
  const x = Math.max(0, Math.min(1, v));
  const a: [number, number, number] = [16, 60, 80], b: [number, number, number] = [42, 212, 189], c: [number, number, number] = [246, 168, 35], d: [number, number, number] = [255, 236, 190];
  let r: number, g: number, bl: number;
  if (x < 0.4) { const t = x / 0.4; r = a[0] + (b[0] - a[0]) * t; g = a[1] + (b[1] - a[1]) * t; bl = a[2] + (b[2] - a[2]) * t; }
  else if (x < 0.8) { const t = (x - 0.4) / 0.4; r = b[0] + (c[0] - b[0]) * t; g = b[1] + (c[1] - b[1]) * t; bl = b[2] + (c[2] - b[2]) * t; }
  else { const t = (x - 0.8) / 0.2; r = c[0] + (d[0] - c[0]) * t; g = c[1] + (d[1] - c[1]) * t; bl = c[2] + (d[2] - c[2]) * t; }
  return `rgba(${r | 0},${g | 0},${bl | 0},${alpha})`;
}

export function noteName(f: number): string {
  if (!(f > 0)) return '–';
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = Math.round(69 + 12 * Math.log2(f / 440));
  return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

export function fmtHz(f: number): string { return f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 1) + ' kHz' : Math.round(f) + ' Hz'; }

/** Draws a rounded label box with text. */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, bg = 'rgba(11,14,20,0.75)', align: CanvasTextAlign = 'center'): void {
  ctx.font = '600 11px system-ui, sans-serif';
  const m = ctx.measureText(text);
  const w = m.width + 10, h = 17;
  let x0 = x - w / 2;
  if (align === 'left') x0 = x;
  else if (align === 'right') x0 = x - w;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x0, y - h / 2, w, h, 5);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + w / 2, y + 0.5);
}
