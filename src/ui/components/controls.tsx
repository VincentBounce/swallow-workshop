import { ReactNode, useState } from 'react';
import { useStore } from '../store';
import { useL } from '../i18n';
import { useLock } from '../voice/hooks';
import type { ControlId } from '../voice/controls';
import { lockText } from './DriverBar';

/** A small padlock drawn next to a control that someone else drives. */
export function LockIcon() {
  return (
    <svg className="lock-icon" viewBox="0 0 12 12" width="11" height="11" aria-hidden>
      <rect x="2" y="5.2" width="8" height="6" rx="1.3" fill="currentColor" />
      <path d="M3.9 5.4V3.9a2.1 2.1 0 0 1 4.2 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * A slider. With `control`, it locks (disabled, with a padlock and the
 * reason) while a performer or the filter drives that control, and then
 * shows `live`, the value that is sounding, when given.
 */
export function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number; log?: boolean;
  onChange: (v: number) => void; format?: (v: number) => string; hint?: string; color?: string;
  control?: ControlId; live?: number;
}) {
  const { label, min, max, step = 0.01, log, onChange, format, hint, color } = props;
  const numbers = useStore((s) => s.ui.numbers);
  const lock = useLock(props.control);
  const L = useL();
  const value = lock && props.live !== undefined ? Math.max(min, Math.min(max, props.live)) : props.value;
  const toPos = (v: number) => (log ? (Math.log(v / min) / Math.log(max / min)) * 1000 : v);
  const fromPos = (x: number) => (log ? min * Math.pow(max / min, x / 1000) : x);
  return (
    <label className={lock ? 'slider locked' : 'slider'} title={lock ? L(lockText(lock)) : hint}>
      <span className="slider-label" style={color && !lock ? { color } : undefined}>{lock && <LockIcon />}{label}</span>
      <input type="range" min={log ? 0 : min} max={log ? 1000 : max} step={log ? 1 : step} value={toPos(value)} disabled={!!lock}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))} />
      <span className={numbers ? 'slider-value' : 'slider-value soft'}>{format ? format(value) : value.toFixed(2)}</span>
    </label>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; control?: ControlId }) {
  const lock = useLock(props.control);
  const L = useL();
  return (
    <label className={lock ? 'toggle locked' : 'toggle'} title={lock ? L(lockText(lock)) : props.hint}>
      <input type="checkbox" checked={props.value} disabled={!!lock} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="track"><span className="knob" /></span>
      <span>{lock && <LockIcon />}{props.label}</span>
    </label>
  );
}

export function Seg<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; control?: ControlId }) {
  const lock = useLock(props.control);
  const L = useL();
  return (
    <div className={lock ? 'seg locked' : 'seg'} title={lock ? L(lockText(lock)) : undefined}>
      {props.options.map(([id, name]) => (
        <button key={id} className={props.value === id ? 'on' : ''} disabled={!!lock} onClick={() => props.onChange(id)}>{name}</button>
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
