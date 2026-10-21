import { store, useParams, useStore, useTick } from '../store';
import { useL } from '../i18n';
import { Slider, Section, Readout } from './controls';
import { useAnimatedCanvas, C, label } from '../canvas';
import { setPhoneme } from '../presets';
import { DEFAULT_TEETH, Teeth } from '../../dsp/tract/types';

/**
 * The teeth and the slit the air squeezes through for sibilants. Front view
 * (as in a mirror) and a side zoom with the jet hitting the incisors.
 */
function TeethCanvas() {
  const L = useL();
  const ref = useAnimatedCanvas(({ ctx, w, h, t }) => {
    const p = store.params;
    const tel = store.ui.audioOn ? store.telemetry : null;
    const { geom } = store.derived();
    const sl = geom.slit;
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, w, h);
    // ---------- front view
    const fw = w * 0.52;
    const k = Math.min(fw / 5.2, h / 2.6); // px per cm
    const cx = fw / 2, cy = h * 0.5;
    const T = p.teeth;
    const vert = sl.vertical; // cm between incisor edges (negative = overlap)
    const upY = cy - Math.max(0, vert) * k * 0.5;
    const loY = cy + Math.max(0, vert) * k * 0.5;
    // mouth opening
    ctx.fillStyle = '#05060a';
    ctx.beginPath(); ctx.ellipse(cx, cy, 2.3 * k, Math.max(0.55, 0.45 + Math.max(0, vert) * 1.2) * k, 0, 0, Math.PI * 2); ctx.fill();
    // jet glow through the slit
    const lv = tel ? tel.levels.obstacle + tel.levels.wall : 0;
    const glow = Math.max(0, Math.min(1, (20 * Math.log10(lv + 1e-9) + 60) / 40));
    if (glow > 0.02) {
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, sl.width * k * 0.6);
      g.addColorStop(0, `rgba(169,139,250,${0.8 * glow})`); g.addColorStop(1, 'rgba(169,139,250,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, sl.width * k * 0.6, Math.max(6, sl.height * k * 3), 0, 0, Math.PI * 2); ctx.fill();
    }
    // slit lens
    ctx.strokeStyle = C.violet; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(cx, cy, (sl.width * k) / 2, Math.max(1, (sl.height * k) / 2), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // upper teeth: laterals and centrals
    const gum = upY - 1.05 * k;
    const ul = 1.0 + T.upperLength;
    const d2 = T.diastema / 2;
    // left edge (cm from the midline), width and length of each upper incisor
    const teeth = [
      { x: -d2 - 0.82 - 0.62, w: 0.62, l: ul - 0.15 }, { x: -d2 - 0.82, w: 0.82, l: ul }, { x: d2, w: 0.82, l: ul }, { x: d2 + 0.82, w: 0.62, l: ul - 0.15 },
    ];
    ctx.fillStyle = '#c86b7c';
    ctx.beginPath(); ctx.roundRect(cx - 2.1 * k, gum - 0.35 * k, 4.2 * k, 0.5 * k, 10); ctx.fill();
    for (const th of teeth) {
      const x = cx + th.x * k + 1;
      const gx = ctx.createLinearGradient(x, gum, x + th.w * k, gum);
      gx.addColorStop(0, '#d9d1bd'); gx.addColorStop(0.5, C.tooth); gx.addColorStop(1, '#d9d1bd');
      ctx.fillStyle = gx;
      ctx.beginPath(); ctx.roundRect(x, gum, th.w * k - 2, (upY - gum) + (th.l - 1) * k * 0.4, [2, 2, 6, 6]); ctx.fill();
    }
    // lower teeth
    const lgum = loY + 0.95 * k;
    ctx.fillStyle = '#c86b7c';
    ctx.beginPath(); ctx.roundRect(cx - 1.8 * k, lgum - 0.1 * k, 3.6 * k, 0.45 * k, 10); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const x = cx + (-1.1 + i * 0.55) * k;
      ctx.fillStyle = '#e9e2d0';
      ctx.beginPath(); ctx.roundRect(x, loY + T.lowerLength * -0.3 * k, 0.52 * k, lgum - loY, [5, 5, 2, 2]); ctx.fill();
    }
    label(ctx, L({ it: 'vista frontale', en: 'front view' }), cx, 12, C.muted);
    label(ctx, `${L({ it: 'fessura', en: 'slit' })} ${(sl.width * 10).toFixed(0)} × ${(sl.height * 10).toFixed(1)} mm`, cx, h - 12, C.violet);

    // ---------- side zoom from the real geometry
    const sx0 = fw + 6, sw = w - sx0 - 6;
    const ue = geom.landmarks.upperEdge;
    const kz = Math.min(sw / 4.2, h / 3.4);
    const ZX = (x: number) => sx0 + sw * 0.55 + (x - ue[0]) * kz;
    const ZY = (y: number) => h * 0.5 - (y - ue[1]) * kz;
    ctx.save();
    ctx.beginPath(); ctx.rect(sx0, 0, sw, h); ctx.clip();
    ctx.fillStyle = '#05070c'; ctx.fillRect(sx0, 0, sw, h);
    for (const s of geom.solids) {
      if (!['tongue', 'upperIncisor', 'lowerIncisor', 'upperLip', 'lowerLip', 'palate', 'floor'].includes(s.id)) continue;
      ctx.beginPath();
      for (let i = 0; i < s.pts.length; i += 2) { const x = ZX(s.pts[i]), y = ZY(s.pts[i + 1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.fillStyle = s.id.includes('Incisor') ? C.tooth : s.id === 'tongue' ? '#df6f87' : s.id === 'palate' ? '#cdbfa6' : s.id === 'floor' ? '#93485c' : C.lip;
      ctx.fill();
    }
    // jet: from the constriction exit to the teeth
    if (tel && tel.jet.v > 100) {
      const ci = tel.constrictionIndex;
      const sPos = ((ci + 1) / 44) * geom.length;
      let best = 0, bd = Infinity;
      for (let i = 0; i <= geom.lastRay; i++) { const d = Math.abs(geom.s[i] - sPos); if (d < bd) { bd = d; best = i; } }
      const hh = geom.hits[best];
      const tx = 0.5 * (ue[0] + geom.landmarks.lowerEdge[0]), ty = 0.5 * (ue[1] + geom.landmarks.lowerEdge[1]);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const u = ((t * 1.8 + i / n) % 1);
        const x = hh.mx + (tx - hh.mx) * u, y = hh.my + (ty - hh.my) * u;
        ctx.fillStyle = `rgba(169,139,250,${0.8 * (1 - u * 0.5) * glow + 0.15})`;
        ctx.beginPath(); ctx.arc(ZX(x), ZY(y + (Math.random() - 0.5) * 0.05 * u), 2 + u * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    label(ctx, L({ it: 'di lato: il getto colpisce i denti', en: 'side: the jet hits the teeth' }), sx0 + sw / 2, 12, C.muted);
  });
  return <canvas ref={ref} className="teeth-canvas" />;
}

export function TeethPanel() {
  const L = useL();
  const p = useParams();
  const numbers = useStore((s) => s.ui.numbers);
  useTick(numbers ? 4 : 0);
  const T = p.teeth;
  const set = (k: keyof Teeth, v: number) => store.setParams((x) => { x.teeth[k] = v; });
  const tel = store.telemetry;
  const jet = tel?.jet;
  return (
    <div className="panel-body">
      <TeethCanvas />
      <div className="chips ipa">
        {['s', 'ʃ', 'f', 'θ', 'z'].map((c) => <button key={c} className="chip ipa" onClick={() => { setPhoneme(c); if (!store.audio.running) void store.startAudio(); }}>{c}</button>)}
        <button className="chip" onClick={() => store.setParams((x) => { x.teeth = { ...DEFAULT_TEETH }; })}>{L({ it: 'Denti normali', en: 'Normal teeth' })}</button>
        <button className="chip" onClick={() => store.setParams((x) => { x.teeth = { ...DEFAULT_TEETH, slitOpen: 0.45 }; })}>{L({ it: 'Morso aperto', en: 'Open bite' })}</button>
        <button className="chip" onClick={() => store.setParams((x) => { x.teeth = { ...DEFAULT_TEETH, diastema: 0.3 }; })}>{L({ it: 'Spazio tra i denti', en: 'Gap teeth' })}</button>
        <button className="chip" onClick={() => store.setParams((x) => { x.teeth = { ...DEFAULT_TEETH, overjet: 0.45 }; })}>{L({ it: 'Denti sporgenti', en: 'Overjet' })}</button>
        <button className="chip" onClick={() => store.setParams((x) => { x.teeth = { ...DEFAULT_TEETH, upperLength: -0.25, lowerLength: -0.2 }; })}>{L({ it: 'Denti corti', en: 'Short teeth' })}</button>
      </div>
      <Section title={L({ it: 'La fessura', en: 'The slit' })} accent={C.violet}
        info={L({
          it: 'Per la «s» la lingua forma un canale stretto e il getto d’aria va a sbattere contro gli incisivi: è l’ostacolo a creare gran parte del fruscio acuto (Shadle 1985). Se la fessura tra i denti si allarga, o i denti non sono sulla traiettoria del getto, la «s» perde forza e diventa più cupa o sibilante in modo diverso.',
          en: 'For “s” the tongue forms a narrow channel and the air jet hits the incisors: the obstacle makes most of the high hiss (Shadle 1985). If the slit between the teeth widens, or the teeth are not in the jet’s path, the “s” weakens and changes color.',
        })}>
        <Slider label={L({ it: 'Larghezza fessura', en: 'Slit width' })} value={T.slitWidth} min={0.5} max={4} onChange={(v) => set('slitWidth', v)} format={(v) => `${(v * 10).toFixed(0)} mm`} />
        <Slider label={L({ it: 'Apertura extra tra i denti', en: 'Extra opening between teeth' })} value={T.slitOpen} min={-0.15} max={0.8} onChange={(v) => set('slitOpen', v)} format={(v) => `${(v * 10).toFixed(1)} mm`} />
        <Slider label={L({ it: 'Spazio tra gli incisivi', en: 'Gap between incisors' })} value={T.diastema} min={0} max={0.4} onChange={(v) => set('diastema', v)} format={(v) => `${(v * 10).toFixed(1)} mm`} />
        <Slider label={L({ it: 'Incisivi superiori in avanti', en: 'Upper incisors forward' })} value={T.overjet} min={-0.2} max={0.5} onChange={(v) => set('overjet', v)} format={(v) => `${(v * 10).toFixed(1)} mm`} />
        <Slider label={L({ it: 'Denti avanti/indietro', en: 'Teeth forward/back' })} value={T.advance} min={-0.3} max={0.4} onChange={(v) => set('advance', v)} format={(v) => `${(v * 10).toFixed(1)} mm`} />
        <Slider label={L({ it: 'Lunghezza incisivi superiori', en: 'Upper incisor length' })} value={T.upperLength} min={-0.3} max={0.4} onChange={(v) => set('upperLength', v)} format={(v) => `${(v * 10).toFixed(1)} mm`} />
        <Slider label={L({ it: 'Lunghezza incisivi inferiori', en: 'Lower incisor length' })} value={T.lowerLength} min={-0.3} max={0.4} onChange={(v) => set('lowerLength', v)} format={(v) => `${(v * 10).toFixed(1)} mm`} />
        <Slider label={L({ it: 'Solco della lingua', en: 'Tongue groove' })} value={p.articulators.groove} min={0} max={1} onChange={(v) => store.setArticulators({ groove: v })} />
        <Readout items={jet ? [
          [L({ it: 'velocità getto', en: 'jet speed' }), `${(jet.v / 100).toFixed(1)} m/s`],
          ['Reynolds', jet.re.toFixed(0)],
          [L({ it: 'getto sui denti', en: 'jet on teeth' }), `${(jet.impinge * 100).toFixed(0)} %`],
          [L({ it: 'distanza ai denti', en: 'distance to teeth' }), `${(jet.toTeeth * 10).toFixed(1)} mm`],
          ['fc ' + L({ it: 'parete', en: 'wall' }), `${(jet.fc / 1000).toFixed(1)} kHz`],
          ['fc ' + L({ it: 'ostacolo', en: 'obstacle' }), `${(jet.fcObstacle / 1000).toFixed(1)} kHz`],
        ] : []} />
      </Section>
    </div>
  );
}
