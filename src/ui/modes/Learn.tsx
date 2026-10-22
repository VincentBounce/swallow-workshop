import { useEffect, useRef, useState } from 'react';
import { store, useUi, useTick } from '../store';
import { useL } from '../i18n';
import { HeadView } from '../components/HeadView';
import { ABPanel } from '../components/ABPanel';
import { MelodyPanel } from '../components/MelodyPanel';
import { MachinePanel } from '../components/MachinePanel';
import { NoisePanel } from '../components/NoisePanel';
import { LESSONS, Step, openStep, breath } from '../tour';
import { ViewFrame } from './views';
import { QuickControls } from './quick';

/** The tool a step opens under its card (each panel carries its own title). */
function Tool({ tool }: { tool: NonNullable<Step['tool']> }) {
  return (
    <section className="learn-tool">
      {tool.tab === 'ab' && <ABPanel start={tool.ab} />}
      {tool.tab === 'melody' && <MelodyPanel />}
      {tool.tab === 'machine' && <MachinePanel />}
      {tool.tab === 'noise' && <NoisePanel />}
    </section>
  );
}

/** Goes to a chapter and a step (a negative step is the last of the chapter). */
const goTo = (chapter: number, step: number) => {
  const c = Math.max(0, Math.min(LESSONS.length - 1, chapter));
  const n = LESSONS[c].steps.length;
  store.setUi({ chapter: c, step: step < 0 ? n - 1 : Math.min(step, n - 1) });
};

/** The chapter's name; a click opens the list of chapters. */
function ChapterMenu({ current }: { current: number }) {
  const L = useL();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const last = LESSONS.length - 1;
  return (
    <div className="chapter-menu" ref={ref}>
      <button className="chapter-pick" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(!open)}>
        <span className="kicker">{current === 0 ? L({ it: 'Benvenuto', en: 'Welcome' }) : L({ it: `Capitolo ${current} di ${last}`, en: `Chapter ${current} of ${last}` })}</span>
        <span className="chapter-title">{L(LESSONS[current].title)} <span className="caret" aria-hidden>▾</span></span>
      </button>
      {open && (
        <ol className="chapter-list" role="listbox" aria-label={L({ it: 'Capitoli', en: 'Chapters' })}>
          {LESSONS.map((l, i) => (
            <li key={i}>
              <button role="option" aria-selected={i === current} className={i === current ? 'on' : ''} onClick={() => { goTo(i, 0); setOpen(false); }}>
                <span className="cl-n">{i}</span><span className="cl-title">{L(l.title)}</span><span className="cl-steps">{l.steps.length}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Learn: for someone who starts from nothing, one step at a time. The head and
 * the one view the step needs fill the screen; under them, the step: one idea,
 * the sounds to try, what to look at, the explanation on demand, and Next.
 * Opening a step is silent; each sound lasts a breath.
 */
export function Learn() {
  const ui = useUi();
  const L = useL();
  const c = Math.min(ui.chapter, LESSONS.length - 1);
  const lesson = LESSONS[c];
  const k = Math.min(ui.step, lesson.steps.length - 1);
  const step = lesson.steps[k];
  const [why, setWhy] = useState(false);
  const [tried, setTried] = useState<number[]>([]);
  useEffect(() => { openStep(step); setWhy(false); setTried([]); }, [c, k]);
  useTick(step.numbers && ui.numbers ? 4 : 0);

  const first = c === 0 && k === 0;
  const last = c === LESSONS.length - 1 && k === lesson.steps.length - 1;
  const next = () => { if (k < lesson.steps.length - 1) goTo(c, k + 1); else if (!last) goTo(c + 1, 0); };
  const back = () => { if (k > 0) goTo(c, k - 1); else if (!first) goTo(c - 1, -1); };
  // the arrow keys turn the steps (not while typing or choosing)
  const nav = useRef({ next, back });
  nav.current = { next, back };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === 'ArrowRight') nav.current.next();
      else if (e.key === 'ArrowLeft') nav.current.back();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // a step with neither sounds nor a tool of its own still has a breath to give
  const sounds = step.try ?? (step.tool ? [] : [{ label: { it: 'Dai voce alla testa', en: 'Give the head a voice' }, run: breath }]);
  const nextToTry = sounds.findIndex((_, i) => !tried.includes(i));
  return (
    <main className="lesson">
      <section className="lesson-stage">
        <div className="stage-head ds-card"><HeadView guide={step.guide && { id: `${c}-${k}`, handle: step.guide.handle, text: L(step.guide.text) }} /></div>
        <ViewFrame className="stage-view" view={ui.viewTab} onView={(v) => store.setUi({ viewTab: v })} />
      </section>
      <section className="lesson-card ds-card" aria-live="polite">
        <header className="lesson-head">
          <ChapterMenu current={c} />
          <div className="step-progress" aria-label={L({ it: `Passo ${k + 1} di ${lesson.steps.length}`, en: `Step ${k + 1} of ${lesson.steps.length}` })}>
            <span className="muted">{L({ it: `passo ${k + 1} di ${lesson.steps.length}`, en: `step ${k + 1} of ${lesson.steps.length}` })}</span>
            <span className="pips">
              {lesson.steps.map((_, i) => <button key={i} className={i === k ? 'pip on' : i < k ? 'pip past' : 'pip'} aria-label={L({ it: `Passo ${i + 1}`, en: `Step ${i + 1}` })} onClick={() => goTo(c, i)} />)}
            </span>
          </div>
        </header>
        <div className="lesson-body">
          <div className="lesson-text">
            <p className="lesson-idea">{L(step.text)}</p>
            {step.look && <p className="lesson-look"><b>{L({ it: 'Guarda e ascolta', en: 'Look and listen' })}</b> {L(step.look)}</p>}
            {(step.why || step.numbers) && (
              <div className="lesson-more">
                {step.why && (why
                  ? <p className="lesson-why">{L(step.why)}</p>
                  : <button className="chip" onClick={() => setWhy(true)}>{L({ it: 'Perché?', en: 'Why?' })}</button>)}
                {step.numbers && (ui.numbers
                  ? <p className="lesson-numbers">123 · {L(step.numbers())}</p>
                  : <button className="chip" onClick={() => store.setUi({ numbers: true })}>123 {L({ it: 'i numeri', en: 'the numbers' })}</button>)}
              </div>
            )}
          </div>
          {!!sounds.length && (
            <div className="lesson-try">
              {sounds.map((a, i) => (
                <button key={i} className={i === nextToTry ? 'btn primary try' : tried.includes(i) ? 'btn try done' : 'btn try'}
                  onClick={() => { a.run(); setTried((d) => (d.includes(i) ? d : [...d, i])); }}>
                  <span aria-hidden>{tried.includes(i) ? '↻' : '▶'}</span> {L(a.label)}
                </button>
              ))}
            </div>
          )}
        </div>
        {step.quick && <QuickControls ids={[step.quick]} />}
        {step.tool && <Tool key={`${c}-${k}`} tool={step.tool} />}
        <footer className="lesson-nav">
          <button className="btn" disabled={first} onClick={back}>← {L({ it: 'Indietro', en: 'Back' })}</button>
          <button className="chip" title={L({ it: 'Tutti i controlli, ordinati lungo la catena del segnale', en: 'Every control, ordered along the signal chain' })} onClick={() => store.setUi({ mode: 'lab' })}>{L({ it: 'Apri il laboratorio', en: 'Open the lab' })}</button>
          <button className="btn primary" disabled={last} onClick={next}>
            {k === lesson.steps.length - 1 && !last ? L({ it: 'Capitolo successivo', en: 'Next chapter' }) : L({ it: 'Avanti', en: 'Next' })} →
          </button>
        </footer>
      </section>
    </main>
  );
}
