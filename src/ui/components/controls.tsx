import { ReactNode, useState } from 'react';
import { useStore } from '../store';

export function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number; log?: boolean;
  onChange: (v: number) => void; format?: (v: number) => string; hint?: string; color?: string;
}) {
  const { label, value, min, max, step = 0.01, log, onChange, format, hint, color } = props;
  const numbers = useStore((s) => s.ui.numbers);
  const toPos = (v: number) => (log ? (Math.log(v / min) / Math.log(max / min)) * 1000 : v);
  const fromPos = (x: number) => (log ? min * Math.pow(max / min, x / 1000) : x);
  return (
    <label className="slider" title={hint}>
      <span className="slider-label" style={color ? { color } : undefined}>{label}</span>
      <input type="range" min={log ? 0 : min} max={log ? 1000 : max} step={log ? 1 : step} value={toPos(value)}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))} />
      <span className={numbers ? 'slider-value' : 'slider-value soft'}>{format ? format(value) : value.toFixed(2)}</span>
    </label>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle" title={props.hint}>
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="track"><span className="knob" /></span>
      <span>{props.label}</span>
    </label>
  );
}

export function Seg<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {props.options.map(([id, name]) => (
        <button key={id} className={props.value === id ? 'on' : ''} onClick={() => props.onChange(id)}>{name}</button>
      ))}
    </div>
  );
}

/** Collapsible group with an optional plain-language explanation. */
export function Section(props: { title: string; children: ReactNode; info?: ReactNode; open?: boolean; accent?: string }) {
  const [open, setOpen] = useState(props.open ?? true);
  const [info, setInfo] = useState(false);
  return (
    <section className="section">
      <header>
        <button className="section-title" onClick={() => setOpen(!open)} style={props.accent ? { borderLeftColor: props.accent } : undefined}>
          <span className={open ? 'caret open' : 'caret'}>▸</span>{props.title}
        </button>
        {props.info && <button className={info ? 'info on' : 'info'} onClick={() => setInfo(!info)} aria-label="info">i</button>}
      </header>
      {info && props.info && <div className="explain">{props.info}</div>}
      {open && <div className="section-body">{props.children}</div>}
    </section>
  );
}

export function Readout(props: { items: [string, string][] }) {
  const numbers = useStore((s) => s.ui.numbers);
  if (!numbers) return null;
  return (
    <div className="readout">
      {props.items.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
    </div>
  );
}
