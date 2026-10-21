import { store, ViewTab, ControlTab } from './store';
import { applyPhoneme, VOICE_PRESETS, TIMBRE_PRESETS, setPhoneme } from './presets';
import { textToPhones } from '../dsp/speech/g2p';
import { buildScore } from '../dsp/speech/sequencer';
import { DEFAULT_SOURCE, DEFAULT_NOISE } from '../dsp/engine/params';
import { DEFAULT_ANATOMY } from '../dsp/tract/types';

type Bi = { it: string; en: string };
export interface TourAction { label: Bi; run: () => void }
export interface Chapter { title: Bi; kicker: Bi; paragraphs: Bi[]; actions: TourAction[] }

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
const say = (text: string, lang: 'it' | 'en') => {
  const p = store.params;
  void store.speak(buildScore(textToPhones(text, lang), { lang, f0: p.source.f0, ps: Math.max(7, p.source.ps) }));
};
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

export const CHAPTERS: Chapter[] = [
  {
    kicker: { it: 'Benvenuto', en: 'Welcome' },
    title: { it: 'Un ronzio e un filtro', en: 'A buzz and a filter' },
    paragraphs: [
      { it: 'Ogni voce che hai sentito è fatta di due ingredienti: un ronzio, che nasce nella laringe, e un filtro, la gola e la bocca, che lo colora.', en: 'Every voice you have heard is made of two ingredients: a buzz, born in the larynx, and a filter, the throat and the mouth, that colours it.' },
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
  },
  {
    kicker: { it: 'Capitolo 4', en: 'Chapter 4' },
    title: { it: 'Due manopole indipendenti', en: 'Two independent knobs' },
    paragraphs: [
      { it: 'L’idea chiave: ronzio e filtro si comandano quasi indipendentemente.', en: 'The key idea: the buzz and the filter are controlled almost independently.' },
      { it: 'Con il filtro fermo, alzando la nota le armoniche si allargano e scorrono sotto lo stesso inviluppo: la vocale resta la stessa e la voce resta riconoscibile. Con la nota ferma, cambiando il filtro cambia la vocale.', en: 'Keep the filter fixed and raise the pitch: the harmonics spread apart and slide under the same envelope; the vowel and the voice stay the same. Keep the pitch and change the filter: same note, different vowel.' },
      { it: 'Per questo puoi cantare una nota più alta e suonare ancora come te: melodia e colore sono due manopole diverse.', en: 'That is why you can sing a higher note and still sound like yourself: melody and colour are two different knobs.' },
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
      { it: 'Una voce sono dunque tre cose: un ronzio che porta la melodia, un fruscio, e un filtro che li colora entrambi.', en: 'So a voice is three things: a buzz that carries the melody, a hiss, and a filter that colours them both.' },
    ],
    actions: [
      { label: { it: 'Una «s»: il getto sui denti', en: 'An “s”: the jet on the teeth' }, run: () => { clean(); setPhoneme('s'); void go('spectrum', 'teeth'); } },
      { label: { it: 'Una «f»: piatta e debole', en: 'An “f”: flat and weak' }, run: () => { setPhoneme('f'); void go('spectrum', 'teeth'); } },
      { label: { it: 'Voce soffiata', en: 'Breathy voice' }, run: () => { clean(); vowel('a', 110); store.setParams(VOICE_PRESETS.find((x) => x.id === 'breathy')!.apply); void go('spectrum', 'noise'); } },
      { label: { it: 'Fruscio costante o pulsato', en: 'Steady or pulsed hiss' }, run: () => { void go('scope', 'ab'); } },
      { label: { it: 'Disegna il tuo rumore', en: 'Draw your own noise' }, run: () => { void go('spectrum', 'noise'); } },
    ],
  },
  {
    kicker: { it: 'Capitolo 6', en: 'Chapter 6' },
    title: { it: 'Lo spettrogramma', en: 'The spectrogram' },
    paragraphs: [
      { it: 'Per vedere tutto questo nel tempo si taglia il suono in fette brevi e sovrapposte, si calcola lo spettro di ognuna e le si mette in fila: il tempo va a destra, la frequenza in alto, la luminosità è l’energia.', en: 'To see all this over time, cut the sound into short, overlapping slices, take the spectrum of each and stand them side by side: time runs to the right, frequency goes up, brightness is energy.' },
      { it: 'Le righe sottili ed equidistanti sono le armoniche che salgono e scendono con la melodia; le bande luminose che attraversano sono le formanti; le macchie sfocate sono il rumore, come una «s».', en: 'The thin, evenly spaced stripes are the harmonics, rising and falling with the melody; the bright bands they cross are the formants; the fuzzy patches are noise, like an “s”.' },
      { it: 'C’è un compromesso: fette lunghe separano le armoniche ma sfocano gli eventi rapidi; fette corte colgono ogni impulso delle corde ma fondono le armoniche. Lo spettrogramma mel piega le frequenze come l’orecchio, le raggruppa in 80 bande e ne prende il logaritmo.', en: 'There is a trade-off: long slices separate the harmonics but blur fast events; short slices catch every pulse of the folds but merge the harmonics. The mel spectrogram bends frequency like the ear, groups it into 80 bands and takes the logarithm.' },
    ],
    actions: [
      { label: { it: 'Pronuncia una frase', en: 'Speak a sentence' }, run: () => { clean(); store.setUi({ mel: false, specWindow: 30 }); void go(undefined, 'speak'); say('la voce è fatta di aria', 'it'); } },
      { label: { it: 'Fette lunghe (40 ms)', en: 'Long slices (40 ms)' }, run: () => { store.setUi({ specWindow: 40, mel: false }); say('sasso', 'it'); } },
      { label: { it: 'Fette corte (4 ms)', en: 'Short slices (4 ms)' }, run: () => { store.setUi({ specWindow: 4, mel: false }); say('sasso', 'it'); } },
      { label: { it: 'Log-mel, 80 bande', en: 'Log-mel, 80 bands' }, run: () => { store.setUi({ specWindow: 25, mel: true }); say('a buzz and a hiss', 'en'); } },
    ],
  },
  {
    kicker: { it: 'Capitolo 7', en: 'Chapter 7' },
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
