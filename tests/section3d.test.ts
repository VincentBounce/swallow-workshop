import { describe, it, expect } from 'vitest';
import { computeGeometry, TractGeometry } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry, uniformTube, AreaFunction, N_SECTIONS } from '../src/dsp/tract/areaFunction';
import { formants, transferMagnitudes } from '../src/dsp/tract/acoustics';
import { lensSection, lensFromLaw, newLens, newSection } from '../src/dsp/tract/section3d';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, Anatomy } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { Waveguide } from '../src/dsp/tract/waveguide';
import { buildNasal, portArea } from '../src/dsp/tract/nasal';
import { getFFT } from '../src/dsp/util/fft';
import { C_SOUND } from '../src/dsp/constants';
import { note } from './helpers';

const geometryOf = (ph: string, anatomy: Anatomy = DEFAULT_ANATOMY): TractGeometry =>
  computeGeometry({ ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...PHONEMES[ph].art }, anatomy, DEFAULT_TEETH);
const tractOf = (ph: string, anatomy?: Anatomy): AreaFunction => sectionsFromGeometry(geometryOf(ph, anatomy));

/** The deepest dip (dB) of |H| with a side branch relative to |H| without it, and where it lies. */
function antiresonance(af: AreaFunction, without: object, f0: number, f1: number): { f: number; db: number } {
  const fr: number[] = [];
  for (let f = f0; f <= f1; f += 10) fr.push(f);
  const a = transferMagnitudes(af, fr, {}), b = transferMagnitudes(af, fr, without);
  let best = { f: 0, db: Infinity };
  for (let i = 0; i < fr.length; i++) {
    const db = 20 * Math.log10(a[i] / b[i]);
    if (db < best.db) best = { f: fr[i], db };
  }
  return best;
}

describe('three-dimensional cross-sections of the tract', () => {
  it('a flat passage has more wall than a round duct of the same area, and damps its resonances more', () => {
    const lens = lensFromLaw(1.6, 1.5, newLens());
    lens.half = 2;
    const sec = lensSection(0.1, lens, newSection());
    const round = 2 * Math.sqrt(Math.PI * sec.area);
    const tube = uniformTube(17.5, 3);
    const flat = { ...tube, shape: new Float64Array(N_SECTIONS).fill(3) };
    const b0 = formants(tube)[0].bw, b1 = formants(flat)[0].bw;
    note('flat passages', `a 1 mm high oral section has ${(sec.perimeter / round).toFixed(1)} times the wall of a round duct; three times the wall widens B1 of a 17.5 cm tube from ${b0.toFixed(0)} to ${b1.toFixed(0)} Hz`);
    expect(sec.perimeter / round).toBeGreaterThan(1.5);
    expect(b1).toBeGreaterThan(b0 * 1.2);
  });

  it('the hard palate and the teeth do not yield; the tongue, velum and pharynx do', () => {
    const g = geometryOf('i');
    let palate = 0, palateSoft = 0, pharynx = 0, pharynxSoft = 0;
    for (let i = 0; i <= g.lastRay; i++) {
      const h = g.hits[i];
      if (h.upId === 'palate' && h.lowId === 'tongue') { palate += h.perimeter; palateSoft += h.soft; }
      if (h.upId === 'wall' && h.lowId === 'tongue') { pharynx += h.perimeter; pharynxSoft += h.soft; }
    }
    note('yielding walls', `/i/: ${(100 * palateSoft / palate).toFixed(0)} % of the wall under the hard palate yields (the tongue), ${(100 * pharynxSoft / pharynx).toFixed(0)} % in the pharynx; the incisal slit ${g.slit.perimeter.toFixed(1)} cm of bone`);
    expect(palateSoft / palate).toBeLessThan(0.6);
    expect(pharynxSoft / pharynx).toBeGreaterThan(0.95);
    const s = geometryOf('s');
    for (let i = 0; i <= s.lastRay; i++) if (s.hits[i].upId === 'upperIncisor' && s.hits[i].lowId === 'lowerIncisor') expect(s.hits[i].soft).toBe(0);
  });

  it('the piriform fossae put an antiresonance at 4-5 kHz into every vowel; water in them raises it out of the way (Dang & Honda 1997)', () => {
    const rows: string[] = [];
    for (const v of ['a', 'i', 'u', 'ə']) {
      const z = antiresonance(tractOf(v), { piriform: false }, 3000, 6000);
      rows.push(`/${v}/ ${z.f} Hz ${z.db.toFixed(0)} dB`);
      expect(z.f).toBeGreaterThanOrEqual(4000);
      expect(z.f).toBeLessThanOrEqual(5000);
      expect(z.db).toBeLessThan(-10);
    }
    // half filled: the pouches are shorter and their antiresonance higher
    const half = antiresonance(tractOf('a', { ...DEFAULT_ANATOMY, piriform: 0.5 }), { piriform: false }, 3000, 9000);
    note('piriform fossae', `antiresonance ${rows.join(', ')}; half filled with water /a/ ${half.f} Hz`);
    expect(half.f).toBeGreaterThan(6000);
  });

  it('a lateral: the tip closes the midline, the air flows through channels beside the tongue, and the supralingual cavity adds an antiresonance at 2-5 kHz (Narayanan et al. 1997; Zhang & Espy-Wilson 2004)', () => {
    const rows: string[] = [];
    for (const ph of ['l', 'ɫ']) {
      const g = geometryOf(ph);
      let contact = false, lateral = 0;
      for (let i = 0; i <= g.lastRay; i++) {
        const h = g.hits[i];
        if (h.d <= 0 && h.lateral > 0) { contact = true; lateral = Math.max(lateral, h.lateral); }
      }
      const af = sectionsFromGeometry(g);
      const sl = af.supralingual!;
      let cavity = 0;
      for (const x of sl.areas) if (x > 1e-3) cavity += af.dx;
      const z = antiresonance(af, { supralingual: false }, 2000, 5000);
      rows.push(`/${ph}/ channels ${lateral.toFixed(2)} cm² beside the contact, cavity ${cavity.toFixed(1)} cm, antiresonance ${z.f} Hz (${z.db.toFixed(0)} dB)`);
      expect(contact).toBe(true);
      expect(lateral).toBeGreaterThan(0.1);
      expect(cavity).toBeGreaterThan(1.5);
      expect(cavity).toBeLessThan(4.5);
      expect(z.db).toBeLessThan(-10);
    }
    note('laterals', rows.join('; '));
    // a vowel has neither
    expect(tractOf('a').supralingual!.at).toBe(-1);
  });

  it('the waveguide gives the laterals of the reference, side branch included', () => {
    // Peaks and valleys that stand out by 3 dB or more in the lossy reference
    // spectrum. A pole that sits just above the cavity's zero can rise less than
    // that between two valleys (/l/: 3966 Hz, 2 dB): the waveguide's simpler
    // losses smooth it into the next peak, so it is not compared.
    const extrema = (fr: number[], db: number[]) => {
      const max: number[] = [], min: number[] = [];
      for (let i = 1; i < fr.length - 1; i++) {
        if (db[i] > db[i - 1] && db[i] >= db[i + 1]) max.push(i);
        if (db[i] < db[i - 1] && db[i] <= db[i + 1]) min.push(i);
      }
      return { max, min };
    };
    const prominent = (fr: number[], db: number[], at: number[], other: number[], sign: number) =>
      at.filter((i) => {
        const left = other.filter((j) => j < i).pop(), right = other.find((j) => j > i);
        const rise = Math.min(left === undefined ? Infinity : sign * (db[i] - db[left]), right === undefined ? Infinity : sign * (db[i] - db[right]));
        return rise >= 3;
      }).map((i) => fr[i]);
    const rows: string[] = [];
    let worst = 0;
    for (const ph of ['l', 'ɫ']) {
      const af = tractOf(ph);
      const fs = (N_SECTIONS * C_SOUND) / af.length;
      const port = portArea(0, 0, 1);
      const nasal = buildNasal(af.dx, 1, port, Math.round(0.43 * N_SECTIONS) - 1);
      const wg = new Waveguide(N_SECTIONS, nasal.areas.length, nasal.coupling);
      wg.setGeometry(af, nasal, fs, 1);
      wg.rg = 1;
      const n = 1 << 15;
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < n; i++) { wg.glottalInjection = i === 0 ? 1000 : 0; wg.step(); re[i] = wg.lipFlow + wg.nosFlow; }
      getFFT(n).transform(re, im);
      const wf: number[] = [], wdb: number[] = [];
      for (let k = 1; k < n / 2; k++) {
        const f = (k * fs) / n;
        if (f > 4600) break;
        if (f > 150) { wf.push(f); wdb.push(20 * Math.log10(Math.hypot(re[k], im[k]))); }
      }
      const w = extrema(wf, wdb);
      const fr: number[] = [];
      for (let f = 150; f <= 4600; f += 2) fr.push(f);
      const db = Array.from(transferMagnitudes(af, fr, { port, scale: 1 }), (x) => 20 * Math.log10(x));
      const r = extrema(fr, db);
      const peaks = prominent(fr, db, r.max, r.min, 1).filter((f) => f <= 4500);
      const valleys = prominent(fr, db, r.min, r.max, -1).filter((f) => f <= 4500);
      const near = (f: number, at: number[]) => Math.min(...at.map((i) => Math.abs(wf[i] / f - 1)));
      for (const f of peaks) worst = Math.max(worst, near(f, w.max));
      for (const f of valleys) worst = Math.max(worst, near(f, w.min));
      rows.push(`/${ph}/ peaks ${peaks.map((f) => f.toFixed(0)).join('/')}, valleys ${valleys.map((f) => f.toFixed(0)).join('/')} Hz`);
    }
    note('laterals, waveguide vs reference', `${rows.join('; ')}: worst difference ${(100 * worst).toFixed(1)} %`);
    expect(worst).toBeLessThan(0.02);
  });

  it('a geometry update fits in the real-time budget', () => {
    const arts = ['a', 'i', 'u', 'l', 's', 'ʃ', 'k'].map((p) => ({ ...DEFAULT_ARTICULATORS, ...PHONEMES[p].art }));
    let g: TractGeometry | undefined;
    let af: AreaFunction | undefined;
    for (let w = 0; w < 200; w++) { g = computeGeometry(arts[w % 7], DEFAULT_ANATOMY, DEFAULT_TEETH, { reuse: g }); af = sectionsFromGeometry(g, N_SECTIONS, af); }
    const N = 700;
    const t0 = performance.now();
    for (let w = 0; w < N; w++) {
      const a = { ...arts[w % 7], jaw: arts[w % 7].jaw + (w % 10) * 0.001 };
      g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH, { reuse: g });
      af = sectionsFromGeometry(g, N_SECTIONS, af);
    }
    const ms = (performance.now() - t0) / N;
    note('geometry cost', `${ms.toFixed(3)} ms per update (geometry and area function), at most one every 2.7 ms`);
    expect(ms).toBeLessThan(0.6);
  });
});
