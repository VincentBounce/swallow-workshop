import { useSyncExternalStore } from 'react';
import type { EngineParams } from '../../dsp/engine/params';
import { voice, VoiceController } from './voice';
import type { ControlId } from './controls';
import type { Lanes, Lock } from './drivers';

/** React binding: re-renders when the voice changes and the selected value differs (select stable values). */
export function useVoice<T>(sel: (v: VoiceController) => T): T {
  return useSyncExternalStore(voice.subscribe, () => sel(voice));
}

/** The hands' parameters. */
export function useManual(): EngineParams { return useVoice((v) => v.manual); }
export function useLanes(): Lanes { return useVoice((v) => v.lanes); }
/** Who owns a control (null = the hands). */
export function useLock(c: ControlId | undefined): Lock | null { return useVoice((v) => (c ? v.lock(c) : null)); }
export function useSoundOn(): boolean { return useVoice((v) => v.soundOn); }
