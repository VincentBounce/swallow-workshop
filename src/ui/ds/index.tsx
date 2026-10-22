/**
 * The small design system of the interface: cards, pills, icon buttons and
 * numbers with units. Colours, spacing and radii are the CSS variables on
 * :root (styles.css); these components only arrange them.
 */
import { ReactNode } from 'react';

/** A panel with an optional title, subtitle and actions on the right. */
export function Card(props: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={props.className ? `ds-card ${props.className}` : 'ds-card'}>
      {(props.title || props.actions) && (
        <header className="ds-card-head">
          <div>
            {props.title && <h3 className="ds-card-title">{props.title}</h3>}
            {props.sub && <p className="ds-card-sub">{props.sub}</p>}
          </div>
          {props.actions && <div className="ds-card-actions">{props.actions}</div>}
        </header>
      )}
      <div className="ds-card-body">{props.children}</div>
    </section>
  );
}

/** One choice out of a few, as connected pills. */
export function Pills<T extends string | number>(props: { value: T; options: [T, ReactNode, string?][]; onChange: (v: T) => void; size?: 'big'; label?: string }) {
  return (
    <div className={props.size === 'big' ? 'ds-pills big' : 'ds-pills'} role="radiogroup" aria-label={props.label}>
      {props.options.map(([id, name, hint]) => (
        <button key={String(id)} role="radio" aria-checked={props.value === id} className={props.value === id ? 'on' : ''} title={hint} onClick={() => props.onChange(id)}>{name}</button>
      ))}
    </div>
  );
}

/** A round button with a symbol and a spoken name. */
export function IconButton(props: { label: string; onClick: () => void; children: ReactNode; on?: boolean; disabled?: boolean }) {
  return (
    <button className={props.on ? 'ds-icon on' : 'ds-icon'} title={props.label} aria-label={props.label} disabled={props.disabled} onClick={props.onClick}>{props.children}</button>
  );
}

/** A value with its unit, in tabular figures. */
export function Stat(props: { label: ReactNode; value: ReactNode; unit?: string; tone?: 'amber' | 'teal' | 'violet' }) {
  return (
    <div className={props.tone ? `ds-stat ${props.tone}` : 'ds-stat'}>
      <span className="ds-stat-label">{props.label}</span>
      <b className="ds-stat-value">{props.value}{props.unit && <small> {props.unit}</small>}</b>
    </div>
  );
}
