import { useL } from '../i18n';
import { HeadView } from '../components/HeadView';
import { VowelChart } from '../components/VowelChart';
import { Spectrogram } from '../components/Spectrogram';
import { PHONEMES } from '../../dsp/speech/phonemes';
import { Card } from '../ds';
import { useLanes, useVoice } from '../voice/hooks';
import { PhonemeButtons, SayBox, VoiceTiles } from './quick';

/** What the hands hold, or who plays, in a few words under the head. */
function Holding() {
  const L = useL();
  const held = useVoice((v) => v.held.phoneme);
  const perf = useLanes().performer;
  const sound = useVoice((v) => v.soundOn);
  if (perf.kind === 'sentence') return <p className="holding">{L({ it: 'Sta dicendo', en: 'Speaking' })} <b>«{L(perf.label)}»</b></p>;
  if (!sound) return <p className="holding muted">{L({ it: 'Premi «▶ Suono» o scegli un suono', en: 'Press “▶ Sound” or pick a sound' })}</p>;
  if (!held) return <p className="holding">{L({ it: 'Una forma tutta tua: trascina le maniglie', en: 'A shape of your own: drag the handles' })}</p>;
  const vowel = PHONEMES[held]?.manner === 'vowel';
  return (
    <p className="holding">
      {L({ it: 'Stai tenendo', en: 'You are holding' })}: {vowel ? L({ it: 'la vocale', en: 'the vowel' }) : L({ it: 'la consonante', en: 'the consonant' })} <b className="ipa">/{held}/</b>
      {PHONEMES[held]?.examples && <span className="muted"> · {PHONEMES[held].examples}</span>}
    </p>
  );
}

/**
 * Play: for someone who wants to try things without knowing the theory. A
 * big head, four friendly cards and the spectrogram running along the bottom.
 */
export function Play() {
  const L = useL();
  const sound = useVoice((v) => v.soundOn);
  return (
    <main className="play">
      <section className="play-head ds-card">
        <header className="play-title">
          <h2>{L({ it: 'Dai forma al suono', en: 'Shape your sound' })}</h2>
          <p className="muted">{L({ it: 'Trascina una maniglia e ascolta che cosa cambia.', en: 'Drag a handle. Hear what changes.' })}</p>
        </header>
        <HeadView />
        <Holding />
      </section>
      <aside className="play-cards">
        <Card title={L({ it: 'Di’ qualcosa', en: 'Say something' })}><SayBox /></Card>
        <Card title={L({ it: 'Scegli un suono', en: 'Pick a sound' })}>
          <PhonemeButtons list={['a', 'e', 'i', 'o', 'u', 'ə']} />
          <PhonemeButtons list={['m', 'n', 's', 'ʃ', 'f', 'l', 'r']} size="small" />
        </Card>
        <Card title={L({ it: 'Chi parla', en: 'Who is speaking' })}><VoiceTiles /></Card>
        <Card title={L({ it: 'Trova la tua vocale', en: 'Find your vowel' })} sub={L({ it: 'Clicca una vocale o trascina sulla mappa', en: 'Click a vowel or drag across the map' })} className="play-chart"><VowelChart /></Card>
      </aside>
      <section className="play-spectro ds-card">
        <h3 className="strip-title">{L({ it: 'Spettrogramma', en: 'Spectrogram' })}{sound && <span className="live-dot">● {L({ it: 'dal vivo', en: 'live' })}</span>}</h3>
        <Spectrogram />
      </section>
    </main>
  );
}
