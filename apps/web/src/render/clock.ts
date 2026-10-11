/**
 * The stage's own clock: wall time with the paused stretches taken out, so a scene that was playing
 * when the page was hidden carries on from where it was when the page is shown again. Pure data:
 * the wall time is passed in. Scenes and ambient moves both run on it.
 */
export interface StageClock {
  /** Wall time when the current pause began; null while running. */
  readonly pausedAt: number | null;
  /** Wall time spent in pauses that are over. */
  readonly pausedMs: number;
}

export const RUNNING_CLOCK: StageClock = { pausedAt: null, pausedMs: 0 };

/** Stage time at `wallNow` (it stands still while paused). */
export function stageTime(clock: StageClock, wallNow: number): number {
  return (clock.pausedAt ?? wallNow) - clock.pausedMs;
}

/** Starts or ends a pause at `wallNow`; repeating the current state changes nothing. */
export function withPaused(clock: StageClock, paused: boolean, wallNow: number): StageClock {
  if (paused && clock.pausedAt === null) return { pausedAt: wallNow, pausedMs: clock.pausedMs };
  if (!paused && clock.pausedAt !== null) {
    return { pausedAt: null, pausedMs: clock.pausedMs + (wallNow - clock.pausedAt) };
  }
  return clock;
}
