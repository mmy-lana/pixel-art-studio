/**
 * Retro audio engine.
 *
 * Generates every sound effect programmatically with the Web Audio API — the
 * application ships zero audio assets. All effects are short, square/triangle/
 * sawtooth based and deliberately low-gain so rapid drawing does not clip.
 *
 * FAILURE POLICY: audio is a non-essential enhancement. If the environment has no
 * `AudioContext`, or the context cannot be created/resumed (autoplay policy,
 * exhausted hardware voices), every method degrades to a silent no-op instead of
 * throwing into an interaction handler.
 */

/** Envelope release shape applied to a tone's gain node. */
type EnvelopeRelease = 'exponential' | 'linear';

/** Frequency motion applied within a tone. */
type FrequencyMotion = 'none' | 'exponential' | 'linear' | 'step';

interface ToneOptions {
  /** Oscillator waveform. */
  wave: OscillatorType;
  /** Frequency in Hz at the tone start. */
  frequency: number;
  /** Target frequency in Hz for `exponential` / `linear` / `step` motion. */
  frequencyEnd?: number;
  /** How the frequency moves toward `frequencyEnd`. */
  frequencyMotion?: FrequencyMotion;
  /** Seconds (relative to the tone start) at which frequency motion completes. */
  frequencyMotionDuration?: number;
  /** Seconds from "now" at which the tone begins. */
  startOffset: number;
  /** Seconds the tone sounds for. */
  duration: number;
  /** Peak gain of the tone's own gain node. */
  peakGain: number;
  /** Shape of the release ramp down to silence. */
  release?: EnvelopeRelease;
}

/** Gain floor used for exponential releases (`exponentialRampToValueAtTime` cannot hit 0). */
const SILENCE_FLOOR = 0.001;

/**
 * Stateful 8-bit sound synthesizer.
 *
 * A single shared instance is exported as `retroAudioEngine`; every component
 * must use it so the app never allocates more than one `AudioContext`.
 */
export class RetroAudioEngine {
  private context: AudioContext | null = null;

  private muted: boolean = false;

  /** True once context creation has failed, to avoid retrying on every click. */
  private contextCreationFailed: boolean = false;

  /** Resolves the browser's `AudioContext` constructor, including the webkit alias. */
  private static resolveConstructor(): typeof AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const scope = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };

    return scope.AudioContext ?? scope.webkitAudioContext ?? null;
  }

  /** Whether this environment can synthesise audio at all. */
  public isSupported(): boolean {
    return RetroAudioEngine.resolveConstructor() !== null;
  }

  /** Whether output is currently suppressed. */
  public isMuted(): boolean {
    return this.muted;
  }

  /** Suppresses or restores all synthesised output. */
  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /**
   * Creates the context on first use and resumes it if the autoplay policy left
   * it suspended. Returns `null` when audio is unavailable.
   */
  private initContext(): AudioContext | null {
    if (this.contextCreationFailed) {
      return null;
    }

    if (this.context && this.context.state === 'closed') {
      this.context = null;
    }

    if (!this.context) {
      const AudioCtor = RetroAudioEngine.resolveConstructor();

      if (!AudioCtor) {
        this.contextCreationFailed = true;
        return null;
      }

      try {
        this.context = new AudioCtor();
      } catch {
        this.contextCreationFailed = true;
        return null;
      }
    }

    if (this.context.state === 'suspended') {
      // Chrome/Safari reject this promise when no user gesture has occurred yet;
      // the next gesture-triggered call resuming is the expected recovery.
      void this.context.resume().catch(() => undefined);
    }

    return this.context;
  }

  /**
   * Reports whether audio can actually be heard right now: supported, unmuted,
   * and with a running context.
   */
  public canPlay(): boolean {
    return this.isSupported() && !this.muted && this.context?.state === 'running';
  }

  /**
   * Unlocks the audio context from a user gesture. Call once from the first
   * pointer/keyboard interaction so subsequent effect calls start immediately.
   */
  public unlock(): void {
    if (this.muted) {
      return;
    }

    const context = this.initContext();

    if (context && context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
  }

  /**
   * Schedules one oscillator tone. Returns silently when audio is unavailable.
   */
  private emitTone(options: ToneOptions): void {
    const context = this.initContext();

    if (!context) {
      return;
    }

    const startTime = context.currentTime + options.startOffset;
    const endTime = startTime + options.duration;
    const release = options.release ?? 'exponential';

    let oscillator: OscillatorNode;
    let gain: GainNode;

    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
    } catch {
      // Voice allocation failed (rare hardware limit); drop this effect.
      return;
    }

    oscillator.type = options.wave;
    oscillator.frequency.setValueAtTime(options.frequency, startTime);

    const motion = options.frequencyMotion ?? 'none';
    const motionEnd = startTime + (options.frequencyMotionDuration ?? options.duration);

    if (typeof options.frequencyEnd === 'number' && motion !== 'none') {
      if (motion === 'exponential') {
        // Guard against a zero/negative target, which the API rejects.
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(1, options.frequencyEnd),
          motionEnd,
        );
      } else if (motion === 'linear') {
        oscillator.frequency.linearRampToValueAtTime(
          Math.max(1, options.frequencyEnd),
          motionEnd,
        );
      } else {
        oscillator.frequency.setValueAtTime(Math.max(1, options.frequencyEnd), motionEnd);
      }
    }

    gain.gain.setValueAtTime(options.peakGain, startTime);

    if (release === 'exponential') {
      gain.gain.exponentialRampToValueAtTime(SILENCE_FLOOR, endTime);
    } else {
      gain.gain.linearRampToValueAtTime(SILENCE_FLOOR, endTime);
    }

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };

    oscillator.start(startTime);
    oscillator.stop(endTime);
  }

  /** Short pitch-swept blip emitted while painting a pixel or stroke point. */
  public playPixelBlip(): void {
    if (this.muted) {
      return;
    }

    this.emitTone({
      wave: 'square',
      frequency: 440,
      frequencyEnd: 880,
      frequencyMotion: 'exponential',
      frequencyMotionDuration: 0.04,
      startOffset: 0,
      duration: 0.04,
      peakGain: 0.12,
      release: 'exponential',
    });
  }

  /** Two-step triangle chirp emitted when the active tool changes. */
  public playToolSelect(): void {
    if (this.muted) {
      return;
    }

    this.emitTone({
      wave: 'triangle',
      frequency: 320,
      frequencyEnd: 640,
      frequencyMotion: 'step',
      frequencyMotionDuration: 0.03,
      startOffset: 0,
      duration: 0.07,
      peakGain: 0.1,
      release: 'linear',
    });
  }

  /** Ascending C-major arpeggio emitted when an operation completes. */
  public playActionSuccess(): void {
    if (this.muted) {
      return;
    }

    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((frequency, index) => {
      this.emitTone({
        wave: 'square',
        frequency,
        startOffset: index * 0.05,
        duration: 0.08,
        peakGain: 0.08,
        release: 'exponential',
      });
    });
  }

  /**
   * Descending step for undo, ascending step for redo. Gives history actions an
   * unambiguous directional cue without looking at the screen.
   */
  public playHistoryStep(direction: 'undo' | 'redo'): void {
    if (this.muted) {
      return;
    }

    const isUndo = direction === 'undo';

    this.emitTone({
      wave: 'square',
      frequency: isUndo ? 480 : 300,
      frequencyEnd: isUndo ? 240 : 660,
      frequencyMotion: 'step',
      frequencyMotionDuration: 0.05,
      startOffset: 0,
      duration: 0.09,
      peakGain: 0.09,
      release: 'exponential',
    });
  }

  /** Low sawtooth buzz for rejected actions and surfaced errors. */
  public playErrorBuzz(): void {
    if (this.muted) {
      return;
    }

    this.emitTone({
      wave: 'sawtooth',
      frequency: 165,
      frequencyEnd: 92,
      frequencyMotion: 'linear',
      frequencyMotionDuration: 0.16,
      startOffset: 0,
      duration: 0.18,
      peakGain: 0.09,
      release: 'linear',
    });
  }

  /**
   * Closes the audio context and releases the hardware voices. The engine can be
   * reused afterwards; the next effect re-creates the context lazily.
   */
  public dispose(): void {
    const context = this.context;
    this.context = null;

    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
  }
}

/**
 * Process-wide singleton. Components must import this instance rather than
 * constructing their own engine, so the app owns exactly one `AudioContext`.
 */
export const retroAudioEngine: RetroAudioEngine = new RetroAudioEngine();
