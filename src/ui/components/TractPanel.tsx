import { store, useParams, useStore, useTick } from '../store';
import { useL } from '../i18n';
import { Slider, Section, Readout } from './controls';
import { setPhoneme, TIMBRE_PRESETS } from '../presets';
import { VOWELS, CONSONANTS } from '../../dsp/speech/phonemes';
import { ARTICULATOR_RANGES, Articulators } from '../../dsp/tract/types';
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
    tipX: { it: 'Punta avanti/indietro', en: 'Tip front/back' },
    tipY: { it: 'Punta su/giù', en: 'Tip up/down' },
    groove: { it: 'Solco della lingua', en: 'Tongue groove' },
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
