import { useL } from '../i18n';
import { HeadView } from '../components/HeadView';
import { PHONEMES } from '../../dsp/speech/phonemes';
import { store, useUi, PlayActivity, ViewTab } from '../store';
import { useLanes, useVoice } from '../voice/hooks';
import { ViewFrame } from './views';
import { PhonemeButtons, SayBox, VoiceTiles } from './quick';

type Bi = { it: string; en: string };

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ə'];

/** The four things to do, each with the one view that shows it best. */
const ACTIVITIES: { id: PlayActivity; icon: string; name: Bi; hint: Bi; view: ViewTab }[] = [
  { id: 'speak', icon: '🗣', name: { it: 'Parla', en: 'Speak' }, hint: { it: 'scrivi una frase e ascoltala', en: 'type a sentence, hear it' }, view: 'spectrogram' },
  { id: 'sounds', icon: 'ə', name: { it: 'Suoni', en: 'Sounds' }, hint: { it: 'una vocale o una consonante', en: 'a vowel or a consonant' }, view: 'spectrum' },
  { id: 'voices', icon: '👤', name: { it: 'Voci', en: 'Voices' }, hint: { it: 'uomo, donna, bambino, sussurro', en: 'man, woman, child, whisper' }, view: 'spectrum' },
  { id: 'vowels', icon: '◉', name: { it: 'Vocali', en: 'Vowels' }, hint: { it: 'trova la tua vocale sulla mappa', en: 'find your vowel on the map' }, view: 'chart' },
];

/** What the hands hold, or who plays, in a few words under the head. */
function Holding() {
  const L = useL();
  const held = useVoice((v) => v.held.phoneme);
  const perf = useLanes().performer;
  const sound = useVoice((v) => v.soundOn);
  if (perf.kind === 'sentence') return <p className="holding">{L({ it: 'Sta dicendo', en: 'Speaking' })} <b>«{L(perf.label)}»</b></p>;
  // silent: the head itself says how to give it a voice
  if (!sound) return null;
  if (!held) return <p className="holding">{L({ it: 'Una forma tutta tua: trascina le maniglie', en: 'A shape of your own: drag the handles' })}</p>;
  const vowel = PHONEMES[held]?.manner === 'vowel';
  return (
    <p className="holding">
      {L({ it: 'Stai tenendo', en: 'You are holding' })}: {vowel ? L({ it: 'la vocale', en: 'the vowel' }) : L({ it: 'la consonante', en: 'the consonant' })} <b className="ipa">/{held}/</b>
      {PHONEMES[held]?.examples && <span className="muted"> · {PHONEMES[held].examples}</span>}
    </p>
  );
}

/** The controls of one activity, and nothing else. */
function Controls({ id }: { id: PlayActivity }) {
  const L = useL();
  if (id === 'speak') return <SayBox />;
  if (id === 'sounds') return (
    <>
      <PhonemeButtons list={VOWELS} label={{ it: 'Vocali', en: 'Vowels' }} />
      <PhonemeButtons list={['m', 'n', 's', 'ʃ', 'f', 'l', 'r']} size="small" label={{ it: 'Consonanti', en: 'Consonants' }} />
    </>
  );
  if (id === 'voices') return (
    <>
      <VoiceTiles />
      <PhonemeButtons list={VOWELS} size="small" label={{ it: 'Ascoltala su', en: 'Hear it on' }} />
    </>
  );
  return (
    <>
      <PhonemeButtons list={VOWELS} />
      <p className="muted play-note">{L({ it: 'Clicca una vocale o trascina il punto sulla mappa: la lingua lo segue.', en: 'Click a vowel or drag the dot across the map: the tongue follows it.' })}</p>
    </>
  );
}

/**
 * Play: for someone who wants to try things without knowing the theory. One
 * activity at a time: the head, the one view that shows the activity, and its
 * few controls under them.
 */
export function Play() {
  const L = useL();
  const id = useUi().playActivity;
  const a = ACTIVITIES.find((x) => x.id === id)!;
  return (
    <main className="play">
      <nav className="play-tabs" role="tablist" aria-label={L({ it: 'Che cosa fare', en: 'What to do' })}>
        {ACTIVITIES.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === id} className={x.id === id ? 'play-tab on' : 'play-tab'} onClick={() => store.setUi({ playActivity: x.id })}>
            <span className="play-tab-icon" aria-hidden>{x.icon}</span>
            <span className="play-tab-text"><b>{L(x.name)}</b><small>{L(x.hint)}</small></span>
          </button>
        ))}
      </nav>
      <section className="play-stage">
        <div className="play-head ds-card">
          <HeadView />
          <Holding />
        </div>
        <ViewFrame key={a.id} className="play-view" view={a.view} />
      </section>
      <section className="play-controls ds-card" role="tabpanel">
        <Controls id={id} />
      </section>
    </main>
  );
}
