import type { Cancel, Scheduler } from './scheduler';

/** How often the narration changes while no event is told (Issue #30). */
export const NARRATION_INTERVAL_MS = 20_000;

export interface Narration {
  /** Unique within the narrator's lifetime (the Vue key, so a new line types in again). */
  readonly id: number;
  readonly text: string;
}

export interface NarratorOptions {
  readonly scheduler: Scheduler;
  readonly intervalMs: number;
  /** The next line after `previous` (app/narration.ts pickNarration); null when nothing to tell. */
  readonly compose: (previous: string | null) => string | null;
  readonly publish: (narration: Narration | null) => void;
}

export interface Narrator {
  /** Tells a new line now and every interval from now on. */
  next(): void;
  /** Tells a line now if none is shown (e.g. the first snapshot came); else does nothing. */
  wake(): void;
  stop(): void;
}

/**
 * The narration's timer: a new line every `intervalMs`, or at once on next() (the ▼ button, or the
 * window coming back from the event messages). The lines themselves come from `compose`.
 */
export function createNarrator(options: NarratorOptions): Narrator {
  const { scheduler, intervalMs, compose, publish } = options;
  let current: Narration | null = null;
  let nextId = 1;
  let cancel: Cancel | null = null;

  function tell(): void {
    const text = compose(current?.text ?? null);
    current = text === null ? null : { id: nextId++, text };
    publish(current);
  }

  function next(): void {
    cancel?.();
    tell();
    cancel = scheduler.every(intervalMs, tell);
  }

  return {
    next,
    wake() {
      if (current === null) next();
    },
    stop() {
      cancel?.();
      cancel = null;
    },
  };
}
