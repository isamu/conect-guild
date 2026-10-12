declare global {
  interface Window {
    /** Oscillators started on the fake AudioContext (set by installFakeAudio). */
    e2eStartedTones?: number;
  }
}

/**
 * Runs in the page before the app (page.addInitScript): replaces AudioContext with a silent fake
 * that counts the tones started, so the tests hear nothing and need no audio device.
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
      return {
        type: 'square',
        frequency: param,
        connect: () => undefined,
        start: () => {
          window.e2eStartedTones = (window.e2eStartedTones ?? 0) + 1;
        },
        stop: () => undefined,
      };
    }
  }
  window.e2eStartedTones = 0;
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true });
}
