import { store, useParams, useStore, useTick } from '../store';
import { useL } from '../i18n';
import { Slider, Section, Readout } from './controls';
import { setPhoneme, TIMBRE_PRESETS } from '../presets';
import { VOWELS, CONSONANTS } from '../../dsp/speech/phonemes';
import { ARTICULATOR_RANGES, Articulators } from '../../dsp/tract/types';
import { MRI_VOWELS } from '../../dsp/data/mri';
import { C } from '../canvas';

const SUSTAINABLE = ['s', 'z', 'ʃ', 'ʒ', 'f', 'v', 'θ', 'ð', 'h', 'm', 'n', 'ɲ', 'ŋ', 'l', 'ʎ', 'r', 'ɹ', 'j', 'w'];

export function TractPanel() {
  const L = useL();
  const p = useParams();
  const numbers = useStore((s) => s.ui.numbers);
  useTick(numbers ? 4 : 0);
  const a = p.articulators;
  const setA = (k: keyof Articulators, v: number) => store.setArticulators({ [k]: v });
  const names: Record<keyof Articulators, { it: string; en: string }> = {
    jaw: { it: 'Mascella (apertura)', en: 'Jaw (opening)' },
    tongueX: { it: 'Lingua avanti/indietro', en: 'Tongue front/back' },
    tongueY: { it: 'Lingua su/giù', en: 'Tongue up/down' },
    tongueRoot: { it: 'Radice della lingua avanti/indietro', en: 'Tongue root forward/back' },
    tipX: { it: 'Punta avanti/indietro', en: 'Tip front/back' },
    tipY: { it: 'Punta su/giù', en: 'Tip up/down' },
    groove: { it: 'Solco della lingua', en: 'Tongue groove' },
    tongueSides: { it: 'Fianchi della lingua abbassati (l)', en: 'Tongue sides lowered (l)' },
    lipOpen: { it: 'Apertura labbra', en: 'Lip opening' },
    lipRound: { it: 'Arrotondamento labbra', en: 'Lip rounding' },
    lipProtrude: { it: 'Labbra in fuori (sotto zero: tirate)', en: 'Lip protrusion (below zero: spread)' },
    lipTuck: { it: 'Labbro sotto i denti (f, v)', en: 'Lip under the teeth (f, v)' },
    velum: { it: 'Velo abbassato (naso)', en: 'Velum lowered (nose)' },
    larynx: { it: 'Altezza della laringe', en: 'Larynx height' },
  };
  const fm = store.derived().formants;
  const af = store.derived().af;
  return (
    <div className="panel-body">
      <Section title={L({ it: 'Vocali', en: 'Vowels' })} accent={C.teal}
        info={L({
          it: 'Ogni vocale è una forma del tubo. Con «i» la lingua è alta e avanti: F1 bassa, F2 alta. Con «a» la bocca è aperta e la lingua bassa: F1 sale, F2 scende. Con «u» le labbra si arrotondano e allungano il tubo: tutte le formanti scendono.',
          en: 'Each vowel is a shape of the tube. In “ee” the tongue is high and front: low F1, high F2. In “ah” the mouth is open and the tongue low: F1 rises, F2 comes down. In “oo” the lips round and lengthen the tube: all formants drop.',
        })}>
        <div className="chips ipa">
          {Object.keys(VOWELS).map((v) => (
            <button key={v} className="chip ipa" title={VOWELS[v].examples} onClick={() => { setPhoneme(v); if (!store.audio.running) void store.startAudio(); }}>{v}</button>
          ))}
        </div>
      </Section>
      <Section title={L({ it: 'Vocali misurate (risonanza magnetica)', en: 'Measured vowels (MRI)' })} accent={C.teal} open={false}
        info={L({
          it: 'Queste forme non vengono dal disegno della testa: sono state misurate con la risonanza magnetica su un uomo adulto che teneva ciascuna vocale (Story 2008), una sezione ogni 4 mm dalla glottide alle labbra. Caricane una: il tubo diventa quello vero, e lo senti. Le vocali del disegno sono costruite per somigliare a queste forme senza perdere le formanti di riferimento. Torna alla testa dalla vista «Il tubo».',
          en: 'These shapes do not come from the drawing of the head: they were measured with magnetic resonance imaging on an adult man holding each vowel (Story 2008), one slice every 4 mm from the glottis to the lips. Load one: the tube becomes the real one, and you hear it. The vowels of the drawing are built to resemble these shapes while keeping the reference formants. Go back to the head from the “The tube” view.',
        })}>
        <div className="chips ipa">
          {MRI_VOWELS.map((v) => (
            <button key={v.ipa} className="chip ipa" title={`${v.areas.length} × ${(10 * v.dx).toFixed(1)} mm`} onClick={() => {
              store.setParams((q) => { q.tubeAreas = v.areas.slice(); q.tubeLength = v.areas.length * v.dx; q.tubeMode = true; q.articulators.velum = 0; q.phonate = true; q.voicing = true; q.abduction = 0; });
              store.setUi({ viewTab: 'tube' });
              if (!store.audio.running) void store.startAudio();
            }}>{v.ipa}</button>
          ))}
        </div>
      </Section>
      <Section title={L({ it: 'Consonanti tenute', en: 'Held consonants' })} accent={C.violet}>
        <div className="chips ipa">
          {SUSTAINABLE.map((c) => (
            <button key={c} className="chip ipa" title={CONSONANTS[c].examples} onClick={() => { setPhoneme(c); if (!store.audio.running) void store.startAudio(); }}>{c}</button>
          ))}
        </div>
      </Section>
      <Section title={L({ it: 'Articolatori', en: 'Articulators' })} accent={C.teal} open={false}>
        {(Object.keys(names) as (keyof Articulators)[]).map((k) => (
          <Slider key={k} label={L(names[k])} value={a[k]} min={ARTICULATOR_RANGES[k][0]} max={ARTICULATOR_RANGES[k][1]} onChange={(v) => setA(k, v)} />
        ))}
      </Section>
      <Section title={L({ it: 'La persona: il timbro', en: 'The person: timbre' })} accent={C.rose}
        info={L({
          it: 'Una parte del filtro cambia a ogni suono; un’altra appartiene alla persona: la lunghezza del tratto, la forma della gola, quanto suono passa dal naso. Queste tingono tutto quello che una persona dice: voce scura o chiara, nasale, calda, cava. Un tratto più corto (bambino) alza tutte le formanti in proporzione.',
          en: 'One part of the filter changes with every sound; another belongs to the person: the length of the tract, the shape of the throat, how much sound leaks through the nose. These tint everything a person says: dark or bright, nasal, warm, hollow. A shorter tract (a child) raises all formants in proportion.',
        })}>
        <div className="chips">
          {TIMBRE_PRESETS.map((t) => <button key={t.id} className="chip" title={L(t.hint)} onClick={() => store.setParams(t.apply)}>{L(t.name)}</button>)}
        </div>
        <Slider label={L({ it: 'Taglia (lunghezza del tratto)', en: 'Size (tract length)' })} value={p.anatomy.scale} min={0.62} max={1.18} onChange={(v) => store.setParams((x) => { x.anatomy.scale = v; })} format={() => `${af.length.toFixed(1)} cm`} />
        <Slider label={L({ it: 'Faringe: lunghezza', en: 'Pharynx: length' })} value={p.anatomy.pharynx} min={0.72} max={1.25} onChange={(v) => store.setParams((x) => { x.anatomy.pharynx = v; })} />
        <Slider label={L({ it: 'Faringe: larghezza', en: 'Pharynx: width' })} value={p.anatomy.pharynxWidth} min={0.55} max={1.6} onChange={(v) => store.setParams((x) => { x.anatomy.pharynxWidth = v; })} />
        <Slider label={L({ it: 'Perdita nasale', en: 'Nasal leak' })} value={p.anatomy.nasalLeak} min={0} max={1} onChange={(v) => store.setParams((x) => { x.anatomy.nasalLeak = v; })} />
        <Slider label={L({ it: 'Ciclo nasale (lato congestionato)', en: 'Nasal cycle (congested side)' })} value={p.anatomy.nasalCycle} min={-1} max={1}
          hint={L({ it: 'Il setto divide il naso in due fosse. Ogni poche ore i turbinati di un lato si gonfiano e quelli dell’altro si sgonfiano. Due fosse diverse non suonano come una: le due strade interferiscono e aggiungono una risonanza con la sua antirisonanza (prova una «m»).', en: 'The septum splits the nose into two passages. Every few hours the turbinates of one side swell while the other side’s shrink. Two unequal passages do not sound like one: the two paths interfere and add a resonance with its antiresonance (try an “m”).' })}
          onChange={(v) => store.setParams((x) => { x.anatomy.nasalCycle = v; })}
          format={(v) => (Math.abs(v) < 0.05 ? L({ it: 'uguali', en: 'equal' }) : v < 0 ? L({ it: `sinistro ${Math.round(-100 * v)} %`, en: `left ${Math.round(-100 * v)} %` }) : L({ it: `destro ${Math.round(100 * v)} %`, en: `right ${Math.round(100 * v)} %` }))} />
        <Slider label={L({ it: 'Narice sinistra aperta', en: 'Left nostril open' })} value={p.anatomy.nostrilLeft} min={0} max={1} onChange={(v) => store.setParams((x) => { x.anatomy.nostrilLeft = v; })} format={(v) => `${Math.round(100 * v)} %`} />
        <Slider label={L({ it: 'Narice destra aperta', en: 'Right nostril open' })} value={p.anatomy.nostrilRight} min={0} max={1} onChange={(v) => store.setParams((x) => { x.anatomy.nostrilRight = v; })} format={(v) => `${Math.round(100 * v)} %`} />
        <div className="chips">
          <button className={`chip${p.anatomy.nostrilLeft + p.anatomy.nostrilRight === 0 ? ' on' : ''}`}
            title={L({ it: 'Con le labbra chiuse e il naso tappato l’aria di una «m» non ha più uscita: la pressione in bocca sale fino a quella dei polmoni e le corde vocali smettono di vibrare.', en: 'With the lips closed and the nose pinched the air of an “m” has no way out: the mouth pressure rises to the lung pressure and the vocal folds stop vibrating.' })}
            onClick={() => store.setParams((x) => { const shut = x.anatomy.nostrilLeft + x.anatomy.nostrilRight === 0; x.anatomy.nostrilLeft = shut ? 1 : 0; x.anatomy.nostrilRight = shut ? 1 : 0; })}>
            {L({ it: 'Tappa il naso', en: 'Pinch the nose' })}
          </button>
        </div>
        <Slider label={L({ it: 'Seni piriformi: aria dentro', en: 'Piriform fossae: air inside' })} value={p.anatomy.piriform} min={0} max={1}
          hint={L({ it: 'Ai lati della laringe ci sono due tasche cieche, profonde circa 2 cm. Il suono ci entra e torna indietro sfasato: intorno a 4-5 kHz cancella quello che arriva, e ogni vocale ha lì una valle. Riempirle (come con l’acqua negli esperimenti) accorcia le tasche: la valle sale e alla fine sparisce.', en: 'Beside the larynx there are two blind pouches, about 2 cm deep. The sound goes in and comes back out of step: around 4-5 kHz it cancels what arrives, and every vowel has a valley there. Filling them (as with water in experiments) shortens the pouches: the valley rises and finally disappears.' })}
          onChange={(v) => store.setParams((x) => { x.anatomy.piriform = v; })} format={(v) => `${Math.round(100 * v)} %`} />
        <Slider label={L(names.larynx)} value={a.larynx} min={-1.5} max={1.2} onChange={(v) => setA('larynx', v)} format={(v) => `${v.toFixed(1)} cm`} />
        <Slider label={L({ it: 'Perdite delle pareti', en: 'Wall losses' })} value={p.losses} min={0.3} max={3} onChange={(v) => store.setParams((x) => { x.losses = v; })} format={(v) => `×${v.toFixed(1)}`} />
        <Readout items={[
          [L({ it: 'lunghezza', en: 'length' }), `${af.length.toFixed(2)} cm`],
          ...fm.slice(0, 4).map((f, i) => [`F${i + 1}`, `${Math.round(f.f)} Hz (B ${Math.round(f.bw)})`] as [string, string]),
        ]} />
      </Section>
    </div>
  );
}
