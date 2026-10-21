import { useStore, Lang } from './store';

/** UI strings, Italian first (default) and English. */
export const S = {
  appTitle: { it: 'Officina della voce', en: 'Voice Workshop' },
  appSub: { it: 'un ronzio, un fruscio e un filtro', en: 'a buzz, a hiss and a filter' },
  tour: { it: 'Visita guidata', en: 'Guided tour' },
  lab: { it: 'Laboratorio', en: 'Free lab' },
  startAudio: { it: 'Accendi l’audio', en: 'Start audio' },
  audioOn: { it: 'Audio acceso', en: 'Audio on' },
  blow: { it: 'Soffia', en: 'Blow' },
  blowing: { it: 'Sta soffiando', en: 'Blowing' },
  numbers: { it: 'Numeri', en: 'Numbers' },
  freeze: { it: 'Blocca', en: 'Freeze' },
  volume: { it: 'Volume', en: 'Volume' },
  // view tabs
  vSpectrum: { it: 'Spettro', en: 'Spectrum' },
  vScope: { it: 'Onda', en: 'Waveform' },
  vGlottis: { it: 'Corde vocali', en: 'Vocal folds' },
  vChart: { it: 'Mappa delle vocali', en: 'Vowel map' },
  vTube: { it: 'Il tubo', en: 'The tube' },
  spectrogram: { it: 'Spettrogramma', en: 'Spectrogram' },
  // control tabs
  cSource: { it: 'Sorgente', en: 'Source' },
  cTract: { it: 'Tratto e persona', en: 'Tract & person' },
  cTeeth: { it: 'Denti e fessura', en: 'Teeth & slit' },
  cNoise: { it: 'Rumore', en: 'Noise' },
  cSpeak: { it: 'Parla', en: 'Speak' },
  cMelody: { it: 'Melodia', en: 'Melody' },
  cAB: { it: 'Esperimento A/B', en: 'A/B experiment' },
  cMachine: { it: 'Voce sintetica', en: 'Machine voice' },
  // head view
  headTitle: { it: 'Sezione della testa', en: 'Head cross-section' },
  headHint: { it: 'Trascina i punti: lingua, punta, mascella, labbra, velo, laringe, denti', en: 'Drag the handles: tongue, tip, jaw, lips, velum, larynx, teeth' },
  fieldPressure: { it: 'Pressione', en: 'Pressure' },
  fieldVelocity: { it: 'Velocità', en: 'Velocity' },
  fieldAir: { it: 'Flusso d’aria', en: 'Airflow' },
  hTongue: { it: 'lingua', en: 'tongue' },
  hTip: { it: 'punta', en: 'tip' },
  hJaw: { it: 'mascella', en: 'jaw' },
  hLips: { it: 'labbra', en: 'lips' },
  hVelum: { it: 'velo', en: 'velum' },
  hLarynx: { it: 'laringe', en: 'larynx' },
  hTeeth: { it: 'denti', en: 'teeth' },
  // misc
  play: { it: 'Ascolta', en: 'Listen' },
  stop: { it: 'Ferma', en: 'Stop' },
  reset: { it: 'Ripristina', en: 'Reset' },
  on: { it: 'acceso', en: 'on' },
  off: { it: 'spento', en: 'off' },
  mic: { it: 'Microfono', en: 'Microphone' },
  micHint: { it: 'Confronta la tua voce (solo analisi, niente registrazione)', en: 'Compare your voice (analysis only, nothing is recorded)' },
  harmonics: { it: 'Armoniche', en: 'Harmonics' },
  envelope: { it: 'Inviluppo del filtro', en: 'Filter envelope' },
  window: { it: 'Finestra', en: 'Window' },
  mel: { it: 'Log-mel 80 bande', en: 'Log-mel 80 bands' },
  linear: { it: 'Lineare', en: 'Linear' },
  noAudio: { it: 'Accendi l’audio e premi «Soffia» per sentire e vedere la voce.', en: 'Start the audio and press “Blow” to hear and see the voice.' },
} as const;

export type Key = keyof typeof S;

export function tr(k: Key, lang: Lang): string { return S[k][lang]; }

export function useT(): (k: Key) => string {
  const lang = useStore((s) => s.ui.lang);
  return (k: Key) => S[k][lang];
}

/** Inline bilingual text: L({ it, en }). */
export function useL(): (t: { it: string; en: string }) => string {
  const lang = useStore((s) => s.ui.lang);
  return (t) => t[lang];
}
