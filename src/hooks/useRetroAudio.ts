/**
 * Retro audio hook.
 *
 * Binds the synthesised audio engine to the editor's sound preference and
 * unlocks the `AudioContext` on the first user gesture (browsers refuse to start
 * audio outside a gesture). The engine singleton itself lives in
 * `utils/audio/soundSynth`, so any module can trigger a cue without importing
 * this hook — sibling hooks must never depend on each other.
 */

import { useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { retroAudioEngine } from '../utils/audio/soundSynth';

export interface RetroAudioApi {
  /** True when the environment can synthesise audio at all. */
  isSupported: boolean;
  /** True when output is currently suppressed by the sound preference. */
  isMuted: boolean;
}

/** Preferences are mirrored onto the engine so `setMuted` is the only gate. */
export function useRetroAudio(): RetroAudioApi {
  const soundEffectsEnabled = useEditorStore((state) => state.settings.soundEffectsEnabled);
  const isSupported = retroAudioEngine.isSupported();

  useEffect(() => {
    retroAudioEngine.setMuted(!soundEffectsEnabled);
  }, [soundEffectsEnabled]);

  useEffect(() => {
    if (!soundEffectsEnabled) {
      return;
    }

    const unlock = (): void => {
      retroAudioEngine.unlock();
    };

    // `once` is enough: after the first gesture the context stays running for the
    // lifetime of the page.
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });

    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [soundEffectsEnabled]);

  return { isSupported, isMuted: !soundEffectsEnabled || !isSupported };
}
