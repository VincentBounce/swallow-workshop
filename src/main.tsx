import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import { store } from './ui/store';
import { voice } from './ui/voice/voice';
import { AudioBridge } from './audio/audioEngine';

// the voice reaches the speakers through the audio worklet
voice.attach(new AudioBridge());

// handy for debugging in the browser console during development
if (import.meta.env.DEV) Object.assign(window, { voiceStore: store, voice });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
