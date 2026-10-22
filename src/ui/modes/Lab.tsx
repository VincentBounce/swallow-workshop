import { ReactNode, useEffect, useRef, useState } from 'react';
import { store, useUi, useTick, ControlTab, ViewTab, LabViews, Bench } from '../store';
import { useL, useT } from '../i18n';
import { HeadView } from '../components/HeadView';
import { Meters } from '../components/Meters';
import { SourcePanel } from '../components/SourcePanel';
import { TractPanel } from '../components/TractPanel';
import { TeethPanel } from '../components/TeethPanel';
import { NoisePanel } from '../components/NoisePanel';
import { SpeakPanel } from '../components/SpeakPanel';
import { MelodyPanel } from '../components/MelodyPanel';
import { ABPanel } from '../components/ABPanel';
import { MachinePanel } from '../components/MachinePanel';
import { Slider, Toggle, Section, OneOpen } from '../components/controls';
import { C } from '../canvas';
import { Pills, Stat } from '../ds';
import { voice } from '../voice/voice';
import { useLock, useManual, useVoice } from '../voice/hooks';
import type { ControlId } from '../voice/controls';
import { ViewFrame } from './views';
import { lockShort, lockText } from '../components/DriverBar';

type Bi = { it: string; en: string };
type Block = Exclude<Bench, 'experiments'>;

/** The signal chain, left to right, and what each block holds. */
const BLOCKS: { id: Block; name: Bi; sub: Bi; icon: string; controls: ControlId[] }[] = [
  { id: 'source', name: { it: 'Sorgente', en: 'Source' }, sub: { it: 'polmoni e corde vocali', en: 'lungs and vocal folds' }, icon: '◉', controls: ['pitch', 'lungs', 'glottis', 'quality'] },
  { id: 'tract', name: { it: 'Tratto', en: 'Tract' }, sub: { it: 'gola, bocca, naso, denti', en: 'throat, mouth, nose, teeth' }, icon: '◠', controls: ['posture', 'velum', 'teeth', 'body', 'nose', 'filter', 'tube', 'walls'] },
  { id: 'noise', name: { it: 'Rumore', en: 'Noise' }, sub: { it: 'getti, aspirazione, il tuo rumore', en: 'jets, aspiration, your noise' }, icon: '≋', controls: ['noise'] },
  { id: 'output', name: { it: 'Uscita', en: 'Output' }, sub: { it: 'volume, analisi, microfono', en: 'volume, analysis, microphone' }, icon: '∿', controls: ['volume'] },
];
const EXPERIMENTS: [ControlTab, Bi][] = [
  ['speak', { it: 'Parla', en: 'Speak' }], ['melody', { it: 'Melodia', en: 'Melody' }],
  ['ab', { it: 'A/B', en: 'A/B' }], ['machine', { it: 'Voce sintetica', en: 'Machine voice' }],
];

const benchOf = (t: ControlTab): Bench =>
  t === 'source' ? 'source' : t === 'tract' || t === 'teeth' ? 'tract' : t === 'noise' ? 'noise' : t === 'output' ? 'output' : 'experiments';

/** One block of the chain: a padlock when a performer or the filter drives part of it. */
function ChainBlock({ b, on }: { b: (typeof BLOCKS)[number]; on: boolean }) {
  const L = useL();
  const driven = useVoice((v) => b.controls.some((c) => !!v.lock(c)));
  return (
    <button className={on ? 'chain-block on' : 'chain-block'} onClick={() => store.setUi({ controlTab: b.id as ControlTab })}>
      <span className="chain-icon" aria-hidden>{b.icon}</span>
      <span className="chain-text"><b>{L(b.name)}{driven && <span className="chain-lock" title={L({ it: 'qualcuno lo sta guidando', en: 'something drives it now' })}> 🔒</span>}</b><small>{L(b.sub)}</small></span>
    </button>
  );
}

/** The output block: volume, what the views show, the microphone, freezing and the numbers. */
function OutputPanel() {
  const L = useL();
  const t = useT();
  const ui = useUi();
  const p = useManual();
  useTick(ui.audioOn ? 4 : 0);
  const tel = voice.live();
  return (
    <div className="panel-body"><OneOpen>
      <Section title={L({ it: 'Quello che senti', en: 'What you hear' })} accent={C.text}>
        <Slider label={t('volume')} value={p.volume} min={-30} max={12} step={0.5} control="volume" onChange={(v) => voice.edit((q) => { q.volume = v; })} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
        <div className="stats">
          <Stat label={L({ it: 'campionamento', en: 'sample rate' })} value={(voice.sampleRate / 1000).toFixed(1)} unit="kHz" />
          <Stat label={L({ it: 'uscita', en: 'output' })} value={tel ? (20 * Math.log10(tel.levels.out + 1e-9)).toFixed(0) : '–'} unit="dBFS" tone="teal" />
          <Stat label="F0" value={tel && tel.f0 > 0 ? tel.f0.toFixed(0) : '–'} unit="Hz" tone="amber" />
        </div>
      </Section>
      <Section title={L({ it: 'Analisi', en: 'Analysis' })} accent={C.teal}>
        <Toggle label={t('harmonics')} value={ui.showHarmonics} onChange={(v) => store.setUi({ showHarmonics: v })} />
        <Toggle label={t('envelope')} value={ui.envelope} onChange={(v) => store.setUi({ envelope: v })} />
        <Toggle label={L({ it: 'Spettrogramma log-mel (80 bande)', en: 'Log-mel spectrogram (80 bands)' })} value={ui.mel} onChange={(v) => store.setUi({ mel: v })} />
        <Slider label={t('window')} value={ui.specWindow} min={4} max={60} step={1} onChange={(v) => store.setUi({ specWindow: v })} format={(v) => `${v.toFixed(0)} ms`} />
        <Toggle label={L({ it: 'Numeri ovunque', en: 'Numbers everywhere' })} value={ui.numbers} onChange={(v) => store.setUi({ numbers: v })} />
        <Toggle label={L({ it: 'Blocca le viste', en: 'Freeze the views' })} value={ui.freeze} onChange={(v) => store.setUi({ freeze: v })} />
      </Section>
      <Section title={t('mic')} accent={C.sky} info={t('micHint')}>
        <Toggle label={L({ it: 'Confronta la tua voce', en: 'Compare your voice' })} value={ui.micOn} onChange={async (v) => {
          if (!v) { void voice.mic(false); store.setUi({ micOn: false }); return; }
          try { await voice.mic(true); store.setUi({ micOn: true }); } catch (e) { store.setUi({ info: String(e) }); }
        }} />
      </Section>
    </OneOpen></div>
  );
}

/** The inspector of the bench: the block's controls, one section open at a time; or the experiment, with the way back. */
function Inspector({ tab, back }: { tab: ControlTab; back: ControlTab }) {
  const L = useL();
  const t = useT();
  const block = benchOf(tab);
  const b = BLOCKS.find((x) => x.id === block);
  const lock = useLock(block === 'tract' ? 'posture' : block === 'source' ? 'pitch' : block === 'noise' ? 'noise' : undefined);
  const backTo = BLOCKS.find((x) => x.id === benchOf(back));
  let body: ReactNode = null, tabs: ReactNode = null;
  switch (tab) {
    case 'source': body = <SourcePanel />; break;
    case 'tract': case 'teeth':
      tabs = <Pills value={tab} options={[['tract', t('cTract')], ['teeth', t('cTeeth')]]} onChange={(v) => store.setUi({ controlTab: v })} />;
      body = tab === 'tract' ? <TractPanel /> : <TeethPanel />;
      break;
    case 'noise': body = <NoisePanel />; break;
    case 'output': body = <OutputPanel />; break;
    case 'speak': body = <SpeakPanel />; break;
    case 'melody': body = <MelodyPanel />; break;
    case 'ab': body = <ABPanel />; break;
    case 'machine': body = <MachinePanel />; break;
  }
  return (
    <aside className="lab-inspector ds-card">
      <header className="inspector-head">
        <div>
          <h3 className="ds-card-title">{b ? L(b.name) : L(EXPERIMENTS.find(([id]) => id === tab)![1])}</h3>
          <p className="ds-card-sub">{b ? L(b.sub) : L({ it: 'Esperimento', en: 'Experiment' })}</p>
        </div>
        {lock && <span className="driven-badge" title={L(lockText(lock))}>🔒 {L(lockShort(lock))}</span>}
        {!b && backTo && <button className="chip" onClick={() => store.setUi({ controlTab: back })}>← {L(backTo.name)}</button>}
      </header>
      {tabs && <div className="inspector-tabs">{tabs}</div>}
      {body}
    </aside>
  );
}

/** The bench's views: one or two, the ones that part of the chain is seen in; a view changed is remembered for that bench. */
function ViewGrid({ bench }: { bench: Bench }) {
  const L = useL();
  const v = useUi().labViews;
  const set = (u: Partial<LabViews>) => store.setUi({ labViews: { ...v, ...u } });
  const cells = v.bench[bench];
  const cell = (i: number) => (x: ViewTab) => set({ bench: { ...v.bench, [bench]: cells.map((c, j) => (j === i ? x : c)) as [ViewTab, ViewTab] } });
  return (
    <section className={`lab-views n${v.layout}`}>
      <div className="grid-pick">
        <Pills value={v.layout} label={L({ it: 'Viste', en: 'Views' })} options={[[1, '▣', L({ it: 'una vista', en: 'one view' })], [2, '◫', L({ it: 'due viste', en: 'two views' })]]} onChange={(n) => set({ layout: n })} />
      </div>
      {cells.slice(0, v.layout).map((c, i) => <ViewFrame key={`${bench}-${i}`} view={c} onView={cell(i)} />)}
    </section>
  );
}

/** The experiments, in a menu at the end of the chain. */
function ExperimentMenu({ tab }: { tab: ControlTab }) {
  const L = useL();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const current = EXPERIMENTS.find(([id]) => id === tab);
  return (
    <div className="exp-menu" ref={ref}>
      <button className={current ? 'chain-block on' : 'chain-block'} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <span className="chain-icon" aria-hidden>⚗</span>
        <span className="chain-text"><b>{L({ it: 'Esperimenti', en: 'Experiments' })} ▾</b><small>{current ? L(current[1]) : L({ it: 'parla, melodia, A/B, voce sintetica', en: 'speak, melody, A/B, machine voice' })}</small></span>
      </button>
      {open && (
        <div className="exp-list" role="menu">
          {EXPERIMENTS.map(([id, name]) => (
            <button key={id} role="menuitem" className={tab === id ? 'on' : ''} onClick={() => { store.setUi({ controlTab: id }); setOpen(false); }}>{L(name)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Lab: for someone who knows the subject, one bench at a time. A block of the
 * signal chain (or an experiment) chooses the bench: the views that part of
 * the chain is seen in, and its controls in the inspector, one section open
 * at a time. Every control shows its value, its unit, and a padlock when a
 * performer or the filter drives it.
 */
export function Lab() {
  const L = useL();
  const t = useT();
  const ui = useUi();
  const bench = benchOf(ui.controlTab);
  // where an experiment goes back to: the last block of the chain
  const last = useRef<ControlTab>('source');
  if (bench !== 'experiments') last.current = ui.controlTab;
  return (
    <main className="lab">
      <nav className="lab-chain ds-card" aria-label={L({ it: 'Catena del segnale', en: 'Signal chain' })}>
        <span className="chain-title">{L({ it: 'Catena del segnale', en: 'Signal chain' })}</span>
        {BLOCKS.map((b, i) => (
          <span key={b.id} className="chain-step">
            {i > 0 && <span className="chain-arrow" aria-hidden>→</span>}
            <ChainBlock b={b} on={bench === b.id} />
          </span>
        ))}
        <span className="chain-sep" />
        <ExperimentMenu tab={ui.controlTab} />
        <button className="chip reset" onClick={() => voice.reset()}>↺ {t('reset')}</button>
      </nav>
      <section className="lab-head ds-card">
        <HeadView />
        <Meters />
      </section>
      <ViewGrid bench={bench} />
      <Inspector key={ui.controlTab} tab={ui.controlTab} back={last.current} />
    </main>
  );
}
