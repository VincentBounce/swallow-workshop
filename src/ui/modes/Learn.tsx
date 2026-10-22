import { useEffect, useState } from 'react';
import { store, useUi, useTick, ControlTab } from '../store';
import { useL } from '../i18n';
import { HeadView } from '../components/HeadView';
import { ABPanel } from '../components/ABPanel';
import { MelodyPanel } from '../components/MelodyPanel';
import { MachinePanel } from '../components/MachinePanel';
import { NoisePanel } from '../components/NoisePanel';
import { CHAPTERS, GuidedExperiment } from '../tour';
import { ViewFrame } from './views';
import { QuickControls } from './quick';

type Bi = { it: string; en: string };

const TOOL_NAMES: Partial<Record<ControlTab, Bi>> = {
  ab: { it: 'Esperimento A/B', en: 'A/B experiment' },
  melody: { it: 'La melodia', en: 'The melody' },
  machine: { it: 'Voce sintetica', en: 'Machine voice' },
  noise: { it: 'Il tuo rumore', en: 'Your own noise' },
};

/** A guided experiment: question, steps to try, what to watch, the answer on demand. */
function Experiment({ ex }: { ex: GuidedExperiment }) {
  const ui = useUi();
  const L = useL();
  const [done, setDone] = useState(-1);
  const [open, setOpen] = useState(false);
  useTick(ex.numbers && ui.numbers ? 4 : 0);
  return (
    <div className="experiment">
      <div className="exp-q">{L({ it: 'Esperimento', en: 'Experiment' })} · {L(ex.question)}</div>
      <ol className="exp-steps">
        {ex.steps.map((s, i) => (
          <li key={i}><button className={i <= done ? 'btn try done' : 'btn try'} onClick={() => { s.run(); setDone(Math.max(done, i)); }}>{L(s.label)}</button></li>
        ))}
      </ol>
      <p className="exp-look"><b>{L({ it: 'Guarda e ascolta.', en: 'Look and listen.' })}</b> {L(ex.look)}</p>
      {ex.numbers && (ui.numbers
        ? <p className="exp-numbers">123 · {L(ex.numbers())}</p>
        : <button className="chip" onClick={() => store.setUi({ numbers: true })}>123 {L({ it: 'mostra i numeri', en: 'show the numbers' })}</button>)}
      {open
        ? <p className="exp-answer">{L(ex.answer)}</p>
        : <button className="chip" onClick={() => setOpen(true)}>{L({ it: 'Che cosa è successo?', en: 'What happened?' })}</button>}
    </div>
  );
}

function Tool({ tab }: { tab: ControlTab }) {
  const L = useL();
  return (
    <section className="learn-tool">
      <header className="ds-card-head">
        <h3 className="ds-card-title">{L(TOOL_NAMES[tab] ?? { it: 'Strumento', en: 'Tool' })}</h3>
        <button className="chip" onClick={() => store.setUi({ learnTool: null })}>✕ {L({ it: 'Chiudi', en: 'Close' })}</button>
      </header>
      {tab === 'ab' && <ABPanel />}
      {tab === 'melody' && <MelodyPanel />}
      {tab === 'machine' && <MachinePanel />}
      {tab === 'noise' && <NoisePanel />}
    </section>
  );
}

const goChapter = (i: number) => store.setUi({ chapter: Math.max(0, Math.min(CHAPTERS.length - 1, i)), learnTool: null });

/**
 * Learn: for someone who starts from nothing. The head and one view chosen
 * by the step, the few controls the chapter needs, and the chapter as a
 * card of numbered steps; the chapters along the bottom.
 */
export function Learn() {
  const ui = useUi();
  const L = useL();
  const n = Math.min(ui.chapter, CHAPTERS.length - 1);
  const ch = CHAPTERS[n];
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => setDone([]), [n]);
  return (
    <main className="learn">
      <section className="learn-stage ds-card">
        <div className="stage-head"><HeadView /></div>
        <ViewFrame className="stage-view" view={ui.viewTab} onView={(v) => store.setUi({ viewTab: v })} />
        {!!ch.quick?.length && <div className="stage-quick"><QuickControls ids={ch.quick} /></div>}
      </section>
      <aside className="learn-card ds-card">
        <div className="kicker">{n === 0 ? L(ch.kicker) : L({ it: `Capitolo ${n} di ${CHAPTERS.length - 1}`, en: `Chapter ${n} of ${CHAPTERS.length - 1}` })}</div>
        <h2>{L(ch.title)}</h2>
        {ch.paragraphs.map((p, i) => <p key={i}>{L(p)}</p>)}
        <ol className="learn-steps">
          {ch.actions.map((a, i) => (
            <li key={i}>
              <button className={done.includes(i) ? 'step done' : 'step'} onClick={() => { a.run(); setDone((d) => (d.includes(i) ? d : [...d, i])); }}>
                <span className="step-n">{i + 1}</span><span className="step-label">{L(a.label)}</span><span className="step-mark" aria-hidden>{done.includes(i) ? '✓' : '›'}</span>
              </button>
            </li>
          ))}
        </ol>
        {ui.learnTool && <Tool tab={ui.learnTool} />}
        {ch.experiments?.map((ex, i) => <Experiment key={`${n}-${i}`} ex={ex} />)}
        <div className="learn-nav">
          <button className="btn" disabled={n === 0} onClick={() => goChapter(n - 1)}>← {L({ it: 'Indietro', en: 'Back' })}</button>
          <button className="chip" title={L({ it: 'Tutti i controlli, ordinati lungo la catena del segnale', en: 'Every control, ordered along the signal chain' })} onClick={() => store.setUi({ mode: 'lab' })}>{L({ it: 'Apri il laboratorio', en: 'Open the lab' })}</button>
          <button className="btn primary" disabled={n === CHAPTERS.length - 1} onClick={() => goChapter(n + 1)}>{L({ it: 'Avanti', en: 'Next' })} →</button>
        </div>
      </aside>
      <nav className="learn-progress" aria-label={L({ it: 'Capitoli', en: 'Chapters' })}>
        <span className="muted">{L({ it: 'La tua voce, passo per passo', en: 'Your voice, step by step' })}</span>
        <div className="chapter-dots">
          {CHAPTERS.map((c, i) => (
            <button key={i} className={i === n ? 'cdot on' : i < n ? 'cdot past' : 'cdot'} title={L(c.title)} aria-label={L(c.title)} onClick={() => goChapter(i)}>
              <span className="cdot-n">{i}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
