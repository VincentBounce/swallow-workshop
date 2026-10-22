import { store, ViewTab, ControlTab } from './store';
import { applyPhoneme, VOICE_PRESETS, TIMBRE_PRESETS, setPhoneme } from './presets';
import { textToPhones } from '../dsp/speech/g2p';
import { buildScore } from '../dsp/speech/sequencer';
import { DEFAULT_SOURCE, DEFAULT_NOISE } from '../dsp/engine/params';
import { DEFAULT_ANATOMY } from '../dsp/tract/types';
import { transferMagnitudes } from '../dsp/tract/acoustics';
import { portArea, noseOf } from '../dsp/tract/nasal';
import { MRI_VOWELS } from '../dsp/data/mri';
import { isVowel } from '../dsp/speech/phonemes';
import { solveLF, rdToTiming, lfDerivative } from '../dsp/glottis/lf';
import type { NaturalnessOptions } from '../dsp/speech/sequencer';

type Bi = { it: string; en: string };
export interface TourAction { label: Bi; run: () => void }
export interface Chapter { title: Bi; kicker: Bi; paragraphs: Bi[]; actions: TourAction[]; experiments?: GuidedExperiment[] }

const go = async (view?: ViewTab, tab?: ControlTab) => {
  if (!store.audio.running) await store.startAudio();
  const u: Partial<typeof store.ui> = {};
  if (view) u.viewTab = view;
  if (tab) u.controlTab = tab;
  store.setUi(u);
};
const clean = () => store.setParams((p) => {
  p.source = { ...DEFAULT_SOURCE, f0: p.source.f0 };
  p.noise = { ...DEFAULT_NOISE, user: { ...p.noise.user, on: false } };
  p.anatomy = { ...DEFAULT_ANATOMY };
  p.voicing = true; p.bypassTract = false; p.tubeMode = false; p.abduction = 0;
});
const vowel = (v: string, f0?: number) => store.setParams((p) => { applyPhoneme(v, p); if (f0) p.source.f0 = f0; p.phonate = true; });
const say = async (text: string, lang: 'it' | 'en') => {
  if (lang === 'en') await store.ensureLexicon();
  const p = store.params;
  void store.speak(buildScore(textToPhones(text, lang), { lang, f0: p.source.f0, ps: Math.max(7, p.source.ps) }));
};
/** Speaks the example in the language of the interface. */
const sayL = (text: Bi) => { const lang = store.ui.lang; say(text[lang], lang); };
/** Glides a source parameter over time (for demonstrations). */
const glide = (from: number, to: number, seconds: number, set: (v: number) => void) => {
  const t0 = performance.now();
  const step = () => {
    const u = Math.min(1, (performance.now() - t0) / (seconds * 1000));
    set(from * Math.pow(to / from, u));
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

/**
 * A guided experiment: a question, the steps to try (in order), what to look
 * and listen for, and the explanation, revealed on demand. `numbers` gives
 * the live values behind it when the Numbers switch is on.
 */
export interface GuidedExperiment { question: Bi; steps: TourAction[]; look: Bi; answer: Bi; numbers?: () => Bi }

/** A number with the decimal mark of the language. */
const dec = (x: number, digits: number, l: 'it' | 'en') => (l === 'it' ? x.toFixed(digits).replace('.', ',') : x.toFixed(digits)).replace('-', '−');
const cm = (p: number, l: 'it' | 'en') => dec(p / 980.665, 1, l);
const both = (s: (lang: 'it' | 'en') => string): Bi => ({ it: s('it'), en: s('en') });
/** The first three formants of the current shape (head or tube). */
const formantNumbers = (): Bi => {
  const f = store.derived().formants.slice(0, 3).map((x) => Math.round(x.f));
  return both(() => f.map((v, i) => `F${i + 1} ${v}`).join(' · ') + ' Hz');
};
/** Mouth and lung pressure, pitch and nasal airflow, from the running engine. */
const airNumbers = (): Bi => {
  const t = store.telemetry;
  if (!t) return { it: 'accendi l’audio', en: 'switch the audio on' };
  return both((l) => {
    const f0 = t.f0 > 0 ? `${Math.round(t.f0)} Hz` : l === 'it' ? 'nessuna (corde ferme)' : 'none (folds still)';
    return l === 'it'
      ? `pressione in bocca ${cm(t.po, l)} cmH₂O, nei polmoni ${cm(t.ps, l)} · flusso dal naso ${Math.round(t.uNose)} cm³/s · F0 ${f0}`
      : `mouth pressure ${cm(t.po, l)} cmH₂O, lungs ${cm(t.ps, l)} · nasal airflow ${Math.round(t.uNose)} cm³/s · F0 ${f0}`;
  });
};
/** Loads one of the vowels measured by MRI as the tube. */
const mri = (ipa: string) => {
  const v = MRI_VOWELS.find((m) => m.ipa === ipa);
  if (!v) return;
  store.setParams((q) => { q.tubeAreas = v.areas.slice(); q.tubeLength = v.areas.length * v.dx; q.tubeMode = true; q.articulators.velum = 0; q.phonate = true; q.voicing = true; q.abduction = 0; });
  void go('tube', 'tract');
};
/** Peaks and valleys of the current filter below 3 kHz, nose included. */
let extremaCache: { key: unknown; value: Bi } | null = null;
const peakNumbers = (): Bi => {
  const d = store.derived(), p = store.params;
  if (extremaCache?.key === d) return extremaCache.value;
  const fr: number[] = [];
  for (let f = 100; f <= 3000; f += 10) fr.push(f);
  const port = portArea(store.currentArticulators().velum, p.anatomy.nasalLeak, p.anatomy.scale);
  const mag = transferMagnitudes(d.af, fr, { port, scale: p.anatomy.scale, nose: noseOf(p.anatomy) });
  const poles: number[] = [], zeros: number[] = [];
  for (let i = 1; i < fr.length - 1; i++) {
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1]) poles.push(fr[i]);
    if (mag[i] < mag[i - 1] && mag[i] <= mag[i + 1]) zeros.push(fr[i]);
  }
  const value = both((l) => l === 'it'
    ? `picchi ${poles.join(' · ')} Hz; valli ${zeros.join(' · ') || 'nessuna'} Hz`
    : `peaks ${poles.join(' · ')} Hz; valleys ${zeros.join(' · ') || 'none'} Hz`);
  extremaCache = { key: d, value };
  return value;
};
/** H1-H2 of the source pulse at the current Rd: the buzz before the filter. */
const sourceNumbers = (): Bi => {
  const s = store.params.source;
  const sh = solveLF(rdToTiming(s.rd));
  const n = 256;
  const h = (k: number) => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const v = lfDerivative(sh, i / n); re += v * Math.cos((2 * Math.PI * k * i) / n); im -= v * Math.sin((2 * Math.PI * k * i) / n); }
    return Math.hypot(re, im);
  };
  const d = 20 * Math.log10(h(1) / h(2));
  return {
    it: `Rd ${dec(s.rd, 1, 'it')}, fessura ${dec(s.chink, 2, 'it')} cm² · nel ronzio da solo la prima armonica supera la seconda (H1-H2) di ${dec(d, 1, 'it')} dB: circa −2 pressata, 4 normale, 18 soffiata. Con la fessura di 0,12 cm² della voce soffiata l’energia sopra i 3 kHz, rispetto ai bassi, sale di 11 dB: è il fruscio`,
    en: `Rd ${dec(s.rd, 1, 'en')}, chink ${dec(s.chink, 2, 'en')} cm² · in the buzz alone the first harmonic exceeds the second (H1-H2) by ${dec(d, 1, 'en')} dB: about −2 pressed, 4 modal, 18 breathy. With the breathy voice’s 0.12 cm² chink the energy above 3 kHz, relative to the lows, rises by 11 dB: that is the hiss`,
  };
};
const NO_NATURAL: NaturalnessOptions = { timing: false, intonation: false, micro: false, voiceQuality: false, coarticulation: false };
/** Speaks the example in the language of the interface with some ingredients switched off. */
const sayWithout = async (text: Bi, off: Partial<NaturalnessOptions>) => {
  const lang = store.ui.lang;
  if (lang === 'en') await store.ensureLexicon();
  const p = store.params;
  void store.speak(buildScore(textToPhones(text[lang], lang), { lang, f0: p.source.f0, ps: Math.max(7, p.source.ps), natural: { ...off } }));
};
/** Duration of the first vowel of a word, in ms, as the sequencer plans it. */
const vowelMs = (word: string, lang: 'it' | 'en'): number => {
  const sc = buildScore(textToPhones(word, lang), { lang });
  const v = sc.phones.find((q) => isVowel(q.ipa));
  return v ? Math.round(1000 * (v.t1 - v.t0)) : 0;
};
const SENTENCE: Bi = { it: 'la voce è fatta di aria e di un filtro', en: 'every voice is made of air and a filter' };

export const CHAPTERS: Chapter[] = [
  {
    kicker: { it: 'Benvenuto', en: 'Welcome' },
    title: { it: 'Un ronzio e un filtro', en: 'A buzz and a filter' },
    paragraphs: [
      { it: 'Ogni voce che hai sentito è fatta di due ingredienti: un ronzio, che nasce nella laringe, e un filtro, la gola e la bocca, che lo colora.', en: 'Every voice you have heard is made of two ingredients: a buzz, born in the larynx, and a filter, the throat and the mouth, that colors it.' },
      { it: 'Questa testa è un modello fisico: l’aria dei polmoni fa vibrare le corde vocali, le onde di pressione viaggiano in un tubo che cambia forma, e quello che senti è calcolato in tempo reale, campione per campione.', en: 'This head is a physical model: lung air makes the vocal folds vibrate, pressure waves travel in a tube that changes shape, and what you hear is computed in real time, sample by sample.' },
      { it: 'Trascina la lingua, la mascella o le labbra e ascolta come cambia il suono.', en: 'Drag the tongue, the jaw or the lips and listen to the sound change.' },
    ],
    actions: [
      { label: { it: 'Accendi e soffia una «a»', en: 'Switch on and blow an “ah”' }, run: () => { clean(); vowel('a', 120); void go('spectrum'); } },
      { label: { it: 'Passa a una «i»', en: 'Move to an “ee”' }, run: () => { vowel('i'); void go(); } },
      { label: { it: 'Fermati', en: 'Stop' }, run: () => store.setParams((p) => { p.phonate = false; }) },
    ],
  },
  {
    kicker: { it: 'Capitolo 1', en: 'Chapter 1' },
    title: { it: 'Onde, armoniche, spettro', en: 'Waves, harmonics, spectrum' },
    paragraphs: [
      { it: 'Il suono è fatto di piccole, rapidissime variazioni della pressione dell’aria. Guardando una vocale da vicino, la stessa forma si ripete, più di cento volte al secondo.', en: 'Sound is tiny, fast changes in air pressure. Zoom into a vowel and the same shape repeats, over a hundred times a second.' },
      { it: 'Ogni forma che si ripete si può ricostruire sommando sinusoidi: una alla frequenza di ripetizione, la fondamentale F0, e le altre esattamente a due, tre, quattro volte quella frequenza: le armoniche.', en: 'Any repeating shape can be rebuilt from sine waves: one at the repetition rate, the fundamental F0, and others at exactly two, three, four times that rate: the harmonics.' },
      { it: 'Disegnando quanto è forte ciascuna si ottiene lo spettro: una fila di righe equidistanti.', en: 'Plot how strong each one is and you get the spectrum: a row of evenly spaced spikes.' },
    ],
    actions: [
      { label: { it: 'Guarda l’onda', en: 'Look at the wave' }, run: () => { vowel('a', 110); void go('scope'); } },
      { label: { it: 'Guarda lo spettro', en: 'Look at the spectrum' }, run: () => { vowel('a', 110); store.setUi({ showHarmonics: true, envelope: false }); void go('spectrum'); } },
      { label: { it: 'Raddoppia la nota', en: 'Double the pitch' }, run: () => { glide(store.params.source.f0, Math.min(440, store.params.source.f0 * 2), 1.2, (v) => store.setParams((p) => { p.source.f0 = v; })); void go('spectrum'); } },
    ],
    experiments: [
      {
        question: { it: 'Che cosa succede alle armoniche se la nota raddoppia?', en: 'What happens to the harmonics when the pitch doubles?' },
        steps: [
          { label: { it: 'Una «a» a 110 Hz', en: 'An “ah” at 110 Hz' }, run: () => { clean(); vowel('a', 110); store.setUi({ showHarmonics: true, envelope: false }); void go('spectrum'); } },
          { label: { it: 'La stessa «a» a 220 Hz', en: 'The same “ah” at 220 Hz' }, run: () => store.setParams((p) => { p.source.f0 = 220; }) },
        ],
        look: { it: 'Conta le righe dello spettro sotto 1 kHz, prima e dopo.', en: 'Count the spikes of the spectrum below 1 kHz, before and after.' },
        answer: { it: 'Le armoniche stanno sempre a multipli esatti della fondamentale: a 110 Hz cadono a 110, 220, 330… e sotto 1 kHz ce ne sono 9; a 220 Hz cadono a 220, 440, 660… e ne restano 4. Raddoppiare la frequenza è salire di un’ottava: le righe si allontanano del doppio, ma senti ancora una «a», perché il filtro non è cambiato.', en: 'The harmonics always sit at exact multiples of the fundamental: at 110 Hz they fall at 110, 220, 330… and there are 9 below 1 kHz; at 220 Hz they fall at 220, 440, 660… and only 4 are left. Doubling the frequency is going up an octave: the spikes move twice as far apart, but you still hear an “ah”, because the filter has not changed.' },
        numbers: () => {
          const f0 = store.telemetry?.f0 ?? 0;
          if (f0 <= 0) return { it: 'accendi l’audio', en: 'switch the audio on' };
          const h = [1, 2, 3, 4].map((k) => Math.round(k * f0)).join(', ');
          const below = Math.floor(1000 / f0);
          return { it: `F0 ${Math.round(f0)} Hz · armoniche a ${h}… Hz · ${below} sotto 1 kHz`, en: `F0 ${Math.round(f0)} Hz · harmonics at ${h}… Hz · ${below} below 1 kHz` };
        },
      },
    ],
  },
  {
    kicker: { it: 'Capitolo 2', en: 'Chapter 2' },
    title: { it: 'La sorgente: le corde vocali', en: 'The source: the vocal folds' },
    paragraphs: [
      { it: 'Nella laringe ci sono due piccole pieghe di tessuto. L’aria dei polmoni le spinge e le apre; la loro elasticità le richiude, e il flusso d’aria tiene vivo il ciclo: apri, chiudi, apri, chiudi.', en: 'In the larynx sit two small folds of tissue. Lung air pushes them apart; their elasticity pulls them back, and the airflow keeps the cycle going: open, close, open, close.' },
      { it: 'Ogni ciclo lascia uscire uno sbuffo d’aria: una serie rapida di sbuffi è il ronzio. Tendendo le corde vibrano più in fretta: sale la fondamentale e tutte le armoniche la seguono.', en: 'Every cycle lets out a puff of air: a fast train of puffs is the buzz. Stretch the folds and they vibrate faster: the fundamental rises and every harmonic follows.' },
      { it: 'Parlando la nota non sta mai ferma: è l’intonazione, la melodia della frase. Suonata dal solo ronzio si segue la melodia, ma non ci sono parole.', en: 'When we talk the pitch never stops moving: that is intonation, the melody of the sentence. Played by the buzz alone you can follow the tune, but there are no words.' },
    ],
    actions: [
      { label: { it: 'Le corde al rallentatore', en: 'The folds in slow motion' }, run: () => { vowel('a', 110); void go('glottis', 'source'); } },
      { label: { it: 'Ascolta il ronzio da solo', en: 'Hear the buzz alone' }, run: () => { vowel('a', 110); store.setParams((p) => { p.bypassTract = true; }); void go('spectrum', 'source'); } },
      { label: { it: 'Tendi le corde', en: 'Stretch the folds' }, run: () => { store.setParams((p) => { p.bypassTract = false; }); vowel('a', 100); glide(100, 220, 2, (v) => store.setParams((p) => { p.source.f0 = v; })); void go('spectrum'); } },
      { label: { it: 'La melodia col solo ronzio', en: 'The melody on the buzz alone' }, run: () => { store.setParams((p) => { p.bypassTract = false; }); void go('spectrum', 'melody'); } },
      { label: { it: 'Corde che oscillano da sole', en: 'Self-oscillating folds' }, run: () => { vowel('a', 120); store.setParams((p) => { p.bypassTract = false; p.source.model = 'twomass'; }); void go('glottis', 'source'); } },
    ],
    experiments: [
      {
        question: { it: 'Voce pressata o soffiata: che cosa cambia nel ronzio?', en: 'Pressed or breathy voice: what changes in the buzz?' },
        steps: [
          { label: { it: 'Voce pressata', en: 'Pressed voice' }, run: () => { clean(); vowel('a', 110); store.setParams(VOICE_PRESETS.find((x) => x.id === 'pressed')!.apply); store.setUi({ showHarmonics: true }); void go('spectrum', 'source'); } },
          { label: { it: 'Voce soffiata', en: 'Breathy voice' }, run: () => { clean(); vowel('a', 110); store.setParams(VOICE_PRESETS.find((x) => x.id === 'breathy')!.apply); void go('spectrum', 'source'); } },
          { label: { it: 'Guarda gli sbuffi', en: 'Look at the puffs' }, run: () => { void go('glottis'); } },
        ],
        look: { it: 'Nello spettro confronta le prime due armoniche e quelle in alto, sopra i 2 kHz. Nella vista delle corde guarda quanto in fretta si chiude ogni sbuffo.', en: 'In the spectrum compare the first two harmonics and the high ones, above 2 kHz. In the folds view see how fast each puff closes.' },
        answer: { it: 'Nella voce pressata le corde si chiudono in fretta e restano chiuse a lungo: ogni sbuffo finisce di colpo, e una fine brusca mette energia nelle armoniche alte, che arrivano lontano. Nella voce soffiata si chiudono piano e mai del tutto: la prima armonica domina, quelle alte si spengono e l’aria che sfugge aggiunge un fruscio. La nota è la stessa: cambia il colore del ronzio.', en: 'In a pressed voice the folds close fast and stay closed long: each puff ends abruptly, and an abrupt end puts energy into the high harmonics, which carry far. In a breathy voice they close gently and never fully: the first harmonic dominates, the high ones fade, and the leaking air adds a hiss. The note is the same: the color of the buzz changes.' },
        numbers: sourceNumbers,
      },
    ],
  },
  {
    kicker: { it: 'Capitolo 3', en: 'Chapter 3' },
    title: { it: 'Il filtro: gola, bocca e naso', en: 'The filter: throat, mouth and nose' },
    paragraphs: [
      { it: 'Sopra la laringe il suono attraversa la gola, la bocca e a volte il naso: il tratto vocale. È un tubo d’aria e, come ogni tubo, risuona: alcune frequenze si rinforzano, altre si spengono.', en: 'Above the larynx the sound travels through the throat, the mouth and sometimes the nose: the vocal tract. It is a tube of air and, like any tube, it resonates: some frequencies ring out, others die away.' },
      { it: 'Così fa da filtro. La curva che passa per le punte delle armoniche è l’inviluppo spettrale, e i suoi picchi sono le formanti: F1, F2, F3. Sono loro a distinguere le vocali: in «i» F1 è bassa e F2 alta; in «a» F1 sale e F2 scende.', en: 'So it works as a filter. The curve through the tips of the harmonics is the spectral envelope, and its peaks are the formants: F1, F2, F3. They tell vowels apart: in “ee” F1 is low and F2 high; in “ah” F1 rises and F2 comes down.' },
      { it: 'Una parte del filtro cambia a ogni suono; un’altra appartiene alla persona: la lunghezza del tratto, la forma della gola, quanto suono passa dal naso. È gran parte del timbro.', en: 'One part of the filter changes with every sound; another belongs to the person: the length of the tract, the shape of the throat, how much sound leaks through the nose. That is much of timbre.' },
    ],
    actions: [
      { label: { it: 'Il tubo e le sue onde', en: 'The tube and its waves' }, run: () => { vowel('ə', 110); store.setUi({ standing: 1 }); void go('tube', 'tract'); } },
      { label: { it: '«heed» e «father»', en: '“heed” and “father”' }, run: () => { void go('chart'); say('heed', 'en'); setTimeout(() => say('father', 'en'), 1100); } },
      { label: { it: 'La mappa delle vocali', en: 'The vowel map' }, run: () => { vowel('a', 120); void go('chart', 'tract'); } },
      { label: { it: 'Voce di bambino', en: 'A child’s voice' }, run: () => { store.setParams(VOICE_PRESETS.find((x) => x.id === 'child')!.apply); vowel('a'); void go('spectrum', 'tract'); } },
      { label: { it: 'Scuro, chiaro, nasale', en: 'Dark, bright, nasal' }, run: () => { clean(); vowel('a', 120); store.setParams(TIMBRE_PRESETS.find((x) => x.id === 'dark')!.apply); void go('spectrum', 'tract'); } },
    ],
    experiments: [
      {
        question: { it: 'Che cosa fa la mascella alla prima formante?', en: 'What does the jaw do to the first formant?' },
        steps: [
          { label: { it: 'Mascella quasi chiusa', en: 'Jaw nearly closed' }, run: () => { clean(); vowel('ə', 120); store.setParams((p) => { p.articulators.jaw = 0.1; }); void go('chart', 'tract'); } },
          { label: { it: 'Apri la mascella', en: 'Open the jaw' }, run: () => { store.setParams((p) => { p.articulators.jaw = 0.9; }); void go('chart'); } },
        ],
        look: { it: 'Segui il punto giallo sulla mappa delle vocali: in verticale c’è F1.', en: 'Follow the yellow dot on the vowel map: F1 is the vertical axis.' },
        answer: { it: 'Aprendo la mascella la bocca si allarga davanti e la gola si stringe dietro: F1 sale, qui da circa 420 a 620 Hz. In parole semplici F1 dice quanto è aperta la bocca, F2 quanto è avanti la lingua.', en: 'Opening the jaw widens the mouth in front and narrows the throat behind: F1 goes up, here from about 420 to 620 Hz. Put simply, F1 tells how open the mouth is, F2 how far forward the tongue is.' },
        numbers: formantNumbers,
      },
      {
        question: { it: 'E se arrotondo le labbra su una «i»?', en: 'And if I round my lips on an “ee”?' },
        steps: [
          { label: { it: '«i» con le labbra distese', en: '“ee” with spread lips' }, run: () => { clean(); vowel('i', 120); store.setUi({ envelope: true }); void go('spectrum', 'tract'); } },
          { label: { it: 'Arrotonda e sporgi le labbra', en: 'Round and push the lips forward' }, run: () => store.setParams((p) => { p.articulators.lipRound = 1; p.articulators.lipProtrude = 1; p.articulators.lipOpen = 0.05; }) },
        ],
        look: { it: 'Guarda i picchi alti dell’inviluppo, F2 e F3, e ascolta come si scurisce il suono.', en: 'Watch the high peaks of the envelope, F2 and F3, and hear the sound darken.' },
        answer: { it: 'Labbra arrotondate e in avanti allungano il tubo e ne stringono l’uscita: tutte le risonanze scendono, F2 e F3 più di tutte (qui F2 da 2260 a circa 1950 Hz, F3 da 3000 a 2500). La lingua è quella di una «i» e le labbra quelle di una «u»: è la «u» francese, la «ü» tedesca.', en: 'Rounded, forward lips lengthen the tube and narrow its exit: every resonance goes down, F2 and F3 most (here F2 from 2260 to about 1950 Hz, F3 from 3000 to 2500). An “ee” tongue with “oo” lips: the French “u”, the German “ü”.' },
        numbers: formantNumbers,
      },
    ],
  },
  {
    kicker: { it: 'Capitolo 4', en: 'Chapter 4' },
    title: { it: 'Due manopole indipendenti', en: 'Two independent knobs' },
    paragraphs: [
      { it: 'L’idea chiave: ronzio e filtro si comandano quasi indipendentemente.', en: 'The key idea: the buzz and the filter are controlled almost independently.' },
      { it: 'Con il filtro fermo, alzando la nota le armoniche si allargano e scorrono sotto lo stesso inviluppo: la vocale resta la stessa e la voce resta riconoscibile. Con la nota ferma, cambiando il filtro cambia la vocale.', en: 'Keep the filter fixed and raise the pitch: the harmonics spread apart and slide under the same envelope; the vowel and the voice stay the same. Keep the pitch and change the filter: same note, different vowel.' },
      { it: 'Per questo puoi cantare una nota più alta e suonare ancora come te: melodia e colore sono due manopole diverse.', en: 'That is why you can sing a higher note and still sound like yourself: melody and color are two different knobs.' },
    ],
    actions: [
      { label: { it: 'Alza la nota, filtro fermo', en: 'Raise the pitch, filter fixed' }, run: () => { clean(); vowel('a', 110); store.setUi({ envelope: true, showHarmonics: true }); glide(110, 260, 2.5, (v) => store.setParams((p) => { p.source.f0 = v; })); void go('spectrum'); } },
      { label: { it: 'Nota ferma, da «a» a «i»', en: 'Same note, from “ah” to “ee”' }, run: () => { vowel('a', 150); setTimeout(() => setPhoneme('i'), 900); void go('spectrum'); } },
      { label: { it: 'Esperimenti A/B', en: 'A/B experiments' }, run: () => { void go('spectrum', 'ab'); } },
    ],
  },
  {
    kicker: { it: 'Capitolo 5', en: 'Chapter 5' },
    title: { it: 'Il fruscio', en: 'The hiss' },
    paragraphs: [
      { it: 'Non tutti i suoni vengono dalle corde. Per la «s» o la «f» l’aria passa per una fessura stretta e la turbolenza produce un fruscio: rumore sparso su tante frequenze, senza armoniche.', en: 'Not every sound comes from the vocal folds. For “s” or “f” air is squeezed through a narrow gap and the turbulence makes a hiss: noise spread over many frequencies, with no harmonics.' },
      { it: 'Il fruscio si mescola anche ai suoni con voce: in una voce soffiata l’aria scappa tra le corde e un fruscio leggero riempie gli spazi tra le armoniche. E non è costante: pulsa a ogni battito delle corde, più forte quando sono aperte.', en: 'Noise mixes into voiced sounds too: in a breathy voice air leaks past the folds and a soft hiss fills the gaps between the harmonics. And it is not steady: it pulses with every beat of the folds, strongest while they are open.' },
      { it: 'Una voce sono dunque tre cose: un ronzio che porta la melodia, un fruscio, e un filtro che li colora entrambi.', en: 'So a voice is three things: a buzz that carries the melody, a hiss, and a filter that colors them both.' },
    ],
    actions: [
      { label: { it: 'Una «s»: il getto sui denti', en: 'An “s”: the jet on the teeth' }, run: () => { clean(); setPhoneme('s'); void go('spectrum', 'teeth'); } },
      { label: { it: 'Una «f»: piatta e debole', en: 'An “f”: flat and weak' }, run: () => { setPhoneme('f'); void go('spectrum', 'teeth'); } },
      { label: { it: 'Voce soffiata', en: 'Breathy voice' }, run: () => { clean(); vowel('a', 110); store.setParams(VOICE_PRESETS.find((x) => x.id === 'breathy')!.apply); void go('spectrum', 'noise'); } },
      { label: { it: 'Fruscio costante o pulsato', en: 'Steady or pulsed hiss' }, run: () => { void go('scope', 'ab'); } },
      { label: { it: 'Disegna il tuo rumore', en: 'Draw your own noise' }, run: () => { void go('spectrum', 'noise'); } },
    ],
    experiments: [
      {
        question: { it: 'Perché la «sc» di «scena» fruscia più in basso della «s»?', en: 'Why does “sh” hiss lower than “s”?' },
        steps: [
          { label: { it: 'Una «s»', en: 'An “s”' }, run: () => { clean(); setPhoneme('s'); void go('spectrum', 'teeth'); } },
          { label: { it: 'Una «sc» (ʃ)', en: 'A “sh” (ʃ)' }, run: () => { setPhoneme('ʃ'); void go('spectrum'); } },
        ],
        look: { it: 'Guarda dove il fruscio è più forte nello spettro, e osserva lingua e labbra nella testa.', en: 'See where the hiss is strongest in the spectrum, and watch the tongue and the lips in the head.' },
        answer: { it: 'In tutte e due il getto d’aria sbatte sugli incisivi, e il fruscio prende colore dalla piccola cavità tra la lingua e le labbra. Nella «sc» la lingua sta più indietro e le labbra si arrotondano: la cavità davanti è più lunga e risuona più in basso, intorno ai 3 kHz invece dei 4,5 della «s».', en: 'In both the air jet hits the incisors, and the hiss takes its color from the small cavity between the tongue and the lips. For “sh” the tongue sits further back and the lips round: the cavity in front is longer and resonates lower, around 3 kHz instead of the 4.5 kHz of “s”.' },
        numbers: () => ({ it: 'in questo modello: «s» picco 4,5 kHz, baricentro 6,2 kHz; «sc» picco 3,1 kHz, baricentro 4,0 kHz. Parlanti veri (Jongman e coll. 2000): baricentro della «s» circa 6 kHz, della «sc» circa 4', en: 'in this model: “s” peak 4.5 kHz, centroid 6.2 kHz; “sh” peak 3.1 kHz, centroid 4.0 kHz. Real speakers (Jongman et al. 2000): “s” centroid about 6 kHz, “sh” about 4' }),
      },
    ],
  },
  {
    kicker: { it: 'Capitolo 6', en: 'Chapter 6' },
    title: { it: 'Le consonanti: chiudere e riaprire il tubo', en: 'Consonants: closing and opening the tube' },
    paragraphs: [
      { it: 'Le consonanti nascono stringendo o chiudendo il tubo in un punto. Chiudilo del tutto e l’aria si accumula dietro la chiusura; riaprilo di colpo e la pressione scappa in un piccolo scoppio: è un’occlusiva, come p, t, k.', en: 'Consonants are made by narrowing or closing the tube at some point. Close it completely and the air piles up behind the closure; open it suddenly and the pressure escapes in a small burst: that is a stop, like p, t, k.' },
      { it: 'Mentre il tubo è chiuso le corde vocali possono ronzare solo per poco: l’aria sopra di loro non ha uscita, la pressione in bocca sale verso quella dei polmoni e la spinta che le fa vibrare si spegne. Per questo b, d, g sono brevi.', en: 'While the tube is shut the vocal folds can buzz only for a moment: the air above them has nowhere to go, the mouth pressure climbs toward the lung pressure and the push that keeps them vibrating dies. That is why b, d, g are short.' },
      { it: 'Conta dove si chiude (le labbra per p e b, la punta della lingua per t e d, il dorso per k e g) e quando riparte il ronzio. Nell’inglese «top» il ronzio aspetta circa 60-70 millisecondi e intanto esce un soffio, l’aspirazione; nell’italiano «topo» riparte quasi subito.', en: 'It matters where the tube closes (the lips for p and b, the tongue tip for t and d, the back of the tongue for k and g) and when the buzz comes back. In English “top” the buzz waits about 60-70 milliseconds while a puff of breath comes out, the aspiration; in Italian “topo” it starts almost at once.' },
    ],
    actions: [
      { label: { it: '«papà» e «babbo»', en: '“pop” and “Bob”' }, run: () => { clean(); void go('spectrum', 'speak'); sayL({ it: 'papà', en: 'pop' }); setTimeout(() => sayL({ it: 'babbo', en: 'Bob' }), 1100); } },
      { label: { it: 'Tre luoghi: «pa», «ta», «ca»', en: 'Three places: “pa”, “ta”, “ka”' }, run: () => { clean(); void go('spectrum', 'speak'); sayL({ it: 'pa ta ca', en: 'pa ta ka' }); } },
    ],
    experiments: [
      {
        question: { it: 'Dove va l’aria se chiudo le labbra e continuo a dare voce?', en: 'Where does the air go if I close my lips and keep voicing?' },
        steps: [
          { label: { it: 'Una vocale: «a»', en: 'A vowel: “ah”' }, run: () => { clean(); vowel('a', 120); void go('spectrum', 'tract'); } },
          { label: { it: 'Chiudi le labbra: «b»', en: 'Close the lips: “b”' }, run: () => { setPhoneme('b'); } },
        ],
        look: { it: 'Guarda l’indicatore «ronzio» sotto la testa: si spegne in pochi decimi di secondo. Con i Numeri accesi vedi salire la pressione in bocca.', en: 'Watch the “buzz” meter under the head: it fades within a few tenths of a second. With Numbers on you can see the mouth pressure rise.' },
        answer: { it: 'Con le labbra chiuse la bocca si riempie: in circa due decimi di secondo la pressione arriva a 6 cmH₂O, poi a quella dei polmoni, e le corde smettono di vibrare perché non resta una differenza di pressione a spingerle. Anche per questo una «b» vera dura poco; chi parla gonfia un po’ le guance e abbassa la laringe per guadagnare spazio.', en: 'With the lips shut the mouth fills up: in about two tenths of a second its pressure reaches 6 cmH₂O, then the lung pressure, and the folds stop because no pressure difference is left to drive them. This is one reason a real “b” is short; speakers also puff their cheeks a little and lower the larynx to make room.' },
        numbers: airNumbers,
      },
      {
        question: { it: 'Che cosa distingue la «t» inglese da quella italiana?', en: 'What sets the English “t” apart from the Italian one?' },
        steps: [
          { label: { it: '«top» in inglese', en: 'English “top”' }, run: () => { clean(); void go('spectrum'); void say('top', 'en'); } },
          { label: { it: '«topo» in italiano', en: 'Italian “topo”' }, run: () => { clean(); void go('spectrum'); void say('topo', 'it'); } },
        ],
        look: { it: 'Ascolta il soffio dopo la «t» e guarda lo spettrogramma: dopo lo scoppio, una macchia di fruscio prima che tornino le righe delle armoniche.', en: 'Listen for the breath after the “t” and watch the spectrogram: after the burst, a patch of hiss before the stripes of the harmonics come back.' },
        answer: { it: 'In inglese le corde restano aperte ancora un po’ dopo lo scoppio: per 60-80 millisecondi esce solo aria, un fruscio, poi riparte la voce. In italiano le corde sono già accostate durante la chiusura e la voce riparte quasi subito. È il tempo di attacco della voce (VOT), e da solo basta a far sembrare straniero un accento.', en: 'In English the folds stay apart for a moment after the burst: for 60-80 milliseconds only air comes out, a hiss, then the voice returns. In Italian the folds are already together during the closure and the voice comes back almost at once. This is the voice onset time (VOT), and on its own it can make an accent sound foreign.' },
        numbers: () => ({ it: 'in questo modello: «t» inglese 79 ms, italiana 7 ms; misure su parlanti veri: inglese circa 70 ms, italiano 10-25 ms (Lisker e Abramson 1964)', en: 'in this model: English “t” 79 ms, Italian 7 ms; measured on real speakers: English about 70 ms, Italian 10-25 ms (Lisker & Abramson 1964)' }),
      },
    ],
  },
  {
    kicker: { it: 'Capitolo 7', en: 'Chapter 7' },
    title: { it: 'Il naso: una porta e due strade', en: 'The nose: a door and two passages' },
    paragraphs: [
      { it: 'Dietro il palato duro c’è il velo palatino, una porta verso il naso. Chiusa, tutto il suono esce dalla bocca; aperta, una parte sale nel naso. Così nascono m, n e la «n» di «banca»: la bocca chiusa in un punto e il naso aperto.', en: 'Behind the hard palate sits the soft palate, the velum, a door to the nose. Closed, all the sound leaves through the mouth; open, part of it goes up through the nose. That is how m, n and the “ng” of “sing” are made: the mouth closed somewhere and the nose open.' },
      { it: 'Un tubo con una diramazione non si limita a risuonare: a certe frequenze la diramazione inghiotte il suono e lo spettro mostra delle valli, le antirisonanze. Il ronzio di una «m» è basso e smorzato, con una valle dove la bocca chiusa assorbe.', en: 'A tube with a side branch does more than resonate: at some frequencies the branch swallows the sound and the spectrum shows valleys, the antiresonances. The hum of an “m” is low and muffled, with a valley where the closed mouth absorbs.' },
      { it: 'E il naso non è un tubo solo: il setto lo divide in due fosse, ognuna con la sua narice, e i seni paranasali vi si aprono come piccole cavità. Le due fosse quasi mai sono uguali: ogni poche ore la mucosa di un lato si gonfia e quella dell’altro si sgonfia, il ciclo nasale.', en: 'And the nose is not one tube: the septum splits it into two passages, each with its nostril, and the sinuses open into them like small cavities. The two passages are almost never equal: every few hours the lining of one side swells while the other side’s shrinks, the nasal cycle.' },
    ],
    actions: [
      { label: { it: 'Ronza una «m»', en: 'Hum an “m”' }, run: () => { clean(); setPhoneme('m'); void go('spectrum', 'tract'); } },
      { label: { it: 'Una «a» nasale', en: 'A nasal “ah”' }, run: () => { clean(); vowel('a', 120); store.setParams((p) => { p.articulators.velum = 0.7; }); void go('spectrum', 'tract'); } },
      { label: { it: '«la mamma e la nonna»', en: '“many men and women”' }, run: () => { clean(); void go('spectrum', 'speak'); sayL({ it: 'la mamma e la nonna', en: 'many men and women' }); } },
    ],
    experiments: [
      {
        question: { it: 'Cosa succede se tappi il naso mentre ronzi una «m»?', en: 'What happens if you pinch your nose while humming an “m”?' },
        steps: [
          { label: { it: 'Ronza una «m»', en: 'Hum an “m”' }, run: () => { clean(); setPhoneme('m'); void go('spectrum', 'tract'); } },
          { label: { it: 'Tappa il naso', en: 'Pinch the nose' }, run: () => store.setParams((p) => { p.anatomy.nostrilLeft = 0; p.anatomy.nostrilRight = 0; }) },
          { label: { it: 'Lascialo', en: 'Let go' }, run: () => store.setParams((p) => { p.anatomy.nostrilLeft = 1; p.anatomy.nostrilRight = 1; }) },
        ],
        look: { it: 'Ascolta, e guarda l’indicatore «ronzio» e il flusso d’aria nella testa.', en: 'Listen, and watch the “buzz” meter and the airflow in the head.' },
        answer: { it: 'Con le labbra chiuse e il naso tappato l’aria non ha più uscita: in una frazione di secondo la pressione in bocca sale fino a quella dei polmoni e le corde si fermano. Prova su di te: ronza e tappati il naso, il ronzio si spegne (o ti si gonfiano le guance). Per questo con il raffreddore «mamma» diventa quasi «babba».', en: 'With the lips closed and the nose pinched the air has no way out: within a fraction of a second the mouth pressure rises to the lung pressure and the folds stop. Try it yourself: hum and pinch your nose, the hum dies (or your cheeks puff out). That is why with a cold “mommy” turns into something like “bobby”.' },
        numbers: airNumbers,
      },
      {
        question: { it: 'Due fosse uguali o diverse: si vede?', en: 'Two equal passages or unequal ones: does it show?' },
        steps: [
          { label: { it: 'Fosse uguali', en: 'Equal passages' }, run: () => { clean(); setPhoneme('m'); store.setUi({ envelope: true }); void go('spectrum', 'tract'); } },
          { label: { it: 'Lato sinistro congestionato', en: 'Left side congested' }, run: () => store.setParams((p) => { p.anatomy.nasalCycle = -0.7; p.anatomy.nostrilLeft = 1; }) },
          { label: { it: 'Narice sinistra tappata', en: 'Left nostril pinched' }, run: () => store.setParams((p) => { p.anatomy.nasalCycle = 0; p.anatomy.nostrilLeft = 0; }) },
        ],
        look: { it: 'Guarda l’inviluppo, e accendi i Numeri per l’elenco di picchi e valli: con le fosse diverse compare un picco nuovo verso 2,2 kHz con la sua valle; con una narice tappata il primo picco del ronzio scende, da circa 320 a 240 Hz, e tra 1,5 e 1,8 kHz nasce un’altra coppia.', en: 'Watch the envelope, and switch Numbers on for the list of peaks and valleys: with unequal passages a new peak appears near 2.2 kHz with its valley; with one nostril pinched the first peak of the hum drops, from about 320 to 240 Hz, and another pair appears between 1.5 and 1.8 kHz.' },
        answer: { it: 'Due strade di larghezza diversa interferiscono: a certe frequenze le onde arrivano alle narici in fase e si sommano, ad altre in controfase e si cancellano. Una fossa tappata diventa una diramazione chiusa, come una canna d’organo tappata: inghiotte il suono alla sua frequenza di risonanza. L’orecchio lo nota appena, ma è uno dei motivi per cui ogni naso suona un po’ diverso.', en: 'Two paths of different width interfere: at some frequencies the waves reach the nostrils in step and add up, at others out of step and cancel. A pinched passage becomes a closed side branch, like a stopped organ pipe: it swallows sound at its own resonance. The ear barely notices, but it is one reason why every nose sounds a little different.' },
        numbers: peakNumbers,
      },
    ],
  },
  {
    kicker: { it: 'Capitolo 8', en: 'Chapter 8' },
    title: { it: 'Tratti veri, misurati', en: 'Real tracts, measured' },
    paragraphs: [
      { it: 'Come si conosce la forma di un tratto vocale vero? Con la risonanza magnetica: chi parla tiene una vocale dentro lo scanner e, fetta dopo fetta, si misura l’area del passaggio d’aria dalla laringe alle labbra. Il risultato è una funzione d’area.', en: 'How do we know the shape of a real vocal tract? With magnetic resonance imaging: a speaker holds a vowel inside the scanner and, slice by slice, the area of the air passage is measured from the larynx to the lips. The result is an area function.' },
      { it: 'Qui ci sono 11 vocali misurate così su un uomo adulto (Story 2008, 44 fette ciascuna). Caricate come tubo suonano come le sue vocali: la sola fisica del tubo, senza articolatori, restituisce le sue formanti a pochi punti percentuali.', en: 'This simulator carries 11 vowels measured this way on one adult man (Story 2008, 44 slices each). Loaded as the tube they sound like his vowels: the physics of the tube alone, with no articulators, gives back his formants within a few percent.' },
      { it: 'Gli articolatori della testa sono stati adattati a queste forme: tra le tante posizioni della lingua che danno a una vocale le sue formanti, si sceglie quella più vicina al tratto misurato.', en: 'The articulators of the head were fitted to these shapes: among the many tongue positions that give a vowel its formants, the fit picks the one closest to the measured tract.' },
    ],
    actions: [
      { label: { it: 'La «i» misurata', en: 'The measured “ee”' }, run: () => { clean(); mri('i'); } },
      { label: { it: 'La «a» misurata (ɑ)', en: 'The measured “ah” (ɑ)' }, run: () => { clean(); mri('ɑ'); } },
      { label: { it: 'La «u» misurata', en: 'The measured “oo”' }, run: () => { clean(); mri('u'); } },
    ],
    experiments: [
      {
        question: { it: 'La «ɑ» della testa e quella misurata hanno la stessa forma?', en: 'Do the head’s “ɑ” and the measured one have the same shape?' },
        steps: [
          { label: { it: 'La «ɑ» misurata', en: 'The measured “ɑ”' }, run: () => { clean(); mri('ɑ'); } },
          { label: { it: 'La «ɑ» della testa', en: 'The head’s “ɑ”' }, run: () => { clean(); vowel('ɑ', 120); void go('tube', 'tract'); } },
        ],
        look: { it: 'Confronta i profili nella vista «Il tubo»: la gola a sinistra, le labbra a destra.', en: 'Compare the profiles in “The tube” view: the throat on the left, the lips on the right.' },
        answer: { it: 'Le forme si somigliano ma non sono uguali: la testa è un disegno con 13 comandi, la scansione è una persona vera. F1 quasi coincide, F2 e F3 no: le vocali della testa sono accordate sulle formanti medie di tanti uomini (Peterson e Barney 1952), la scansione è di un uomo solo. E nemmeno la sua scansione ridà esattamente la sua voce registrata: nello scanner si sta sdraiati, si tiene la vocale a lungo e le labbra si misurano male.', en: 'The shapes are alike but not the same: the head is a drawing with 13 controls, the scan is a real person. F1 nearly agrees, F2 and F3 do not: the head’s vowels are tuned to the average formants of many men (Peterson & Barney 1952), the scan is one man. And even his scan does not give back exactly his recorded voice: in the scanner you lie down, hold the vowel for a long time, and the lips are hard to measure.' },
        numbers: () => {
          const f = formantNumbers();
          const v = MRI_VOWELS.find((m) => m.ipa === 'ɑ')!;
          const rec = v.recorded.map((x) => Math.round(x)).join(' · '), comp = v.computed.map((x) => Math.round(x)).join(' · ');
          return { it: `ora: ${f.it}; calcolate da Story sulla scansione: ${comp} Hz; la sua «ɑ» registrata: ${rec} Hz`, en: `now: ${f.en}; computed by Story from the scan: ${comp} Hz; his recorded “ɑ”: ${rec} Hz` };
        },
      },
    ],
  },
  {
    kicker: { it: 'Capitolo 9', en: 'Chapter 9' },
    title: { it: 'Lo spettrogramma', en: 'The spectrogram' },
    paragraphs: [
      { it: 'Per vedere tutto questo nel tempo si taglia il suono in fette brevi e sovrapposte, si calcola lo spettro di ognuna e le si mette in fila: il tempo va a destra, la frequenza in alto, la luminosità è l’energia.', en: 'To see all this over time, cut the sound into short, overlapping slices, take the spectrum of each and stand them side by side: time runs to the right, frequency goes up, brightness is energy.' },
      { it: 'Le righe sottili ed equidistanti sono le armoniche che salgono e scendono con la melodia; le bande luminose che attraversano sono le formanti; le macchie sfocate sono il rumore, come una «s».', en: 'The thin, evenly spaced stripes are the harmonics, rising and falling with the melody; the bright bands they cross are the formants; the fuzzy patches are noise, like an “s”.' },
      { it: 'C’è un compromesso: fette lunghe separano le armoniche ma sfocano gli eventi rapidi; fette corte colgono ogni impulso delle corde ma fondono le armoniche. Lo spettrogramma mel piega le frequenze come l’orecchio, le raggruppa in 80 bande e ne prende il logaritmo.', en: 'There is a trade-off: long slices separate the harmonics but blur fast events; short slices catch every pulse of the folds but merge the harmonics. The mel spectrogram bends frequency like the ear, groups it into 80 bands and takes the logarithm.' },
    ],
    actions: [
      { label: { it: 'Pronuncia una frase', en: 'Speak a sentence' }, run: () => { clean(); store.setUi({ mel: false, specWindow: 30 }); void go(undefined, 'speak'); sayL({ it: 'la voce è fatta di aria', en: 'a buzz, a hiss and a filter' }); } },
      { label: { it: 'Fette lunghe (40 ms)', en: 'Long slices (40 ms)' }, run: () => { store.setUi({ specWindow: 40, mel: false }); sayL({ it: 'sasso', en: 'a hiss' }); } },
      { label: { it: 'Fette corte (4 ms)', en: 'Short slices (4 ms)' }, run: () => { store.setUi({ specWindow: 4, mel: false }); sayL({ it: 'sasso', en: 'a hiss' }); } },
      { label: { it: 'Log-mel, 80 bande', en: 'Log-mel, 80 bands' }, run: () => { store.setUi({ specWindow: 25, mel: true }); sayL({ it: 'un ronzio e un fruscio', en: 'a buzz and a hiss' }); } },
    ],
  },
  {
    kicker: { it: 'Capitolo 10', en: 'Chapter 10' },
    title: { it: 'Dai suoni alle frasi', en: 'From sounds to sentences' },
    paragraphs: [
      { it: 'Parlare non è infilare suoni uno dopo l’altro: lingua e labbra sono sempre in viaggio da un bersaglio al successivo, e ogni suono prende un po’ del colore dei vicini, la coarticolazione. La «c» di «chi» si fa più avanti di quella di «cu».', en: 'Speech is not a string of separate sounds: the tongue and the lips are always on their way from one target to the next, and every sound takes some color from its neighbours, coarticulation. The “k” of “key” is made further forward than the “k” of “coo”.' },
      { it: 'Anche i tempi portano significato: una vocale accentata dura di più, l’ultima parola della frase rallenta, una doppia italiana («fatto») dura circa il doppio di una scempia («fato»). La melodia sale e scende con gli accenti e cala alla fine di un’affermazione; una domanda sì/no risale.', en: 'Timing carries meaning too: a stressed vowel lasts longer, the last word of a phrase slows down, an Italian double consonant (“fatto”) lasts about twice a single one (“fato”). The melody rises and falls with the accents and drops at the end of a statement; a yes/no question goes back up.' },
      { it: 'Nella scheda «Parla» ognuno di questi ingredienti si può spegnere. Senza di loro gli stessi suoni escono meccanici, come parlavano le prime macchine.', en: 'In the Speak tab each of these ingredients can be switched off. Without them the same sounds come out mechanical, the way early speech machines talked.' },
    ],
    actions: [
      { label: { it: 'Una frase con tutti gli ingredienti', en: 'A sentence with every ingredient' }, run: () => { clean(); void go('spectrum', 'speak'); void sayWithout(SENTENCE, {}); } },
      { label: { it: 'La stessa, da robot', en: 'The same, robot style' }, run: () => { clean(); void go('spectrum', 'speak'); void sayWithout(SENTENCE, NO_NATURAL); } },
      { label: { it: 'Una domanda', en: 'A question' }, run: () => { clean(); void go('spectrum', 'speak'); sayL({ it: 'piove in città oggi?', en: 'is it raining in the city today?' }); } },
    ],
    experiments: [
      {
        question: { it: 'Quale ingrediente si nota di più quando manca?', en: 'Which ingredient do you miss most when it is gone?' },
        steps: [
          { label: { it: 'Tutti', en: 'All of them' }, run: () => { clean(); void go('spectrum', 'speak'); void sayWithout(SENTENCE, {}); } },
          { label: { it: 'Senza melodia', en: 'No melody' }, run: () => { void sayWithout(SENTENCE, { intonation: false, micro: false }); } },
          { label: { it: 'Senza tempi', en: 'No timing' }, run: () => { void sayWithout(SENTENCE, { timing: false }); } },
          { label: { it: 'Senza coarticolazione', en: 'No coarticulation' }, run: () => { void sayWithout(SENTENCE, { coarticulation: false }); } },
        ],
        look: { it: 'Ascolta che cosa suona meccanico ogni volta. Nello spettrogramma la melodia si vede nelle righe delle armoniche che salgono e scendono.', en: 'Listen for what sounds mechanical each time. In the spectrogram the melody shows in the stripes of the harmonics rising and falling.' },
        answer: { it: 'Di solito manca subito la melodia: su una nota piatta anche suoni perfetti sembrano di un robot. Senza coarticolazione ogni suono è pulito ma i passaggi saltano; senza le regole dei tempi tutto dura uguale, come un metronomo. Nessun ingrediente basta da solo: la naturalezza è la loro somma.', en: 'Most people miss the melody first: on a flat pitch even perfect sounds seem robotic. Without coarticulation each sound is clean but the joins jump; without the timing rules everything lasts the same, like a metronome. No single ingredient is enough: naturalness is their sum.' },
      },
      {
        question: { it: 'Quanto dura una vocale?', en: 'How long does a vowel last?' },
        steps: [
          { label: { it: '«fato»', en: '“bead”' }, run: () => { clean(); void go('spectrum', 'speak'); sayL({ it: 'fato', en: 'bead' }); } },
          { label: { it: '«fatto»', en: '“beat”' }, run: () => { sayL({ it: 'fatto', en: 'beat' }); } },
        ],
        look: { it: 'Ascolta la prima vocale e guardala nello spettrogramma: una banda di armoniche più lunga o più corta.', en: 'Listen to the vowel and look at it in the spectrogram: a longer or shorter band of harmonics.' },
        answer: { it: 'In italiano una vocale accentata in sillaba aperta si allunga («fa-to») e davanti a una doppia si accorcia («fat-to»). In inglese una vocale dura di più davanti a una consonante sonora: «bead» più di «beat». Sono regole che l’orecchio usa senza accorgersene per riconoscere le parole.', en: 'In Italian a stressed vowel in an open syllable stretches (“fa-to”) and shrinks before a double consonant (“fat-to”). In English a vowel lasts longer before a voiced consonant: “bead” more than “beat”. The ear uses such rules, without noticing, to recognise words.' },
        numbers: () => ({
          it: `prima vocale: «fato» ${vowelMs('fato', 'it')} ms, «fatto» ${vowelMs('fatto', 'it')} ms; «bead» ${vowelMs('bead', 'en')} ms, «beat» ${vowelMs('beat', 'en')} ms`,
          en: `first vowel: “fato” ${vowelMs('fato', 'it')} ms, “fatto” ${vowelMs('fatto', 'it')} ms; “bead” ${vowelMs('bead', 'en')} ms, “beat” ${vowelMs('beat', 'en')} ms`,
        }),
      },
    ],
  },
  {
    kicker: { it: 'Capitolo 11', en: 'Chapter 11' },
    title: { it: 'Una voce sintetica', en: 'A machine voice' },
    paragraphs: [
      { it: 'Il video mostra poi come un piccolo modello vocale, quello del lavoro «Teacher in the Loop», costruisce una voce con gli stessi ingredienti: una melodia, un ronzio, un fruscio e un filtro.', en: 'The video then shows how a small speech model, the one of the “Teacher in the Loop” paper, builds a voice from the same ingredients: a melody, a buzz, a hiss and a filter.' },
      { it: 'Qui puoi provare solo la parte del ronzio come la racconta il video: nove sinusoidi agganciate alla nota, un rumore leggero dove la melodia è zero, e un mix che diventa l’eccitazione. Il resto è un filtro appreso.', en: 'Here you can try only the buzz part, as the video tells it: nine sines locked to the pitch, a soft noise where the melody is zero, and a mix that becomes the excitation. The rest is a learned filter.' },
    ],
    actions: [
      { label: { it: 'Apri la scheda', en: 'Open the tab' }, run: () => { void go('spectrum', 'machine'); } },
    ],
  },
];
