import { store, useStore, useTick } from '../store';
import { voice } from '../voice/voice';
import { useLock, useManual } from '../voice/hooks';
import { useL } from '../i18n';
import { Slider, Toggle, Seg, Section, Readout } from './controls';
import { VOICE_PRESETS } from '../presets';
import { noteName, C } from '../canvas';
import { quotients, rdToTiming } from '../../dsp/glottis/lf';

export function SourcePanel() {
  const L = useL();
  const p = useManual();
  const s = p.source;
  const numbers = useStore((st) => st.ui.numbers);
  // locked sliders show what sounds, so they follow it
  const driven = !!useLock('pitch') || !!useLock('lungs');
  useTick(driven ? 15 : numbers ? 4 : 0);
  const t = store.telemetry;
  const live = voice.sounding();
  const set = (f: (q: typeof p) => void) => voice.edit(f);
  const q = quotients(rdToTiming(s.rd));
  return (
    <div className="panel-body">
      <Section title={L({ it: 'Polmoni e corde vocali', en: 'Lungs and vocal folds' })} accent={C.amber}
        info={L({
          it: 'L’aria dei polmoni spinge le corde vocali e le apre; la loro elasticità e il risucchio dell’aria veloce le richiudono. Ogni ciclo lascia uscire uno sbuffo d’aria: tanti sbuffi al secondo sono il ronzio. La frequenza dei cicli è la nota (F0). Sotto circa 2-3 cm d’acqua di pressione le corde non vibrano più.',
          en: 'Air from the lungs pushes the vocal folds apart; their elasticity and the suction of the fast air pull them back. Each cycle lets out a puff of air: many puffs per second make the buzz. The rate of the cycles is the pitch (F0). Below about 2-3 cm of water of pressure the folds stop vibrating.',
        })}>
        <div className="row wrap">
          <Toggle label={L({ it: 'Soffia (polmoni)', en: 'Blow (lungs)' })} value={p.phonate} control="lungs" onChange={(v) => { if (v) void voice.ensureAudio(); set((x) => { x.phonate = v; }); }} />
          <Toggle label={L({ it: 'Le corde vibrano', en: 'Folds vibrate' })} value={p.voicing} control="quality" onChange={(v) => set((x) => { x.voicing = v; })} />
          <Toggle label={L({ it: 'Filtro: nessuno (senti il ronzio nudo)', en: 'Filter: none (hear the raw buzz)' })} value={p.bypassTract} control="filter" onChange={(v) => voice.setFilter(v ? 'bypass' : 'head')} />
        </div>
        <Slider label={L({ it: 'Nota F0', en: 'Pitch F0' })} value={s.f0} live={live.source.f0} control="pitch" min={40} max={900} log onChange={(v) => set((x) => { x.source.f0 = v; })} format={(v) => `${Math.round(v)} Hz · ${noteName(v)}`} color={C.amber}
          hint={L({ it: 'Tendere le corde le fa vibrare più in fretta: sale la fondamentale e tutte le armoniche con lei.', en: 'Stretching the folds makes them vibrate faster: the fundamental rises and every harmonic with it.' })} />
        <Slider label={L({ it: 'Pressione polmoni', en: 'Lung pressure' })} value={s.ps} live={live.source.ps} control="lungs" min={0} max={20} step={0.1} onChange={(v) => set((x) => { x.source.ps = v; })} format={(v) => `${v.toFixed(1)} cmH₂O`} />
        <Slider label={L({ it: 'Apertura glottide', en: 'Glottal opening' })} value={p.abduction} live={live.abduction} control="glottis" min={0} max={1} onChange={(v) => set((x) => { x.abduction = v; })} format={(v) => (v < 0.15 ? L({ it: 'chiusa (voce)', en: 'closed (voice)' }) : v < 0.4 ? L({ it: 'socchiusa', en: 'half open' }) : L({ it: 'aperta (respiro)', en: 'open (breath)' }))} />
        <Slider label={L({ it: 'Vibrato (cent)', en: 'Vibrato (cents)' })} value={s.vibratoDepth} control="pitch" min={0} max={120} step={1} onChange={(v) => set((x) => { x.source.vibratoDepth = v; })} format={(v) => `${v.toFixed(0)} · ${s.vibratoRate.toFixed(1)} Hz`} />
      </Section>

      <Section title={L({ it: 'Tipi di voce', en: 'Voice types' })} accent={C.amber}>
        <div className="chips">
          {VOICE_PRESETS.map((v) => (
            <button key={v.id} className="chip" title={L(v.hint)} onClick={() => { voice.edit((x) => { v.apply(x); x.phonate = true; }, { takeOver: true }); void voice.ensureAudio(); }}>{L(v.name)}</button>
          ))}
        </div>
      </Section>

      <Section title={L({ it: 'Modello delle corde', en: 'Vocal fold model' })} accent={C.amber}
        info={L({
          it: 'Liljencrants-Fant (LF): la forma dello sbuffo è descritta da pochi numeri. Rd va da voce pressata (0,3) a soffiata (2,7): con Rd alto la chiusura è più dolce e le armoniche acute calano. «Due masse»: le corde sono simulate come due masse elastiche per lato che oscillano da sole spinte dall’aria; la nota nasce dalla tensione.',
          en: 'Liljencrants-Fant (LF): the shape of each puff is described by a few numbers. Rd goes from pressed (0.3) to breathy (2.7) voice: with a high Rd the closure is gentler and the high harmonics drop. “Two-mass”: each fold is two elastic masses that oscillate on their own, driven by the air; the pitch comes from the tension.',
        })}>
        <Seg value={s.model} control="quality" options={[['lf', 'LF (Fant 1985)'], ['twomass', L({ it: 'Due masse (auto-oscillanti)', en: 'Two-mass (self-oscillating)' })]]} onChange={(v) => set((x) => { x.source.model = v; })} />
        {s.model === 'lf' ? <>
          <Toggle label={L({ it: 'Parametri separati (Oq, αm, Ra)', en: 'Separate parameters (Oq, αm, Ra)' })} value={s.advanced} control="quality" onChange={(v) => set((x) => { x.source.advanced = v; })} />
          {!s.advanced ? (
            <Slider label="Rd" value={s.rd} control="quality" min={0.3} max={2.7} onChange={(v) => set((x) => { x.source.rd = v; })} format={(v) => `${v.toFixed(2)} · ${v < 0.7 ? L({ it: 'pressata', en: 'pressed' }) : v < 1.4 ? L({ it: 'modale', en: 'modal' }) : L({ it: 'soffiata', en: 'breathy' })}`} />
          ) : <>
            <Slider label={L({ it: 'Quoziente di apertura Oq', en: 'Open quotient Oq' })} value={s.oq} control="quality" min={0.3} max={0.95} onChange={(v) => set((x) => { x.source.oq = v; })} />
            <Slider label={L({ it: 'Asimmetria αm', en: 'Asymmetry αm' })} value={s.alphaM} control="quality" min={0.55} max={0.9} onChange={(v) => set((x) => { x.source.alphaM = v; })} />
            <Slider label={L({ it: 'Fase di ritorno Ra', en: 'Return phase Ra' })} value={s.ra} control="quality" min={0.005} max={0.2} step={0.001} onChange={(v) => set((x) => { x.source.ra = v; })} format={(v) => v.toFixed(3)} />
          </>}
          <Slider label={L({ it: 'Apertura massima', en: 'Peak opening' })} value={s.peakArea} control="quality" min={0.02} max={0.3} step={0.005} onChange={(v) => set((x) => { x.source.peakArea = v; })} format={(v) => `${v.toFixed(3)} cm²`} />
          <Slider label={L({ it: 'Interazione sorgente-tratto', en: 'Source-tract interaction' })} value={s.interaction} control="quality" min={0} max={1} onChange={(v) => set((x) => { x.source.interaction = v; })} />
        </> : <>
          <Toggle label={L({ it: 'Tensione automatica (segue la nota)', en: 'Automatic tension (follows the pitch)' })} value={s.tensionAuto} control="quality" onChange={(v) => set((x) => { x.source.tensionAuto = v; })} />
          {!s.tensionAuto && <Slider label={L({ it: 'Tensione Q', en: 'Tension Q' })} value={s.q} control="quality" min={0.4} max={4} onChange={(v) => set((x) => { x.source.q = v; })} />}
          <Slider label={L({ it: 'Asimmetria sinistra/destra', en: 'Left/right asymmetry' })} value={s.asym} control="quality" min={0} max={0.8} onChange={(v) => set((x) => { x.source.asym = v; })} />
          <Slider label={L({ it: 'Apertura a riposo', en: 'Rest opening' })} value={s.restArea} control="quality" min={0} max={0.12} step={0.002} onChange={(v) => set((x) => { x.source.restArea = v; })} format={(v) => `${v.toFixed(3)} cm²`} />
        </>}
        <Slider label={L({ it: 'Fessura posteriore (perdita)', en: 'Posterior chink (leak)' })} value={s.chink} control="quality" min={0} max={0.2} step={0.002} onChange={(v) => set((x) => { x.source.chink = v; })} format={(v) => `${v.toFixed(3)} cm²`} />
        <Readout items={[
          ['Oq', q.oq.toFixed(2)], ['αm', q.alphaM.toFixed(2)], ['Ra', q.ra.toFixed(3)],
          ['F0', t?.f0 ? `${t.f0.toFixed(1)} Hz` : '–'], [L({ it: 'Re glottide', en: 'glottal Re' }), t ? t.glottalRe.toFixed(0) : '–'],
          ['Po', t ? `${(t.po / 980.665).toFixed(2)} cmH₂O` : '–'], ['Ug', t ? `${t.ug.toFixed(0)} cm³/s` : '–'],
        ]} />
      </Section>

      <Section title={L({ it: 'Irregolarità', en: 'Irregularities' })} accent={C.amber} open={false}
        info={L({ it: 'Jitter e shimmer: piccole variazioni da un ciclo all’altro della durata e dell’ampiezza. Diplofonia: cicli alterni più deboli, tipici della voce cricchiata.', en: 'Jitter and shimmer: small cycle-to-cycle variations of period and amplitude. Diplophonia: every other cycle weaker, typical of creaky voice.' })}>
        <Slider label="Jitter" value={s.jitter} control="quality" min={0} max={8} step={0.1} onChange={(v) => set((x) => { x.source.jitter = v; })} format={(v) => `${v.toFixed(1)} %`} />
        <Slider label="Shimmer" value={s.shimmer} control="quality" min={0} max={20} step={0.1} onChange={(v) => set((x) => { x.source.shimmer = v; })} format={(v) => `${v.toFixed(1)} %`} />
        <Slider label={L({ it: 'Diplofonia', en: 'Diplophonia' })} value={s.diplophonia} control="quality" min={0} max={1} onChange={(v) => set((x) => { x.source.diplophonia = v; })} />
        <Slider label={L({ it: 'Velocità vibrato', en: 'Vibrato rate' })} value={s.vibratoRate} control="pitch" min={3} max={8} step={0.1} onChange={(v) => set((x) => { x.source.vibratoRate = v; })} format={(v) => `${v.toFixed(1)} Hz`} />
      </Section>
    </div>
  );
}
