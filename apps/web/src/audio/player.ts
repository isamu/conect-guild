import { toTones, type Score } from './scores';

/**
 * The parts of Web Audio the player uses. A real AudioContext fits these, and tests pass a fake
 * that records what was scheduled.
 */
export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
}

export interface OscillatorLike extends AudioNodeLike {
  type: OscillatorType;
  readonly frequency: AudioParamLike;
  start(when: number): void;
  stop(when: number): void;
}

export interface GainLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: AudioNodeLike;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume(): Promise<void>;
}

/** Makes the context; null when the browser has no Web Audio. Called on the first unlock. */
export type CreateAudioContext = () => AudioContextLike | null;

export interface TonePlayer {
  /**
   * Creates (once) and resumes the context. Call it from a click or key press: browsers keep audio
   * suspended until the viewer acts. Never rejects.
   */
  unlock(): Promise<void>;
  /** Plays at once at `volume` (0..1). False (and silent) while the context is not running. */
  play(score: Score, volume: number): boolean;
}

/** Starts slightly ahead so the first note is not cut by the scheduling delay. */
const LEAD_SEC = 0.01;

function defaultCreateAudioContext(): AudioContextLike | null {
  if (typeof globalThis.AudioContext !== 'function') return null;
  try {
    return new globalThis.AudioContext();
  } catch {
    return null;
  }
}

export function createTonePlayer(
  create: CreateAudioContext = defaultCreateAudioContext,
): TonePlayer {
  let context: AudioContextLike | null = null;
  return {
    async unlock() {
      context ??= create();
      try {
        await context?.resume();
      } catch {
        // Still suspended: play() stays silent until a later unlock succeeds.
      }
    },
    play(score, volume) {
      // A suspended context would queue the notes and play them all at once when resumed.
      if (context?.state !== 'running') return false;
      const ctx = context;
      for (const tone of toTones(score, ctx.currentTime + LEAD_SEC, volume)) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = tone.wave;
        oscillator.frequency.setValueAtTime(tone.frequency, tone.start);
        // A plain decay to silence: no click at the end, and long notes fade like the old chips.
        gain.gain.setValueAtTime(tone.gain, tone.start);
        gain.gain.linearRampToValueAtTime(0, tone.stop);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(tone.start);
        oscillator.stop(tone.stop);
      }
      return true;
    },
  };
}
