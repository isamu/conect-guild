import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import { RUNNING_CLOCK, stageTime, withPaused } from './clock';
import { EMPTY_DIRECTOR, isAnimating, poseAt, scheduleEvent, trackEnd } from './director';
import { DEFAULT_SEATS } from './scenes';

const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

describe('stage clock', () => {
  it('follows the wall clock while running', () => {
    expect(stageTime(RUNNING_CLOCK, 1_234)).toBe(1_234);
  });

  it('stands still while paused and goes on from there after the pause', () => {
    const paused = withPaused(RUNNING_CLOCK, true, 1_000);
    expect(stageTime(paused, 1_000)).toBe(1_000);
    expect(stageTime(paused, 61_000)).toBe(1_000);
    const running = withPaused(paused, false, 61_000);
    expect(stageTime(running, 61_000)).toBe(1_000);
    expect(stageTime(running, 61_500)).toBe(1_500);
  });

  it('adds up several pauses', () => {
    let clock = withPaused(RUNNING_CLOCK, true, 100);
    clock = withPaused(clock, false, 300);
    clock = withPaused(clock, true, 400);
    clock = withPaused(clock, false, 1_400);
    expect(stageTime(clock, 2_000)).toBe(2_000 - 200 - 1_000);
  });

  it('ignores a repeated pause or resume', () => {
    const paused = withPaused(RUNNING_CLOCK, true, 100);
    expect(withPaused(paused, true, 5_000)).toEqual(paused);
    expect(withPaused(RUNNING_CLOCK, false, 5_000)).toEqual(RUNNING_CLOCK);
  });
});

describe('stage clock: a scene across a hidden page', () => {
  const event: GuildEvent = { id: 'pr-merged#1', kind: 'pr-merged', number: 1, department: '経理' };

  it('plays on from where it was hidden instead of being over when shown again', () => {
    const director = scheduleEvent(
      EMPTY_DIRECTOR,
      event,
      stageTime(RUNNING_CLOCK, 10_000),
      context,
    );
    const end = Math.max(...director.tracks.map(trackEnd));
    // Hidden 3 s into the scene, for longer than the whole scene, then shown again.
    const hiddenAt = 13_000;
    const atHide = poseAt(
      director,
      'minori',
      stageTime(RUNNING_CLOCK, hiddenAt),
      DEFAULT_SEATS.minori,
    );
    const hidden = withPaused(RUNNING_CLOCK, true, hiddenAt);
    const shownAt = hiddenAt + 10 * (end - 10_000);
    const shown = withPaused(hidden, false, shownAt);
    const t = stageTime(shown, shownAt);
    expect(isAnimating(director, t)).toBe(true);
    expect(poseAt(director, 'minori', t, DEFAULT_SEATS.minori)).toEqual(atHide);
    // …and finishes as long after being shown as it had left when hidden.
    expect(isAnimating(director, stageTime(shown, shownAt + end - hiddenAt - 1))).toBe(true);
    expect(isAnimating(director, stageTime(shown, shownAt + end - hiddenAt))).toBe(false);
  });
});
