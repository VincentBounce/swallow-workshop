import { useState } from 'react';
import { store, useUi, useTick } from '../store';
import { useL } from '../i18n';
import { Slider, Section, Seg } from './controls';
import { C } from '../canvas';
import { textToPhones, Phone } from '../../dsp/speech/g2p';
import { buildScore } from '../../dsp/speech/sequencer';

const EXAMPLES: { text: string; lang: 'it' | 'en' }[] = [
  { text: 'sasso', lang: 'it' }, { text: 'mamma', lang: 'it' }, { text: 'voce', lang: 'it' }, { text: 'la voce è fatta di aria', lang: 'it' },
  { text: 'ciao, come stai?', lang: 'it' }, { text: 'gnocchi e pizza', lang: 'it' },
  { text: 'heed', lang: 'en' }, { text: 'father', lang: 'en' }, { text: 'hiss', lang: 'en' }, { text: 'this', lang: 'en' },
  { text: 'a buzz and a hiss', lang: 'en' },
];

/**
 * Text to speech with the articulatory model: spelling -> phonemes ->
 * gestural score (targets that overlap in time) -> the same physical engine.
 */
export function SpeakPanel() {
  const L = useL();
  const ui = useUi();
  const [text, setText] = useState('la voce è fatta di aria');
  const [lang, setLang] = useState<'it' | 'en'>('it');
  const [rate, setRate] = useState(1);
  const [accent, setAccent] = useState(3);
  useTick(ui.speaking ? 20 : 0);
  let phones: Phone[] = [];
  try { phones = textToPhones(text, lang); } catch { phones = []; }
  const ipa = phones.map((p) => (p.stress ? 'ˈ' : '') + p.ipa + (p.long ? 'ː' : '') + (p.wordEnd ? ' ' : '') + (p.pause ? (p.question ? '? ' : '| ') : '')).join('');
  const speak = (t = text, lg = lang) => {
    const ph = textToPhones(t, lg);
    if (!ph.length) return;
    const p = store.params;
    const score = buildScore(ph, { lang: lg, f0: p.source.f0, ps: Math.max(6, p.source.ps), rate, accent });
    void store.speak(score);
  };
  const sc = ui.speaking;
  const now = store.telemetry?.scoreTime ?? 0;
  return (
    <div className="panel-body">
      <Section title={L({ it: 'Fai parlare la testa', en: 'Make the head speak' })} accent={C.amber}
        info={L({
          it: 'Il testo diventa fonemi (le regole dell’italiano, con la «s» sonora tra vocali come al Nord; per l’inglese un piccolo dizionario). Ogni fonema è un bersaglio per lingua, labbra, mascella, velo e glottide; i movimenti si sovrappongono (coarticolazione) e la melodia segue gli accenti. Tutto il resto lo fa la fisica: la stessa testa che muovi a mano. Scrivi /IPA/ tra barre per dare i fonemi direttamente.',
          en: 'The text becomes phonemes (Italian spelling rules; a small dictionary for English). Each phoneme is a target for tongue, lips, jaw, velum and glottis; the movements overlap (coarticulation) and the melody follows the stresses. Everything else is physics: the same head you move by hand. Write /IPA/ between slashes to give phonemes directly.',
        })}>
        <div className="row">
          <input className="text-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') speak(); }} />
          <Seg value={lang} options={[['it', 'IT'], ['en', 'EN']]} onChange={setLang} />
        </div>
        <div className="ipa-line">{ipa || '—'}</div>
        <div className="row">
          <button className="btn primary" onClick={() => speak()}>{L({ it: 'Parla', en: 'Speak' })}</button>
          <button className="btn" onClick={() => store.stopSpeaking()}>{L({ it: 'Ferma', en: 'Stop' })}</button>
        </div>
        <div className="chips">
          {EXAMPLES.map((e) => (
            <button key={e.text} className="chip" onClick={() => { setText(e.text); setLang(e.lang); speak(e.text, e.lang); }}>{e.text}<small> {e.lang}</small></button>
          ))}
        </div>
        <Slider label={L({ it: 'Velocità', en: 'Rate' })} value={rate} min={0.4} max={1.8} onChange={setRate} format={(v) => `×${v.toFixed(2)}`} />
        <Slider label={L({ it: 'Accento melodico', en: 'Pitch accent' })} value={accent} min={0} max={8} step={0.5} onChange={setAccent} format={(v) => `${v.toFixed(1)} st`} />
        <p className="small muted">{L({ it: 'La nota di base è quella della scheda «Sorgente»; la voce (uomo, donna, bambino…) resta quella scelta.', en: 'The base pitch comes from the “Source” tab; the voice (man, woman, child…) stays as chosen.' })}</p>
      </Section>
      {sc && (
        <div className="timeline">
          {sc.phones.map((ph, i) => {
            const active = now >= ph.t0 && now < ph.t1;
            return <span key={i} className={active ? 'ph on' : 'ph'} style={{ flexGrow: Math.max(0.3, (ph.t1 - ph.t0) * 20) }}>{ph.ipa}</span>;
          })}
        </div>
      )}
    </div>
  );
}
