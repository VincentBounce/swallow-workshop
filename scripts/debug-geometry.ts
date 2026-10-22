/**
 * Debug helper: renders the mid-sagittal geometry, grid lines and area
 * functions of a few articulator settings to an HTML file.
 *   npx tsx scripts/debug-geometry.ts out.html [i,a,u:tipY=0.5] [front]
 */
import { writeFileSync } from 'node:fs';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry } from '../src/dsp/tract/areaFunction';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, Articulators } from '../src/dsp/tract/types';
import { formants } from '../src/dsp/tract/acoustics';
import { PHONEMES } from '../src/dsp/speech/phonemes';

const out = process.argv[2] ?? 'geometry.html';
const names = (process.argv[3] ?? 'ə,i,a,u,s,ʃ,f,t,k,m').split(',');
const zoom = process.argv[4] === 'front';

function svgFor(name: string, a: Articulators): string {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const af = sectionsFromGeometry(g);
  let fm = '';
  try {
    const f = formants(af, { velum: a.velum });
    fm = f.slice(0, 4).map((x) => x.f.toFixed(0)).join(' / ');
  } catch (e) { fm = String(e); }
  const W = zoom ? 560 : 420, H = 420;
  const sx = zoom ? (x: number) => (x - 4.3) * 125 : (x: number) => 40 + (x + 2) * 32;
  const sy = zoom ? (y: number) => H - (y - 6.6) * 125 : (y: number) => H - 20 - (y + 1) * 30;
  const parts: string[] = [];
  for (const sol of g.solids) {
    const pts: string[] = [];
    for (let i = 0; i < sol.pts.length; i += 2) pts.push(`${sx(sol.pts[i]).toFixed(1)},${sy(sol.pts[i + 1]).toFixed(1)}`);
    parts.push(`<polygon points="${pts.join(' ')}" fill="${sol.upper ? '#5a6b8a' : '#c97a6b'}" fill-opacity="0.45" stroke="#222" stroke-width="0.6"/>`);
  }
  g.rays.forEach((r, i) => {
    const h = g.hits[i];
    if (h.outside || i > g.lastRay) return;
    const t0 = r.t0 + h.tLow, t1 = r.t0 + h.tUp;
    const x0 = r.sx + r.nx * t0, y0 = r.sy + r.ny * t0, x1 = r.sx + r.nx * t1, y1 = r.sy + r.ny * t1;
    const col = h.rule === 'teeth' ? '#e33' : h.rule === 'lips' ? '#3a3' : h.rule === 'labiodental' ? '#a3a' : h.rule === 'closed' ? '#000' : '#36c';
    parts.push(`<line x1="${sx(x0)}" y1="${sy(y0)}" x2="${sx(x1)}" y2="${sy(y1)}" stroke="${col}" stroke-width="1"/>`);
    if (zoom && i % 3 === 0) parts.push(`<text x="${sx(x1) + 2}" y="${sy(y1) - 2}" font-size="8" fill="#333">${h.area.toFixed(2)}</text>`);
  });
  // area function plot
  const bars: string[] = [];
  const bw = 400 / af.areas.length;
  af.areas.forEach((A, k) => {
    const h = Math.min(120, A * 15);
    bars.push(`<rect x="${10 + k * bw}" y="${140 - h}" width="${bw - 1}" height="${h}" fill="${k === af.teethIndex ? '#e33' : '#36c'}"/>`);
  });
  return `<div style="display:inline-block;margin:6px;border:1px solid #ccc;font:12px sans-serif">
  <div><b>${name}</b> L=${g.length.toFixed(2)} cm, F=${fm}, slit h=${g.slit.height.toFixed(3)} A=${g.slit.area.toFixed(3)} lip=${g.lipArea.toFixed(2)}</div>
  <svg width="${W}" height="${H}">${parts.join('')}</svg>
  <svg width="420" height="150">${bars.join('')}<text x="10" y="148" font-size="10">areas (15 px/cm2), min=${Math.min(...af.areas).toFixed(3)}</text></svg>
  </div>`;
}

const htmlParts: string[] = [];
for (const n of names) {
  // a phoneme, optionally with articulators changed: i:tipY=0.5:tongueY=1
  const [base, ...set] = n.split(':');
  const a: Articulators = { ...DEFAULT_ARTICULATORS, ...(PHONEMES[base]?.art ?? {}) };
  for (const kv of set) { const [k, v] = kv.split('='); (a as unknown as Record<string, number>)[k] = +v; }
  htmlParts.push(svgFor(n, a));
}
writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#fff">${htmlParts.join('\n')}</body></html>`);
console.log('wrote', out);
