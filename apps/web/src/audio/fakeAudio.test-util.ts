import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  GainLike,
  OscillatorLike,
} from './player';

/** What one fake oscillator was told to play. */
export interface PlayedTone {
  type: OscillatorType;
  frequency: number | null;
  start: number | null;
  stop: number | null;
  gain: number | null;
  /** The gain ramp at the end of the note. */
  fadeTo: { value: number; time: number } | null;
  /** Wired oscillator → gain → destination. */
  connected: boolean;
}

class FakeParam implements AudioParamLike {
  value: number | null = null;
  rampTo: { value: number; time: number } | null = null;

  setValueAtTime(value: number): void {
    this.value = value;
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.rampTo = { value, time };
  }
}

class FakeNode implements AudioNodeLike {
  target: AudioNodeLike | null = null;

  connect(destination: AudioNodeLike): void {
    this.target = destination;
  }
}

class FakeGain extends FakeNode implements GainLike {
  readonly gain = new FakeParam();
}

class FakeOscillator extends FakeNode implements OscillatorLike {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
  startAt: number | null = null;
  stopAt: number | null = null;

  start(when: number): void {
    this.startAt = when;
  }

  stop(when: number): void {
    this.stopAt = when;
  }
}

/** A Web Audio context that records the oscillators it made instead of making sound. */
export class FakeAudioContext implements AudioContextLike {
  currentTime = 10;
  state: AudioContextState = 'suspended';
  readonly destination = new FakeNode();
  /** resume() rejects while this is set (the browser refuses without a user gesture). */
  refuseResume = false;
  resumeCalls = 0;
  private readonly oscillators: FakeOscillator[] = [];
  private readonly gains: FakeGain[] = [];

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.refuseResume) return Promise.reject(new Error('NotAllowedError'));
    this.state = 'running';
    return Promise.resolve();
  }

  played(): PlayedTone[] {
    // The player makes one oscillator and one gain per tone, in the same order.
    return this.oscillators.map((oscillator, i) => {
      const gain = this.gains[i];
      return {
        type: oscillator.type,
        frequency: oscillator.frequency.value,
        start: oscillator.startAt,
        stop: oscillator.stopAt,
        gain: gain?.gain.value ?? null,
        fadeTo: gain?.gain.rampTo ?? null,
        connected:
          gain !== undefined && oscillator.target === gain && gain.target === this.destination,
      };
    });
  }
}
