/**
 * The guide image for the illustrated head: the canonical head at rest (the
 * silhouette, every solid that bounds the airway, the airway and the nasal
 * cavity) drawn in the fixed frame the backdrop is registered in, as SVG and
 * HTML. A headless browser turns the HTML into the PNG given to the image
 * generator.
 * The pharynx wall, the larynx and the floor of the mouth are solids only
 * where they face the air, so they are left out unless --solids is given.
 *   npx tsx scripts/head-guide.ts out-dir [--grid] [--solids]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeGeometry, canonToWorld, CANON_SCALE } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { HEAD_BACK, HEAD_FRONT_UP, CHIN, NASAL_CENTRE, NASAL_HALF, chinWeight, smoothOutline } from '../src/ui/head/outline';
import { BACKDROP_FRAME } from '../src/ui/head/frame';

const dir = process.argv[2] ?? 'head-guide';
const grid = process.argv.includes('--grid');
const allSolids = process.argv.includes('--solids');
mkdirSync(dir, { recursive: true });

const an = DEFAULT_ANATOMY, a = DEFAULT_ARTICULATORS;
const g = computeGeometry(a, an, DEFAULT_TEETH);
const { x0, x1, y0, y1, width, height } = BACKDROP_FRAME;
const k = width / (x1 - x0);
// canonical coordinates: the default speaker has no pharynx stretch, so world = canonical x CANON_SCALE
const X = (x: number) => ((x / CANON_SCALE - x0) * k).toFixed(1);
const Y = (y: number) => ((y1 - y / CANON_SCALE) * k).toFixed(1);
const poly = (pts: number[]) => pts.reduce((s, v, i) => s + (i % 2 ? `${Y(v)} ` : `${X(v)},`), '');

const back = canonToWorld(HEAD_BACK, { ...an, pharynx: 1 }, { ...a, larynx: 0 });
const front = canonToWorld(HEAD_FRONT_UP, an, a);
const chin = canonToWorld(CHIN, { ...an, pharynx: 1 }, { ...a, larynx: 0 }, chinWeight);
const parts: string[] = [];
parts.push(`<rect width="${width}" height="${height}" fill="#0b0e14"/>`);
parts.push(`<polygon points="${poly(smoothOutline([...back, ...front, ...chin]))}" fill="#d9a48f"/>`);

// nasal cavity
const nc = canonToWorld(NASAL_CENTRE, an, a);
const up: number[] = [], lo: number[] = [];
for (let i = 0; i < NASAL_HALF.length; i++) {
  const j = Math.min(NASAL_HALF.length - 2, i);
  const dx = nc[2 * j + 2] - nc[2 * j], dy = nc[2 * j + 3] - nc[2 * j + 1];
  const L = Math.hypot(dx, dy) || 1;
  const hw = NASAL_HALF[i] * CANON_SCALE;
  up.push(nc[2 * i] - (dy / L) * hw, nc[2 * i + 1] + (dx / L) * hw);
  lo.unshift(nc[2 * i + 1] - (dx / L) * hw);
  lo.unshift(nc[2 * i] + (dy / L) * hw);
}
parts.push(`<polygon points="${poly([...up, ...lo])}" fill="#3a1820"/>`);

// airway
const n = g.lastRay;
const edge = (i: number, upper: boolean) => {
  const r = g.rays[i], h = g.hits[i], t = r.t0 + (upper ? h.tUp : h.tLow);
  return [r.sx + r.nx * t, r.sy + r.ny * t];
};
const air: number[] = [];
for (let i = 0; i <= n; i++) air.push(...edge(i, false));
for (let i = n; i >= 0; i--) air.push(...edge(i, true));
parts.push(`<polygon points="${poly(air)}" fill="#120a0e"/>`);

const colour: Record<string, string> = {
  tongue: '#d0607a', palate: '#efe3c8', velum: '#c4687d', upperIncisor: '#f6f2e6', lowerIncisor: '#f6f2e6',
  upperLip: '#c9667a', lowerLip: '#c9667a', wall: '#a24f66', larynx: '#b35c72', floor: '#93485c',
};
for (const s of g.solids) if (allSolids || (s.id !== 'wall' && s.id !== 'larynx' && s.id !== 'floor')) parts.push(`<polygon points="${poly(s.pts)}" fill="${colour[s.id] ?? '#888'}" ${s.id === 'wall' || s.id === 'floor' ? 'opacity="0.8"' : ''}/>`);

if (grid) {
  for (let x = Math.ceil(x0); x <= x1; x++) parts.push(`<line x1="${X(x * CANON_SCALE)}" y1="0" x2="${X(x * CANON_SCALE)}" y2="${height}" stroke="${x % 5 ? '#ffffff22' : '#ffffff66'}"/>`);
  for (let y = Math.ceil(y0); y <= y1; y++) parts.push(`<line x1="0" y1="${Y(y * CANON_SCALE)}" x2="${width}" y2="${Y(y * CANON_SCALE)}" stroke="${y % 5 ? '#ffffff22' : '#ffffff66'}"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
writeFileSync(join(dir, 'guide.svg'), svg);
writeFileSync(join(dir, 'guide.html'), `<!doctype html><html><body style="margin:0;background:#0b0e14">${svg}</body></html>`);
console.log(`wrote ${join(dir, 'guide.svg')} and guide.html (${width}x${height})`);
