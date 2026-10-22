import { useL } from '../i18n';
import { useTick } from '../store';
import { voice } from '../voice/voice';
import { useLanes, useVoice } from '../voice/hooks';
import type { Bi, Lock, Performer } from '../voice/drivers';

type Busy = Exclude<Performer, { kind: 'hands' }>['kind'];

const PERFORMER: Record<Busy, Bi> = {
  sentence: { it: 'Frase', en: 'Sentence' },
  melody: { it: 'Melodia', en: 'Melody' },
  glide: { it: 'La nota scivola', en: 'Pitch glide' },
  clip: { it: 'Suona', en: 'Playing' },
};

/** What each performer takes from the hands while it plays. */
const OWNS: Record<Busy, Bi> = {
  sentence: { it: 'muove lingua, labbra, mascella, velo, nota, polmoni e glottide', en: 'moves the tongue, lips, jaw, velum, pitch, lungs and glottis' },
  melody: { it: 'suona nota, polmoni e glottide: la bocca resta tua', en: 'plays the pitch, lungs and glottis: the mouth stays yours' },
  glide: { it: 'muove la nota', en: 'moves the pitch' },
  clip: { it: 'suona da sola: i controlli aspettano', en: 'plays on its own: the controls wait' },
};

/** Why a control (or the whole head) is locked, and how to get it back. */
export function lockText(l: Lock, what: 'control' | 'head' = 'control'): Bi {
  const head = what === 'head';
  const drives: Bi = head ? { it: 'muove la testa', en: 'moves the head' } : { it: 'muove questo controllo', en: 'drives this control' };
  const use: Bi = head ? { it: 'per muoverla a mano', en: 'to move it by hand' } : { it: 'per usare questo controllo', en: 'to use this control' };
  switch (l.by) {
    case 'sentence': return { it: `La frase «${l.label.it}» ${drives.it}. Fermala o riprendi il controllo.`, en: `The sentence “${l.label.en}” ${drives.en}. Stop it or take over.` };
    case 'melody': return { it: `La melodia ${drives.it}. Fermala o riprendi il controllo.`, en: `The melody ${drives.en}. Stop it or take over.` };
    case 'glide': return { it: 'La nota sta scivolando da sola: aspetta un attimo o fermala.', en: 'The pitch is gliding by itself: wait a moment or stop it.' };
    case 'clip': return { it: `Suona «${l.label.it}»: aspetta che finisca o fermalo.`, en: `“${l.label.en}” is playing: wait for it to end or stop it.` };
    case 'tube': return { it: `Il filtro è il ${l.label.it}: la testa non viene usata. Torna alla testa ${use.it}.`, en: `The filter is the ${l.label.en}: the head is not used. Go back to the head ${use.en}.` };
    case 'bypass': return { it: `Nessun filtro: senti la sorgente nuda e la testa non viene usata. Torna alla testa ${use.it}.`, en: `No filter: you hear the raw source and the head is not used. Go back to the head ${use.en}.` };
  }
}

/** Who holds a control, in a few words (for badges). */
export function lockShort(l: Lock): Bi {
  switch (l.by) {
    case 'sentence': return { it: `frase «${l.label.it}»`, en: `sentence “${l.label.en}”` };
    case 'melody': return { it: 'melodia', en: 'melody' };
    case 'glide': return { it: 'nota che scivola', en: 'pitch glide' };
    case 'clip': return l.label;
    case 'tube': return l.label;
    case 'bypass': return { it: 'filtro: nessuno', en: 'filter: none' };
  }
}

/** Who drives the voice right now, what that locks, and the way back to the hands. */
export function DriverBar() {
  const L = useL();
  const lanes = useLanes();
  const sound = useVoice((v) => v.soundOn);
  const running = useVoice((v) => v.running);
  const p = lanes.performer, f = lanes.filter;
  useTick(p.kind !== 'hands' ? 12 : 0);
  const pr = voice.progress();
  return (
    <div className="driver-bar" role="status">
      {p.kind === 'hands' ? (
        <span className="driver hands">
          <span aria-hidden>✋</span> {L({ it: 'Le tue mani guidano la voce', en: 'Your hands drive the voice' })}
          {!sound && <em> · {running ? L({ it: 'polmoni spenti: premi «Suono» per sentirla', en: 'lungs off: press “Sound” to hear it' }) : L({ it: 'suono spento: premi «Suono» per sentirla', en: 'sound off: press “Sound” to hear it' })}</em>}
        </span>
      ) : (
        <span className="driver busy">
          <b>{L(PERFORMER[p.kind])}</b> <span className="driver-label">{L(p.label)}</span>
          {pr && pr.seconds > 0 && <span className="progress" aria-hidden><span style={{ width: `${100 * Math.min(1, pr.t / pr.seconds)}%` }} /></span>}
          <span className="small muted">{L(p.kind === 'melody' && p.buzz ? { it: 'suona nota, polmoni e glottide senza filtro', en: 'plays the pitch, lungs and glottis with no filter' } : OWNS[p.kind])}</span>
          <button className="chip" onClick={() => voice.stop()}>■ {L({ it: 'Ferma', en: 'Stop' })}</button>
          {p.kind !== 'glide' && !(p.kind === 'clip' && p.samples) && (
            <button className="chip on teal" title={L({ it: 'Ferma qui e tieni la posizione e la nota che suonano adesso', en: 'Stop here and keep the posture and pitch sounding now' })} onClick={() => voice.takeOver()}>
              ✋ {L({ it: 'Riprendi il controllo', en: 'Take over' })}
            </button>
          )}
        </span>
      )}
      {f.kind !== 'head' && (
        <span className="driver filter">
          <b>{L({ it: 'Filtro', en: 'Filter' })}:</b> {f.kind === 'tube' ? L(f.label) : L({ it: 'nessuno, senti la sorgente nuda', en: 'none, you hear the raw source' })}
          <span className="small muted">{L({ it: 'la testa non viene usata', en: 'the head is not used' })}</span>
          <button className="chip" onClick={() => voice.setFilter('head', { takeOver: true })}>{L({ it: 'Torna alla testa', en: 'Back to the head' })}</button>
        </span>
      )}
    </div>
  );
}
