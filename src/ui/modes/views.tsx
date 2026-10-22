import { lazy, ReactNode, Suspense, useEffect, useState } from 'react';
import type { ViewTab } from '../store';
import { useL, S } from '../i18n';
import { Spectrum } from '../components/Spectrum';
import { Spectrogram } from '../components/Spectrogram';
import { Scope } from '../components/Scope';
import { GlottisView } from '../components/GlottisView';
import { VowelChart } from '../components/VowelChart';
import { TubeView } from '../components/TubeView';

// three.js is loaded only when the 3D view is opened
const Tract3DView = lazy(() => import('../components/Tract3DView'));

type Bi = { it: string; en: string };

export const VIEW_ORDER: ViewTab[] = ['spectrum', 'spectrogram', 'chart', 'scope', 'glottis', 'tube', 'tract3d'];
export const VIEW_NAMES: Record<ViewTab, Bi> = {
  spectrum: S.vSpectrum, spectrogram: S.spectrogram, chart: S.vChart, scope: S.vScope, glottis: S.vGlottis, tube: S.vTube, tract3d: S.v3d,
};

function View({ id }: { id: ViewTab }): ReactNode {
  const L = useL();
  switch (id) {
    case 'spectrum': return <Spectrum />;
    case 'spectrogram': return <Spectrogram />;
    case 'chart': return <VowelChart />;
    case 'scope': return <Scope />;
    case 'glottis': return <GlottisView />;
    case 'tube': return <TubeView />;
    case 'tract3d': return <Suspense fallback={<div className="overlay-bottom hint">{L({ it: 'Carico la vista 3D…', en: 'Loading the 3D view…' })}</div>}><Tract3DView /></Suspense>;
  }
}

/**
 * The common frame of an analysis view: its name (or a picker of the view),
 * and a button that enlarges it over the page (Esc closes it).
 */
export function ViewFrame(props: { view: ViewTab; onView?: (v: ViewTab) => void; className?: string }) {
  const L = useL();
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!max) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMax(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [max]);
  const cls = ['view-frame', max ? 'max' : '', props.className ?? ''].filter(Boolean).join(' ');
  return (
    <section className={cls}>
      <header className="vf-bar">
        {props.onView ? (
          <select className="vf-pick" value={props.view} aria-label={L({ it: 'Vista', en: 'View' })} onChange={(e) => props.onView!(e.target.value as ViewTab)}>
            {VIEW_ORDER.map((v) => <option key={v} value={v}>{L(VIEW_NAMES[v])}</option>)}
          </select>
        ) : <h3 className="vf-title">{L(VIEW_NAMES[props.view])}</h3>}
        <button className="vf-max" title={max ? L({ it: 'Rimpicciolisci (Esc)', en: 'Back to size (Esc)' }) : L({ it: 'Ingrandisci', en: 'Enlarge' })} onClick={() => setMax(!max)}>{max ? '✕' : '⤢'}</button>
      </header>
      <div className="vf-body"><View id={props.view} /></div>
    </section>
  );
}
