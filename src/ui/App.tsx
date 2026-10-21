import { useEffect, useState } from 'react';
import { store, useUi, useParams, ViewTab, ControlTab } from './store';
import { useT, useL } from './i18n';
import { HeadView } from './components/HeadView';
import { Spectrum } from './components/Spectrum';
import { Spectrogram } from './components/Spectrogram';
import { Scope } from './components/Scope';
import { GlottisView } from './components/GlottisView';
import { VowelChart } from './components/VowelChart';
import { TubeView } from './components/TubeView';
import { SourcePanel } from './components/SourcePanel';
import { TractPanel } from './components/TractPanel';
import { TeethPanel } from './components/TeethPanel';
import { NoisePanel } from './components/NoisePanel';
import { SpeakPanel } from './components/SpeakPanel';
import { MelodyPanel } from './components/MelodyPanel';
import { ABPanel } from './components/ABPanel';
import { MachinePanel } from './components/MachinePanel';
import { Meters } from './components/Meters';
import { CHAPTERS } from './tour';
import { resetAll } from './presets';

function Header() {
  const t = useT();
  const L = useL();
  const ui = useUi();
  const p = useParams();
  return (
    <header className="app-header">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
          <path d="M3 16 Q8 4 13 16 T23 16" fill="none" stroke="#f6a823" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M14 22 Q19 12 24 22 T31 20" fill="none" stroke="#2ad4bd" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
          <circle cx="8" cy="25" r="1.6" fill="#a98bfa" /><circle cx="12" cy="27.5" r="1.1" fill="#a98bfa" />
        </svg>
        <div>
          <h1>{t('appTitle')}</h1>
          <p>{t('appSub')}</p>
        </div>
      </div>
      <div className="seg mode">
        <button className={ui.mode === 'tour' ? 'on' : ''} onClick={() => store.setUi({ mode: 'tour' })}>{t('tour')}</button>
        <button className={ui.mode === 'lab' ? 'on' : ''} onClick={() => store.setUi({ mode: 'lab' })}>{t('lab')}</button>
      </div>
      <div className="header-actions">
        <button className={ui.audioOn ? 'btn on' : 'btn primary pulse'} onClick={() => void store.toggleAudio()}>
          {ui.audioOn ? '■ ' + t('audioOn') : '▶ ' + t('startAudio')}
        </button>
        <button className={p.phonate ? 'btn blow on' : 'btn blow'} onClick={() => { store.setParams((q) => { q.phonate = !q.phonate; }); if (!store.audio.running) void store.startAudio(); }}>
          {p.phonate ? t('blowing') : t('blow')}
        </button>
        <label className="mini vol">{t('volume')}
          <input type="range" min={-30} max={12} step={0.5} value={p.volume} onChange={(e) => store.setParams((q) => { q.volume = Number(e.target.value); })} />
        </label>
        <button className={ui.micOn ? 'chip on sky' : 'chip'} title={t('micHint')} onClick={async () => {
          if (ui.micOn) { store.audio.disableMic(); store.setUi({ micOn: false }); return; }
          try { await store.audio.enableMic(); store.setUi({ micOn: true }); } catch (e) { store.setUi({ info: String(e) }); }
        }}>🎙 {t('mic')}</button>
        <button className={ui.numbers ? 'chip on' : 'chip'} onClick={() => store.setUi({ numbers: !ui.numbers })}>123 {t('numbers')}</button>
        <button className={ui.freeze ? 'chip on' : 'chip'} onClick={() => store.setUi({ freeze: !ui.freeze })}>❚❚ {t('freeze')}</button>
        <button className="chip" onClick={resetAll}>{t('reset')}</button>
        <div className="seg lang">
          <button className={ui.lang === 'it' ? 'on' : ''} onClick={() => store.setUi({ lang: 'it' })}>IT</button>
          <button className={ui.lang === 'en' ? 'on' : ''} onClick={() => store.setUi({ lang: 'en' })}>EN</button>
        </div>
      </div>
      {ui.info && <div className="toast" onClick={() => store.setUi({ info: null })}>{ui.info} — {L({ it: 'clic per chiudere', en: 'click to close' })}</div>}
    </header>
  );
}

function TourCard() {
  const ui = useUi();
  const L = useL();
  const ch = CHAPTERS[ui.chapter];
  return (
    <div className="tour-card">
      <div className="tour-nav">
        {CHAPTERS.map((c, i) => (
          <button key={i} className={i === ui.chapter ? 'dot on' : 'dot'} title={L(c.title)} onClick={() => store.setUi({ chapter: i })}>{i}</button>
        ))}
      </div>
      <div className="kicker">{L(ch.kicker)}</div>
      <h2>{L(ch.title)}</h2>
      {ch.paragraphs.map((p, i) => <p key={i}>{L(p)}</p>)}
      <div className="tour-actions">
        {ch.actions.map((a, i) => <button key={i} className="btn try" onClick={a.run}>▸ {L(a.label)}</button>)}
      </div>
      <div className="row space">
        <button className="chip" disabled={ui.chapter === 0} onClick={() => store.setUi({ chapter: Math.max(0, ui.chapter - 1) })}>← {L({ it: 'indietro', en: 'back' })}</button>
        <button className="chip on" disabled={ui.chapter === CHAPTERS.length - 1} onClick={() => store.setUi({ chapter: Math.min(CHAPTERS.length - 1, ui.chapter + 1) })}>{L({ it: 'avanti', en: 'next' })} →</button>
      </div>
    </div>
  );
}

const CONTROL_TABS: [ControlTab, Parameters<ReturnType<typeof useT>>[0]][] = [
  ['source', 'cSource'], ['tract', 'cTract'], ['teeth', 'cTeeth'], ['noise', 'cNoise'], ['speak', 'cSpeak'], ['melody', 'cMelody'], ['ab', 'cAB'], ['machine', 'cMachine'],
];
const VIEW_TABS: [ViewTab, Parameters<ReturnType<typeof useT>>[0]][] = [
  ['chart', 'vChart'], ['spectrum', 'vSpectrum'], ['scope', 'vScope'], ['glottis', 'vGlottis'], ['tube', 'vTube'],
];

export function App() {
  const t = useT();
  const L = useL();
  const ui = useUi();
  const [wide, setWide] = useState(true);
  useEffect(() => { document.documentElement.lang = ui.lang; }, [ui.lang]);
  return (
    <div className="app">
      <Header />
      <main className={wide ? 'grid' : 'grid narrow'}>
        <section className="col-head card">
          <HeadView />
          <Meters />
        </section>
        <section className="col-views">
          <div className="card view-card">
            <nav className="tabs">
              {VIEW_TABS.map(([id, key]) => <button key={id} className={ui.viewTab === id ? 'on' : ''} onClick={() => store.setUi({ viewTab: id })}>{t(key)}</button>)}
            </nav>
            <div className="view-body">
              {ui.viewTab === 'spectrum' && <Spectrum />}
              {ui.viewTab === 'scope' && <Scope />}
              {ui.viewTab === 'glottis' && <GlottisView />}
              {ui.viewTab === 'chart' && <VowelChart />}
              {ui.viewTab === 'tube' && <TubeView />}
            </div>
          </div>
          <div className="card spec-card">
            <div className="card-title">{t('spectrogram')}</div>
            <Spectrogram />
          </div>
        </section>
        <section className="col-controls">
          {ui.mode === 'tour' && <TourCard />}
          <div className="card controls-card">
            <nav className="tabs wrap">
              {CONTROL_TABS.map(([id, key]) => <button key={id} className={ui.controlTab === id ? 'on' : ''} onClick={() => store.setUi({ controlTab: id })}>{t(key)}</button>)}
            </nav>
            {ui.controlTab === 'source' && <SourcePanel />}
            {ui.controlTab === 'tract' && <TractPanel />}
            {ui.controlTab === 'teeth' && <TeethPanel />}
            {ui.controlTab === 'noise' && <NoisePanel />}
            {ui.controlTab === 'speak' && <SpeakPanel />}
            {ui.controlTab === 'melody' && <MelodyPanel />}
            {ui.controlTab === 'ab' && <ABPanel />}
            {ui.controlTab === 'machine' && <MachinePanel />}
          </div>
        </section>
      </main>
      <footer className="app-footer">
        <span>{L({ it: 'Modello fisico: sorgente LF o a due masse, tratto vocale a guida d’onda (Kelly-Lochbaum) con naso e seni, turbolenza da numero di Reynolds, ostacolo dei denti. Dettagli e riferimenti nel README.', en: 'Physical model: LF or two-mass source, waveguide vocal tract (Kelly-Lochbaum) with nose and sinuses, Reynolds-number turbulence, teeth obstacle. Details and references in the README.' })}</span>
        <button className="chip" onClick={() => setWide(!wide)}>{wide ? '⇤⇥' : '⇥⇤'}</button>
      </footer>
    </div>
  );
}
