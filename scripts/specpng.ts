/**
 * Stacked spectrograms (0-8 kHz, 25 ms window) of one or more WAV files with
 * their YIN pitch track, written as a PNG, for side-by-side comparisons.
 *   npx tsx scripts/specpng.ts out.png a.wav b.wav ...
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodeWav } from '../src/dsp/util/wav';
import { powerSpectrum, hann } from '../src/dsp/util/fft';
import { yin } from '../src/dsp/analysis/pitch';

const [outPath, ...files] = process.argv.slice(2);
const PX_PER_S = 220, H = 220, FMAX = 8000, LABEL = 4;

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function png(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1); }
  const chunk = (type: string, data: Uint8Array) => {
    const b = new Uint8Array(12 + data.length);
    const v = new DataView(b.buffer);
    v.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
    b.set(data, 8);
    v.setUint32(8 + data.length, crc32(b.subarray(4, 8 + data.length)));
    return b;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const cmap = (v: number): [number, number, number] => {
  v = Math.max(0, Math.min(1, v));
  const stops: [number, number, number][] = [[8, 10, 30], [60, 20, 110], [180, 50, 90], [245, 150, 40], [255, 240, 180]];
  const x = v * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), t = x - i;
  return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * t) as [number, number, number];
};

const panels = files.map((f) => decodeWav(readFileSync(f)));
const W = Math.ceil(Math.max(...panels.map((p) => p.samples.length / p.fs)) * PX_PER_S);
const rows = panels.length * (H + LABEL);
const rgb = new Uint8Array(W * rows * 3);
panels.forEach(({ samples, fs }, pi) => {
  const win = Math.round(0.025 * fs);
  let nfft = 1; while (nfft < win) nfft *= 2;
  const w = hann(win);
  const cols: Float64Array[] = [];
  let mx = -Infinity;
  const ncol = Math.floor((samples.length / fs) * PX_PER_S);
  for (let c = 0; c < ncol; c++) {
    const s0 = Math.round((c / PX_PER_S) * fs) - win / 2;
    const fr = new Float64Array(win);
    for (let i = 0; i < win; i++) { const k = s0 + i; fr[i] = k >= 0 && k < samples.length ? samples[k] : 0; }
    const p = powerSpectrum(fr, nfft, w);
    const col = new Float64Array(H);
    for (let y = 0; y < H; y++) {
      const f = ((H - 1 - y) / (H - 1)) * FMAX;
      const k = Math.min(p.length - 1, Math.round((f / fs) * nfft));
      col[y] = 10 * Math.log10(p[k] + 1e-14);
      mx = Math.max(mx, col[y]);
    }
    cols.push(col);
  }
  const y0 = pi * (H + LABEL);
  cols.forEach((col, x) => {
    for (let y = 0; y < H; y++) {
      const [r, g, b] = cmap((col[y] - (mx - 75)) / 75);
      const o = ((y0 + y) * W + x) * 3; rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
    }
  });
  // pitch track (YIN, 40 ms frames) in cyan, on a 0-400 Hz scale over the bottom 40 % of the panel
  const fl = Math.round(0.04 * fs);
  for (let x = 0; x < ncol; x++) {
    const s0 = Math.round((x / PX_PER_S) * fs) - fl / 2;
    if (s0 < 0 || s0 + fl > samples.length) continue;
    const r = yin(samples.subarray(s0, s0 + fl), fs, 60, 450);
    if (r.confidence < 0.6 || r.f0 <= 0) continue;
    const y = Math.round(H - 1 - (r.f0 / 400) * H * 0.4);
    for (let d = 0; d < 2; d++) { const o = ((y0 + y + d) * W + x) * 3; rgb[o] = 40; rgb[o + 1] = 255; rgb[o + 2] = 255; }
  }
  // 1 kHz grid ticks on the left, 100 ms ticks on the bottom
  for (let f = 1000; f < FMAX; f += 1000) { const y = Math.round((1 - f / FMAX) * (H - 1)); for (let x = 0; x < 8; x++) { const o = ((y0 + y) * W + x) * 3; rgb[o] = rgb[o + 1] = rgb[o + 2] = 255; } }
  for (let t = 0; t * PX_PER_S < W; t += 0.1) { const x = Math.round(t * PX_PER_S); for (let y = H - 6; y < H; y++) { const o = ((y0 + y) * W + x) * 3; rgb[o] = rgb[o + 1] = rgb[o + 2] = 255; } }
});
writeFileSync(outPath, png(W, rows, rgb));
console.log(`${outPath}: ${W}x${rows}`);
