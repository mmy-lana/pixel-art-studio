/**
 * Audio controller.
 *
 * Renders nothing. Its only job is to bind the audio engine to the editor's
 * sound preference and unlock the `AudioContext` on the first user gesture, so
 * every component can fire cues through the shared singleton without worrying
 * about browser autoplay rules.
 */

import { useRetroAudio } from '../../hooks/useRetroAudio';

export interface AudioControllerProps {
  /** Rendered in a `<title>` for debugging; never visible. */
  label?: string;
}

/**
 * Mounts the audio side effects for the shell.
 *
 * @returns A `null`-rendering component; mounting it is what matters.
 */
export function AudioController({ label }: AudioControllerProps) {
  const { isSupported, isMuted } = useRetroAudio();

  if (isSupported && !isMuted) {
    // No DOM output: the sound engine is fully imperative.
    return null;
  }

  // Expose the state for assistive diagnostics in dev without rendering chrome.
  return label !== undefined ? (
    <span className="sr-only" role="status">
      {isSupported ? 'Sound effects muted' : 'Sound effects unavailable on this device'}
    </span>
  ) : null;
}
