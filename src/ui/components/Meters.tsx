import { store, useStore, useTick } from '../store';
import { useL } from '../i18n';
import { C, noteName } from '../canvas';

/** The three ingredients, live: buzz, hiss (where it comes from) and the output. */
export function Meters() {
  const L = useL();
  const on = useStore((s) => s.ui.audioOn);
  const numbers = useStore((s) => s.ui.numbers);
  useTick(on ? 12 : 0);
  const t = on ? store.telemetry : null;
  const lv = t?.levels;
  const bar = (x: number) => Math.max(0, Math.min(100, ((20 * Math.log10(x + 1e-9)) + 70) / 0.6));
  const items: [string, number, string][] = [
    [L({ it: 'ronzio', en: 'buzz' }), t ? t.voicingAmp * 100 : 0, C.amber],
    [L({ it: 'fruscio glottide', en: 'glottal hiss' }), lv ? bar(lv.aspiration * 3) : 0, C.violet],
    [L({ it: 'fruscio strettoia', en: 'constriction hiss' }), lv ? bar(lv.wall * 3) : 0, C.violet],
    [L({ it: 'fruscio denti', en: 'teeth hiss' }), lv ? bar(lv.obstacle * 3) : 0, C.violet],
    [L({ it: 'tuo rumore', en: 'your noise' }), lv ? bar(lv.user * 3) : 0, C.sky],
    [L({ it: 'uscita', en: 'output' }), lv ? bar(lv.out * 30) : 0, C.text],
  ];
  return (
    <div className="meters">
      {items.map(([name, v, col]) => (
        <div key={name} className="meter">
          <span>{name}</span>
          <div className="meter-track"><div className="meter-fill" style={{ width: `${v}%`, background: col }} /></div>
        </div>
      ))}
      <div className="meter-info">
        {t && t.f0 > 0 ? <><b style={{ color: C.amber }}>{noteName(t.f0)}</b> {numbers ? `${t.f0.toFixed(0)} Hz` : ''}</> : <span className="muted">{L({ it: 'nessuna nota', en: 'no pitch' })}</span>}
        {numbers && t && <span className="muted"> · Ps {(t.ps / 980.665).toFixed(1)} · Po {(t.po / 980.665).toFixed(1)} cmH₂O · L {t.length.toFixed(1)} cm</span>}
      </div>
    </div>
  );
}
