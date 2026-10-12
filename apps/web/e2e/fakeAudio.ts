declare global {
  interface Window {
    /** Oscillators started on the fake AudioContext (set by installFakeAudio). */
    e2eStartedTones?: number;
    /** The frequency (Hz, rounded) of each tone started, in order (set by installFakeAudio). */
    e2eToneFrequencies?: number[];
    /** The AudioContext states seen when tones started (set by installFakeAudio). */
    e2eAudioStates?: string[];
  }
}

/**
 * Runs in the page before the app (page.addInitScript): replaces AudioContext with a silent fake
 * that counts the tones started (with their frequencies), so the tests hear nothing and need no
 * audio device.
 */
export function installFakeAudio(): void {
  const param = {
    setValueAtTime: () => param,
    linearRampToValueAtTime: () => param,
  };
  class FakeAudioContext {
    currentTime = 0;
    state: AudioContextState = 'suspended';
    destination = { connect: () => undefined };
    resume(): Promise<void> {
      this.state = 'running';
      return Promise.resolve();
    }
    createGain() {
      return { gain: param, connect: () => undefined };
    }
    createOscillator() {
      let hz = 0;
      const frequency = {
        setValueAtTime: (value: number) => {
          hz = value;
          return frequency;
        },
        linearRampToValueAtTime: () => frequency,
      };
      return {
        type: 'square',
        frequency,
        connect: () => undefined,
        start: () => {
          window.e2eStartedTones = (window.e2eStartedTones ?? 0) + 1;
          window.e2eToneFrequencies?.push(Math.round(hz));
          window.e2eAudioStates?.push(this.state);
        },
        stop: () => undefined,
      };
    }
  }
  window.e2eStartedTones = 0;
  window.e2eToneFrequencies = [];
  window.e2eAudioStates = [];
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true });
}
