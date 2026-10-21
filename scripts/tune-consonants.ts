/**
 * Adjusts one articulator of each consonant target by bisection so that the
 * narrowest passage reaches a target area (Stevens 1998: fricative
 * constrictions ~0.1-0.2 cm^2; approximants and laterals wider).
 *   npx tsx scripts/tune-consonants.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, Articulators } from '../src/dsp/tract/types';
import { CONSONANTS } from '../src/dsp/speech/phonemes';

interface Spec { ph: string; key: keyof Articulators; target: number; lo: number; hi: number; /** true if raising the key narrows */ narrowsUp: boolean }

const specs: Spec[] = [
  { ph: 's', key: 'tipY', target: 0.09, lo: 0.2, hi: 1.6, narrowsUp: true },
  { ph: 'ʃ', key: 'tipY', target: 0.2, lo: 0.6, hi: 2.0, narrowsUp: true },
  { ph: 'f', key: 'lipOpen', target: 0.12, lo: -0.3, hi: 0.6, narrowsUp: false },
  { ph: 'θ', key: 'tipY', target: 0.14, lo: -0.2, hi: 1.2, narrowsUp: true },
  { ph: 'l', key: 'tipY', target: 0.3, lo: 0.6, hi: 1.8, narrowsUp: true },
  { ph: 'r', key: 'tipY', target: 0.35, lo: 0.6, hi: 1.8, narrowsUp: true },
  { ph: 'j', key: 'tongueY', target: 0.22, lo: 0.5, hi: 1.6, narrowsUp: true },
  { ph: 'w', key: 'tongueY', target: 0.3, lo: 0.3, hi: 1.6, narrowsUp: true },
  { ph: 'ʎ', key: 'tongueY', target: 0.3, lo: 0.5, hi: 1.6, narrowsUp: true },
  { ph: 'ɹ', key: 'tipY', target: 0.35, lo: 0.4, hi: 1.8, narrowsUp: true },
];

function probe(a: Articulators): { area: number; fromLips: number; where: string } {
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  let m = Infinity, ms = 0, rule = '';
  for (let i = 0; i <= g.lastRay; i++) {
    if (g.s[i] < 2.6) continue;
    if (g.hits[i].area < m) { m = g.hits[i].area; ms = g.s[i]; rule = g.hits[i].rule; }
  }
  if (g.slit.area < m) { m = g.slit.area; ms = g.teethPos; rule = 'slit'; }
  return { area: m, fromLips: g.length - ms, where: rule };
}

const results: Record<string, number> = {};
for (const sp of specs) {
  const c = CONSONANTS[sp.ph];
  const base: Articulators = { ...DEFAULT_ARTICULATORS, jaw: 0.15, ...c.art };
  let lo = sp.lo, hi = sp.hi;
  const f = (x: number) => probe({ ...base, [sp.key]: x }).area;
  for (let it = 0; it < 40; it++) {
    const m = 0.5 * (lo + hi);
    const a = f(m);
    const tooNarrow = a < sp.target;
    if (sp.narrowsUp) { if (tooNarrow) hi = m; else lo = m; } else { if (tooNarrow) lo = m; else hi = m; }
  }
  const x = Math.round(0.5 * (lo + hi) * 1000) / 1000;
  const pr = probe({ ...base, [sp.key]: x });
  results[sp.ph] = x;
  console.log(`${sp.ph}: ${sp.key}=${x}  area ${pr.area.toFixed(3)} cm2  ${pr.fromLips.toFixed(2)} cm from lips (${pr.where})`);
}

if (process.argv.includes('--write')) {
  const path = new URL('../src/dsp/speech/phonemes.ts', import.meta.url);
  let src = readFileSync(path, 'utf-8');
  for (const sp of specs) {
    const re = new RegExp(`(C\\('${sp.ph}',[^\\n]*?${sp.key}: )(-?[0-9.]+)`, 'u');
    src = src.replace(re, `$1${results[sp.ph]}`);
    if (sp.ph === 's' || sp.ph === 'ʃ' || sp.ph === 'θ' || sp.ph === 'f') {
      const voiced = { s: 'z', 'ʃ': 'ʒ', 'θ': 'ð', f: 'v' }[sp.ph]!;
      const re2 = new RegExp(`(C\\('${voiced}',[^\\n]*?${sp.key}: )(-?[0-9.]+)`, 'u');
      src = src.replace(re2, `$1${results[sp.ph]}`);
    }
  }
  writeFileSync(path, src);
  console.log('updated');
}
