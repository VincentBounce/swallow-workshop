import { useRef, useState } from 'react';
import { store } from '../store';
import { useL } from '../i18n';
import { Section } from './controls';
import { useAnimatedCanvas, C } from '../canvas';
import { renderOffline } from '../../dsp/engine/engine';
import { EngineParams } from '../../dsp/engine/params';
import { welch } from '../../dsp/util/fft';
import { applyPhoneme, VOICE_PRESETS, TIMBRE_PRESETS } from '../presets';

type Bi = { it: string; en: string };
interface Experiment { id: string; title: Bi; question: Bi; a: Bi; b: Bi; setA: (p: EngineParams) => void; setB: (p: EngineParams) => void; answer: Bi }

const vowelAt = (v: string, f0: number) => (p: EngineParams) => { applyPhoneme(v, p); p.source.f0 = f0; };
const preset = (list: typeof VOICE_PRESETS, id: string) => list.find((x) => x.id === id)!.apply;

const EXPERIMENTS: Experiment[] = [
  {
    id: 'pitch', title: { it: 'Stesso filtro, altra nota', en: 'Same filter, different pitch' },
    question: { it: 'La vocale cambia se alzo la nota?', en: 'Does the vowel change if I raise the pitch?' },
    a: { it: '«a» a 110 Hz', en: '“ah” at 110 Hz' }, b: { it: '«a» a 220 Hz', en: '“ah” at 220 Hz' },
    setA: vowelAt('a', 110), setB: vowelAt('a', 220),
    answer: { it: 'Le armoniche si allargano e scorrono sotto lo stesso inviluppo: la vocale resta «a» e la voce resta riconoscibile.', en: 'The harmonics spread apart and slide under the same envelope: the vowel stays “ah” and the voice stays recognizable.' },
  },
  {
    id: 'vowel', title: { it: 'Stessa nota, altro filtro', en: 'Same pitch, different filter' },
    question: { it: 'Cosa cambia tra «a» e «i» sulla stessa nota?', en: 'What changes between “ah” and “ee” on the same note?' },
    a: { it: '«a» a 150 Hz', en: '“ah” at 150 Hz' }, b: { it: '«i» a 150 Hz', en: '“ee” at 150 Hz' },
    setA: vowelAt('a', 150), setB: vowelAt('i', 150),
    answer: { it: 'Le armoniche restano agli stessi multipli di 150 Hz; cambia l’inviluppo: in «i» F1 scende e F2 sale.', en: 'The harmonics stay at the same multiples of 150 Hz; the envelope changes: in “ee” F1 drops and F2 rises.' },
  },
  {
    id: 'size', title: { it: 'Stessa vocale, altro corpo', en: 'Same vowel, different body' },
    question: { it: 'Un tratto più corto, con la stessa nota?', en: 'A shorter tract, with the same pitch?' },
    a: { it: 'tratto adulto', en: 'adult tract' }, b: { it: 'tratto di bambino', en: 'child tract' },
    setA: (p) => { vowelAt('a', 180)(p); p.anatomy.scale = 1; }, setB: (p) => { vowelAt('a', 180)(p); p.anatomy.scale = 0.74; p.anatomy.pharynx = 0.82; },
    answer: { it: 'Tutte le formanti salgono di circa un terzo: è la stessa «a», ma di una persona più piccola.', en: 'All formants rise by about a third: the same “ah”, from a smaller person.' },
  },
  {
    id: 'timbre', title: { it: 'Scuro contro chiaro', en: 'Dark versus bright' },
    question: { it: 'Cosa fa la forma della gola?', en: 'What does the shape of the throat do?' },
    a: { it: 'laringe bassa, faringe ampia', en: 'low larynx, wide pharynx' }, b: { it: 'laringe alta, faringe stretta', en: 'high larynx, narrow pharynx' },
    setA: (p) => { vowelAt('ə', 130)(p); preset(TIMBRE_PRESETS, 'dark')(p); }, setB: (p) => { vowelAt('ə', 130)(p); preset(TIMBRE_PRESETS, 'bright')(p); },
    answer: { it: 'Stessa vocale e stessa nota, ma l’inviluppo si sposta: è una parte del timbro che appartiene alla persona.', en: 'Same vowel and pitch, but the envelope shifts: a part of timbre that belongs to the person.' },
  },
  {
    id: 'nasal', title: { it: 'Velo chiuso contro aperto', en: 'Velum closed versus open' },
    question: { it: 'Che cosa aggiunge il naso?', en: 'What does the nose add?' },
    a: { it: '«a» orale', en: 'oral “ah”' }, b: { it: '«a» nasalizzata', en: 'nasalized “ah”' },
    setA: vowelAt('a', 130), setB: (p) => { vowelAt('a', 130)(p); p.articulators.velum = 0.7; },
    answer: { it: 'Il ramo nasale aggiunge risonanze e antirisonanze: F1 si allarga e si abbassa, compaiono valli nello spettro.', en: 'The nasal branch adds resonances and anti-resonances: F1 broadens and drops, valleys appear in the spectrum.' },
  },
  {
    id: 'nostril', title: { it: 'Una narice tappata', en: 'One nostril pinched' },
    question: { it: 'Il naso ha due strade: cosa succede se ne chiudo una?', en: 'The nose has two passages: what happens if I close one?' },
    a: { it: '«m» con il naso libero', en: '“m” with a free nose' }, b: { it: '«m» con la narice sinistra tappata', en: '“m” with the left nostril pinched' },
    setA: vowelAt('m', 130), setB: (p) => { vowelAt('m', 130)(p); p.anatomy.nostrilLeft = 0; },
    answer: { it: 'La fossa tappata diventa un ramo chiuso: aggiunge un’antirisonanza verso 560 Hz e abbassa la prima risonanza del ronzio da circa 320 a 240 Hz. Tappandole tutte e due l’aria non esce più e il ronzio si spegne.', en: 'The pinched passage becomes a closed side branch: it adds an antiresonance near 560 Hz and lowers the first resonance of the hum from about 320 to 240 Hz. Pinch both and the air has no way out: the hum dies.' },
  },
  {
    id: 'pulse', title: { it: 'Fruscio costante contro pulsato', en: 'Steady versus pulsed hiss' },
    question: { it: 'Il fruscio della voce soffiata è costante?', en: 'Is the hiss of a breathy voice steady?' },
    a: { it: 'fruscio costante', en: 'steady hiss' }, b: { it: 'fruscio pulsato (fisico)', en: 'pulsed hiss (physical)' },
    setA: (p) => { vowelAt('a', 110)(p); preset(VOICE_PRESETS, 'breathy')(p); p.noise.aspirationPulse = 0; p.noise.aspiration = 8; },
    setB: (p) => { vowelAt('a', 110)(p); preset(VOICE_PRESETS, 'breathy')(p); p.noise.aspirationPulse = 1; p.noise.aspiration = 8; },
    answer: { it: 'Nella voce vera il fruscio pulsa a ogni ciclo delle corde, più forte quando sono aperte: suona più naturale e si fonde col ronzio.', en: 'In a real voice the hiss pulses with every cycle of the folds, strongest while they are open: it sounds more natural and fuses with the buzz.' },
  },
  {
    id: 'whisper', title: { it: 'Voce contro sussurro', en: 'Voice versus whisper' },
    question: { it: 'Senza ronzio la vocale si capisce ancora?', en: 'Without the buzz, is the vowel still there?' },
    a: { it: '«i» con voce', en: 'voiced “ee”' }, b: { it: '«i» sussurrata', en: 'whispered “ee”' },
    setA: vowelAt('i', 120), setB: (p) => { vowelAt('i', 120)(p); preset(VOICE_PRESETS, 'whisper')(p); },
    answer: { it: 'Il filtro è lo stesso: le formanti si vedono anche nel fruscio, ma non ci sono armoniche né nota.', en: 'The filter is the same: the formants show in the hiss too, but there are no harmonics and no pitch.' },
  },
  {
    id: 'model', title: { it: 'Due modelli di corde', en: 'Two fold models' },
    question: { it: 'Sbuffi disegnati o corde che oscillano da sole?', en: 'Drawn puffs or folds that oscillate on their own?' },
    a: { it: 'modello LF', en: 'LF model' }, b: { it: 'modello a due masse', en: 'two-mass model' },
    setA: vowelAt('a', 120), setB: (p) => { vowelAt('a', 120)(p); p.source.model = 'twomass'; },
    answer: { it: 'Il secondo nasce dalla fisica delle corde: la forma dello sbuffo cambia con la pressione e con il tratto (interazione).', en: 'The second comes from the physics of the folds: the shape of the puff changes with pressure and with the tract (interaction).' },
  },
];

interface Clip { samples: Float32Array; spec: Float64Array; label: string }

export function ABPanel() {
  const L = useL();
  const [exp, setExp] = useState(EXPERIMENTS[0]);
  const [clips, setClips] = useState<{ a: Clip | null; b: Clip | null }>({ a: null, b: null });
  const [busy, setBusy] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const custom = useRef<{ a: EngineParams | null; b: EngineParams | null }>({ a: null, b: null });

  const render = (p: EngineParams, lbl: string): Clip => {
    const q: EngineParams = structuredClone(p);
    q.phonate = true;
    const { out } = renderOffline(q, 1.5, 48000);
    const body = out.subarray(9600);
    // fade in/out
    const s = out.slice();
    for (let i = 0; i < 2400; i++) { s[i] *= i / 2400; s[s.length - 1 - i] *= i / 2400; }
    return { samples: s, spec: welch(body, 4096), label: lbl };
  };
  const base = (): EngineParams => structuredClone(store.params);
  const run = (which: 'a' | 'b') => {
    setBusy(true);
    setTimeout(() => {
      let p: EngineParams;
      if (exp.id === 'custom') {
        const c = custom.current[which];
        if (!c) { setBusy(false); return; }
        p = structuredClone(c);
      } else { p = base(); (which === 'a' ? exp.setA : exp.setB)(p); }
      const clip = render(p, L(which === 'a' ? exp.a : exp.b));
      setClips((c) => ({ ...c, [which]: clip }));
      void store.playClip(clip.samples, 48000);
      setBusy(false);
    }, 10);
  };

  const ref = useAnimatedCanvas(({ ctx, w, h }) => {
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, w, h);
    const fmax = 5000;
    const X = (f: number) => 30 + (f / fmax) * (w - 40);
    const Y = (db: number) => 8 + (-db / 80) * (h - 26);
    ctx.strokeStyle = C.grid; ctx.fillStyle = C.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let f = 0; f <= fmax; f += 1000) { ctx.beginPath(); ctx.moveTo(X(f), 8); ctx.lineTo(X(f), h - 18); ctx.stroke(); ctx.fillText(f ? f / 1000 + 'k' : '0', X(f), h - 15); }
    const all = [clips.a, clips.b].filter(Boolean) as Clip[];
    let mx = -200;
    for (const c of all) for (let k = 1; k < c.spec.length; k++) { const f = (k * 48000) / 4096; if (f > fmax) break; mx = Math.max(mx, 10 * Math.log10(c.spec[k] + 1e-20)); }
    const draw = (c: Clip | null, col: string) => {
      if (!c) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 1; k < c.spec.length; k++) { const f = (k * 48000) / 4096; if (f > fmax) break; const y = Y(Math.max(-80, 10 * Math.log10(c.spec[k] + 1e-20) - mx)); if (k === 1) ctx.moveTo(X(f), y); else ctx.lineTo(X(f), y); }
      ctx.stroke();
    };
    draw(clips.a, C.amber); draw(clips.b, C.teal);
    if (!all.length) { ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText(L({ it: 'ascolta A e B per confrontare gli spettri', en: 'listen to A and B to compare their spectra' }), w / 2, h / 2); }
  });

  return (
    <div className="panel-body">
      <Section title={L({ it: 'Esperimento A/B', en: 'A/B experiment' })} accent={C.teal}
        info={L({ it: 'L’idea chiave: ronzio e filtro si controllano quasi indipendentemente. Ogni esperimento cambia una cosa sola tra A e B; ascolta e guarda come si spostano armoniche e inviluppo. Con «I miei A e B» confronti due stati del laboratorio catturati da te.', en: 'The key idea: buzz and filter are controlled almost independently. Each experiment changes one thing between A and B; listen and watch how the harmonics and the envelope move. With “My A and B” you compare two lab states you captured.' })}>
        <select value={exp.id} onChange={(e) => { setExp(e.target.value === 'custom' ? { ...EXPERIMENTS[0], id: 'custom', title: { it: 'I miei A e B', en: 'My A and B' }, question: { it: 'Cattura due stati e confrontali.', en: 'Capture two states and compare them.' }, a: { it: 'A', en: 'A' }, b: { it: 'B', en: 'B' }, answer: { it: '', en: '' } } : EXPERIMENTS.find((x) => x.id === e.target.value)!); setClips({ a: null, b: null }); setShowAnswer(false); }}>
          {EXPERIMENTS.map((x) => <option key={x.id} value={x.id}>{L(x.title)}</option>)}
          <option value="custom">{L({ it: 'I miei A e B', en: 'My A and B' })}</option>
        </select>
        <p className="question">{L(exp.question)}</p>
        {exp.id === 'custom' && (
          <div className="row">
            <button className="chip" onClick={() => { custom.current.a = structuredClone(store.params); setClips((c) => ({ ...c, a: null })); }}>{L({ it: 'Cattura A dal laboratorio', en: 'Capture A from the lab' })}{custom.current.a ? ' ✓' : ''}</button>
            <button className="chip" onClick={() => { custom.current.b = structuredClone(store.params); setClips((c) => ({ ...c, b: null })); }}>{L({ it: 'Cattura B dal laboratorio', en: 'Capture B from the lab' })}{custom.current.b ? ' ✓' : ''}</button>
          </div>
        )}
        <div className="ab-buttons">
          <button className="btn ab a" disabled={busy} onClick={() => run('a')}><b>A</b> {L(exp.a)}</button>
          <button className="btn ab b" disabled={busy} onClick={() => run('b')}><b>B</b> {L(exp.b)}</button>
        </div>
        <canvas ref={ref} className="ab-canvas" />
        {exp.id !== 'custom' && (
          showAnswer ? <p className="answer">{L(exp.answer)}</p> : <button className="chip" onClick={() => setShowAnswer(true)}>{L({ it: 'Cosa succede?', en: 'What happens?' })}</button>
        )}
      </Section>
    </div>
  );
}
