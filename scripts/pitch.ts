/**
 * YIN pitch track and level of WAV files, every 50 ms, and the spread of F0 in
 * semitones around the median: how wide and how lively a melody is.
 *   npx tsx scripts/pitch.ts a.wav b.wav
 */
import { readFileSync } from 'node:fs';
import { decodeWav } from '../src/dsp/util/wav';
import { yin } from '../src/dsp/analysis/pitch';

for (const file of process.argv.slice(2)) {
  const { samples, fs } = decodeWav(readFileSync(file));
  const n = Math.round(0.04 * fs), hop = Math.round(0.05 * fs);
  const track: string[] = [];
  const levels: string[] = [];
  const f0s: number[] = [];
  for (let s0 = 0; s0 + n < samples.length; s0 += hop) {
    const r = yin(samples.subarray(s0, s0 + n), fs, 60, 450);
    let e = 0; for (let i = 0; i < n; i++) e += samples[s0 + i] ** 2;
    const db = 10 * Math.log10(e / n + 1e-12);
    levels.push(db.toFixed(0));
    // near-silent frames (below -55 dB) give spurious periodicity
    const ok = r.confidence >= 0.85 && r.f0 > 0 && db > -55;
    track.push(ok ? r.f0.toFixed(0) : '.');
    if (ok) f0s.push(r.f0);
  }
  const b = [...f0s].sort((p, q) => p - q);
  const pct = (p: number) => b[Math.floor((b.length - 1) * p)];
  const st = (f: number) => (12 * Math.log2(f / pct(0.5))).toFixed(1);
  console.log(`${file.split(/[\\/]/).pop()}: median ${pct(0.5).toFixed(0)} Hz; 5/25/75/95 % at ${st(pct(0.05))} ${st(pct(0.25))} +${st(pct(0.75))} +${st(pct(0.95))} st`);
  console.log('  F0 ' + track.join(' '));
  console.log('  dB ' + levels.join(' '));
}
