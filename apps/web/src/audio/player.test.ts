import { describe, expect, it } from 'vitest';
import { FakeAudioContext } from './fakeAudio.test-util';
import { createTonePlayer } from './player';
import { midiToFrequency, SCORES } from './scores';

function setup() {
  const context = new FakeAudioContext();
  let created = 0;
  const player = createTonePlayer(() => {
    created += 1;
    return context;
  });
  return { context, player, created: () => created };
}

describe('createTonePlayer', () => {
  it('makes no context and plays nothing before the first unlock', () => {
    const { player, created } = setup();
    expect(player.play(SCORES.scroll, 0.1)).toBe(false);
    expect(created()).toBe(0);
  });

  it('creates the context once, on unlock, and resumes it', async () => {
    const { context, player, created } = setup();
    await player.unlock();
    await player.unlock();
    expect(created()).toBe(1);
    expect(context.resumeCalls).toBe(2);
    expect(context.state).toBe('running');
  });

  it('schedules each note of the score as an oscillator from the current time', async () => {
    const { context, player } = setup();
    await player.unlock();
    expect(player.play(SCORES.scroll, 0.1)).toBe(true);
    const played = context.played();
    expect(played.map((tone) => tone.frequency)).toEqual([83, 88, 95].map(midiToFrequency));
    expect(played.every((tone) => tone.type === 'square' && tone.connected)).toBe(true);
    expect(played[0]?.start).toBeCloseTo(10.01);
    expect(played[0]?.gain).toBeCloseTo(0.1 * SCORES.scroll.gain);
    // Each note fades to silence by its stop, and the next starts where it stops.
    expect(played[0]?.fadeTo).toEqual({ value: 0, time: played[0]?.stop });
    expect(played[1]?.start).toBe(played[0]?.stop);
  });

  it('stays silent and queues nothing while the context is suspended', async () => {
    const { context, player } = setup();
    context.refuseResume = true;
    await expect(player.unlock()).resolves.toBeUndefined();
    expect(player.play(SCORES.chest, 0.1)).toBe(false);
    expect(context.played()).toEqual([]);
  });

  it('plays after a later unlock succeeds', async () => {
    const { context, player } = setup();
    context.refuseResume = true;
    await player.unlock();
    context.refuseResume = false;
    await player.unlock();
    expect(player.play(SCORES.permission, 0.1)).toBe(true);
    expect(context.played().map((tone) => tone.type)).toEqual(['triangle', 'triangle']);
  });

  it('does nothing without Web Audio (no context can be made)', async () => {
    const player = createTonePlayer(() => null);
    await expect(player.unlock()).resolves.toBeUndefined();
    expect(player.play(SCORES.clear, 0.1)).toBe(false);
  });
});
