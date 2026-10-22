import { useRef, useState } from 'react';
import { store } from '../store';
import { voice } from '../voice/voice';
import { useManual } from '../voice/hooks';
import { useL } from '../i18n';
import { useAnimatedCanvas, C, label } from '../canvas';
import { VOWELS } from '../../dsp/speech/phonemes';
import { PETERSON_BARNEY, HILLENBRAND_MEN, VIDEO_VOICE, Speaker, VowelRef } from '../../dsp/data/vowels';
import { computeGeometry } from '../../dsp/tract/geometry';
import { sectionsFromGeometry } from '../../dsp/tract/areaFunction';
import { formants } from '../../dsp/tract/acoustics';
import { Articulators, ARTICULATOR_KEYS, DEFAULT_ARTICULATORS } from '../../dsp/tract/types';
import { analyseMic } from '../analysis';

type RefSet = 'pb-men' | 'pb-women' | 'pb-children' | 'hillenbrand' | 'video';

const F2_MIN = 550, F2_MAX = 3300, F1_MIN = 180, F1_MAX = 1100;

let modelKey = '';
let modelCache: { ipa: string; f1: number; f2: number; art: Articulators }[] = [];

/** Formants of the articulatory vowel targets for the current speaker. */
function modelVowels(): { ipa: string; f1: number; f2: number; art: Articulators }[] {
  const p = voice.sounding();
  const key = JSON.stringify(p.anatomy) + JSON.stringify(p.teeth) + p.articulators.larynx;
  if (key === modelKey) return modelCache;
  modelKey = key;
  modelCache = Object.keys(VOWELS).map((ipa) => {
    const art = { ...DEFAULT_ARTICULATORS, ...VOWELS[ipa].art, larynx: p.articulators.larynx };
    const g = computeGeometry(art, p.anatomy, p.teeth);
    const f = formants(sectionsFromGeometry(g), { scale: p.anatomy.scale }, 4000, 30);
    return { ipa, f1: f[0]?.f ?? 0, f2: f[1]?.f ?? 0, art };
  });
  return modelCache;
}

/**
 * The F1-F2 vowel map. Click a vowel to move the tongue, jaw and lips there;
 * drag across the map to glide between vowels (the articulators are blended
 * from the nearest vowel targets). The teal dot is where the current tract
 * shape sits; the blue dot is your microphone.
 */
export function VowelChart() {
  const L = useL();
  useManual();
  const [refSet, setRefSet] = useState<RefSet>('pb-men');
  const trail = useRef<{ f1: number; f2: number }[]>([]);
  const micTrail = useRef<{ f1: number; f2: number }[]>([]);
  const micBuf = useRef<Float32Array | null>(null);
  const micT = useRef(0);
  const dragging = useRef(false);
  const geo = useRef({ x0: 0, y0: 0, x1: 1, y1: 1 });
  const target = useRef<{ f1: number; f2: number } | null>(null);

  const ref = useAnimatedCanvas(({ ctx, w, h, dt }) => {
    const padL = 44, padB = 30, padT = 14, padR = 14;
    const x0 = padL, x1 = w - padR, y0 = padT, y1 = h - padB;
    geo.current = { x0, y0, x1, y1 };
    const lx = (f2: number) => x0 + ((Math.log(F2_MAX) - Math.log(f2)) / (Math.log(F2_MAX) - Math.log(F2_MIN))) * (x1 - x0);
    const ly = (f1: number) => y0 + ((Math.log(f1) - Math.log(F1_MIN)) / (Math.log(F1_MAX) - Math.log(F1_MIN))) * (y1 - y0);
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.fillStyle = C.muted; ctx.font = '10px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const f of [600, 800, 1000, 1500, 2000, 2500, 3000]) { ctx.beginPath(); ctx.moveTo(lx(f), y0); ctx.lineTo(lx(f), y1); ctx.stroke(); ctx.fillText(String(f), lx(f), y1 + 4); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const f of [200, 300, 400, 500, 600, 800, 1000]) { ctx.beginPath(); ctx.moveTo(x0, ly(f)); ctx.lineTo(x1, ly(f)); ctx.stroke(); ctx.fillText(String(f), x0 - 5, ly(f)); }
    ctx.textAlign = 'center';
    ctx.fillText(L({ it: 'F2 (Hz) — lingua avanti ←   → indietro', en: 'F2 (Hz) — tongue front ←   → back' }), (x0 + x1) / 2, h - 8);
    ctx.save(); ctx.translate(11, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(L({ it: 'F1 (Hz) — bocca chiusa ↔ aperta', en: 'F1 (Hz) — mouth closed ↔ open' }), 0, 0); ctx.restore();

    // reference set
    let refs: VowelRef[];
    if (refSet.startsWith('pb-')) refs = PETERSON_BARNEY[refSet.slice(3) as Speaker];
    else if (refSet === 'hillenbrand') refs = HILLENBRAND_MEN;
    else refs = VIDEO_VOICE;
    ctx.font = '600 13px system-ui';
    for (const r of refs) {
      const x = lx(r.f2), y = ly(r.f1);
      ctx.fillStyle = 'rgba(169,139,250,0.18)';
      ctx.beginPath(); ctx.ellipse(x, y, 22, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(169,139,250,0.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(r.ipa, x, y);
      ctx.font = '9px system-ui'; ctx.fillStyle = 'rgba(169,139,250,0.6)';
      ctx.fillText(r.word, x, y + 13);
      ctx.font = '600 13px system-ui';
    }
    // model vowels (clickable)
    for (const v of modelVowels()) {
      if (!v.f1 || !v.f2) continue;
      const x = lx(v.f2), y = ly(v.f1);
      ctx.fillStyle = 'rgba(11,14,20,0.8)';
      ctx.strokeStyle = C.teal; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.teal; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(v.ipa, x, y + 0.5);
    }
    // target crosshair
    if (target.current) {
      const x = lx(target.current.f2), y = ly(target.current.f1);
      ctx.strokeStyle = 'rgba(231,235,243,0.6)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14); ctx.stroke(); ctx.setLineDash([]);
    }
    // current formants with trail
    const fm = store.derived().formants;
    if (fm.length >= 2) {
      const tr = trail.current;
      tr.push({ f1: fm[0].f, f2: fm[1].f });
      if (tr.length > 90) tr.shift();
      for (let i = 1; i < tr.length; i++) {
        ctx.strokeStyle = `rgba(246,168,35,${(i / tr.length) * 0.7})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lx(tr[i - 1].f2), ly(tr[i - 1].f1)); ctx.lineTo(lx(tr[i].f2), ly(tr[i].f1)); ctx.stroke();
      }
      const x = lx(fm[1].f), y = ly(fm[0].f);
      const g = ctx.createRadialGradient(x, y, 1, x, y, 16);
      g.addColorStop(0, 'rgba(246,168,35,0.95)'); g.addColorStop(1, 'rgba(246,168,35,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      label(ctx, `F1 ${Math.round(fm[0].f)} · F2 ${Math.round(fm[1].f)}`, Math.min(x1 - 60, Math.max(x0 + 60, x)), Math.max(y0 + 10, y - 22), C.amber);
    }
    // microphone
    const an = voice.micAnalyser;
    if (store.ui.micOn && an) {
      micT.current += dt;
      if (micT.current > 0.06) {
        micT.current = 0;
        if (!micBuf.current || micBuf.current.length !== an.fftSize) micBuf.current = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(micBuf.current as Float32Array<ArrayBuffer>);
        const r = analyseMic(micBuf.current, voice.sampleRate);
        if (r && r.f1 > F1_MIN && r.f2 > F2_MIN && r.f2 < F2_MAX) { micTrail.current.push({ f1: r.f1, f2: r.f2 }); if (micTrail.current.length > 25) micTrail.current.shift(); }
      }
      const mt = micTrail.current;
      for (let i = 0; i < mt.length; i++) {
        ctx.fillStyle = `rgba(69,184,245,${(i + 1) / mt.length})`;
        ctx.beginPath(); ctx.arc(lx(mt[i].f2), ly(mt[i].f1), i === mt.length - 1 ? 6 : 3, 0, Math.PI * 2); ctx.fill();
      }
      if (mt.length) label(ctx, L({ it: 'tu', en: 'you' }), lx(mt[mt.length - 1].f2) + 18, ly(mt[mt.length - 1].f1), C.sky);
    }
  });

  const pick = (e: React.PointerEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const g = geo.current;
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const f2 = Math.exp(Math.log(F2_MAX) - ((px - g.x0) / (g.x1 - g.x0)) * (Math.log(F2_MAX) - Math.log(F2_MIN)));
    const f1 = Math.exp(Math.log(F1_MIN) + ((py - g.y0) / (g.y1 - g.y0)) * (Math.log(F1_MAX) - Math.log(F1_MIN)));
    return { f1, f2, px, py };
  };
  const blendTo = (f1: number, f2: number) => {
    const mv = modelVowels().filter((v) => v.f1 > 0 && v.f2 > 0);
    let wsum = 0;
    const acc: Record<string, number> = {};
    for (const k of ARTICULATOR_KEYS) acc[k] = 0;
    for (const v of mv) {
      const d = Math.hypot(Math.log(v.f1 / f1) * 1.4, Math.log(v.f2 / f2));
      const wgt = 1 / Math.pow(d + 0.02, 3);
      wsum += wgt;
      for (const k of ARTICULATOR_KEYS) acc[k] += wgt * v.art[k];
    }
    const a: Partial<Articulators> = {};
    for (const k of ARTICULATOR_KEYS) if (k !== 'larynx') a[k] = acc[k] / wsum;
    voice.edit((p) => { Object.assign(p.articulators, a); p.abduction = 0; p.phonate = true; });
  };
  const onDown = (e: React.PointerEvent) => {
    const q = pick(e);
    // click on a model vowel?
    const g = geo.current;
    const lx = (f2: number) => g.x0 + ((Math.log(F2_MAX) - Math.log(f2)) / (Math.log(F2_MAX) - Math.log(F2_MIN))) * (g.x1 - g.x0);
    const ly = (f1: number) => g.y0 + ((Math.log(f1) - Math.log(F1_MIN)) / (Math.log(F1_MAX) - Math.log(F1_MIN))) * (g.y1 - g.y0);
    for (const v of modelVowels()) {
      if (Math.hypot(lx(v.f2) - q.px, ly(v.f1) - q.py) < 13) {
        voice.holdPhoneme(v.ipa);
        target.current = { f1: v.f1, f2: v.f2 };
        return;
      }
    }
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    target.current = { f1: q.f1, f2: q.f2 };
    voice.grab({ blow: true });
    blendTo(q.f1, q.f2);
    void voice.ensureAudio();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const q = pick(e);
    target.current = { f1: q.f1, f2: q.f2 };
    blendTo(q.f1, q.f2);
  };
  const onUp = () => { dragging.current = false; voice.letGo(); };

  const sets: [RefSet, string][] = [
    ['pb-men', L({ it: 'P&B uomini', en: 'P&B men' })], ['pb-women', L({ it: 'P&B donne', en: 'P&B women' })], ['pb-children', L({ it: 'P&B bambini', en: 'P&B children' })],
    ['hillenbrand', 'Hillenbrand 1995'], ['video', L({ it: 'voce del video', en: 'video narrator' })],
  ];
  return (
    <div className="view-panel">
      <canvas ref={ref} className="fill" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <div className="overlay-top right">
        <select value={refSet} onChange={(e) => setRefSet(e.target.value as RefSet)}>
          {sets.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      <div className="legend bl">
        <span className="lg"><span className="dot teal" />{L({ it: 'vocali del modello (clic)', en: 'model vowels (click)' })}</span>
        <span className="lg"><span className="dot violet" />{L({ it: 'misure di riferimento', en: 'reference measurements' })}</span>
        <span className="lg"><span className="dot amber" />{L({ it: 'forma attuale (trascina per scivolare)', en: 'current shape (drag to glide)' })}</span>
      </div>
    </div>
  );
}
