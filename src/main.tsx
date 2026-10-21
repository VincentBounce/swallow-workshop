import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import { store } from './ui/store';

// handy for debugging in the browser console during development
if (import.meta.env.DEV) (window as unknown as { voiceStore: typeof store }).voiceStore = store;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
