import type { GuildEvent } from '../domain/events';
import type { MessageEntry } from '../domain/message';
import { RUNNING_CLOCK, stageTime, withPaused, type StageClock } from '../render/clock';
import {
  castFreeAt,
  EMPTY_DIRECTOR,
  prune,
  scheduleEvent,
  type Director,
} from '../render/director';
import { DEFAULT_SEATS } from '../render/scenes';
import type { Cancel, Scheduler } from './scheduler';

export interface GuildMessage {
  /** Unique within the queue's lifetime (used as the Vue key). */
  readonly id: number;
  readonly text: string;
  /** The event this line reports; its scene starts when the line reaches the window. */
  readonly event: GuildEvent | null;
}

export interface MessageQueue {
  push(entries: readonly MessageEntry[]): void;
  /** Drops the head message (the ▼ button, or the hold timer). */
  next(): void;
  /** Cancels the hold timer. */
  dispose(): void;
  /** Holds the head message (no timer) until resume(), e.g. while the screen is halted. */
  pause(): void;
  resume(): void;
  /**
   * Stops the queue's clock while the page is hidden, as the canvas stops its own (render/loop.ts),
   * so the hold and the scenes go on together from where they were once it is shown again.
   */
  setHidden(hidden: boolean): void;
}

export interface MessageQueueOptions {
  readonly scheduler: Scheduler;
  /** Wall time in ms. */
  readonly now: () => number;
  /** How long a message stays at least before the next one replaces it. */
  readonly holdMs: number;
  readonly publish: (messages: readonly GuildMessage[]) => void;
}

/** Only the timing of the scenes matters here; the random numbers shape confetti, not its time. */
const PACING_CONTEXT = { seats: DEFAULT_SEATS, random: () => 0 };

/**
 * When the message after the head may take its place: once the head has stayed its hold (until
 * `holdEnd`), and once the cast of the next message's scene is free, so that scene starts the
 * moment its message shows (docs/DESIGN.md chapter 6 M2). `director` holds the scenes started so
 * far, on the queue's clock.
 */
export function nextShowAt(
  director: Director,
  holdEnd: number,
  next: Pick<GuildMessage, 'event'>,
): number {
  return next.event === null ? holdEnd : castFreeAt(director, next.event, holdEnd);
}

/** The scenes once `head` reaches the window at `t`: the canvas starts its scene then. */
function withHeadScene(director: Director, head: GuildMessage, t: number): Director {
  if (head.event === null) return director;
  return scheduleEvent(prune(director, t), head.event, t, PACING_CONTEXT);
}

/**
 * The message window's queue. Each message shows once: the head stays at least `holdMs`, and the
 * next one waits until its scene can start (nextShowAt); the last one stays until the next push or
 * `next()`. It plans the scenes the canvas will play (render/director.ts) on a clock that stops
 * while the page is hidden, like the canvas's. Every change is handed to `publish` as a new array.
 */
export function createMessageQueue(options: MessageQueueOptions): MessageQueue {
  const { scheduler, holdMs, publish } = options;
  let messages: readonly GuildMessage[] = [];
  let cancelHold: Cancel | null = null;
  let nextId = 1;
  let halted = false;
  let clock: StageClock = RUNNING_CLOCK;
  let director: Director = EMPTY_DIRECTOR;
  /** Queue time when the head's hold began; null until the head has a successor to wait for. */
  let holdStart: number | null = null;
  const queueNow = () => stageTime(clock, options.now());

  function set(next: readonly GuildMessage[]): void {
    const head = next[0];
    if (head !== undefined && head.id !== messages[0]?.id) {
      holdStart = null;
      director = withHeadScene(director, head, queueNow());
    }
    messages = next;
    publish(messages);
  }

  function dispose(): void {
    cancelHold?.();
    cancelHold = null;
  }

  function scheduleHold(): void {
    const following = messages[1];
    if (halted || clock.pausedAt !== null || cancelHold !== null || following === undefined) return;
    const t = queueNow();
    holdStart ??= t;
    const due = nextShowAt(director, holdStart + holdMs, following);
    // next() clears the handle (cancelling a timer that has fired does nothing).
    cancelHold = scheduler.after(Math.max(due - t, 0), next);
  }

  function next(): void {
    dispose();
    set(messages.slice(1));
    scheduleHold();
  }

  return {
    push(entries) {
      if (entries.length === 0) return;
      set([...messages, ...entries.map((entry) => ({ id: nextId++, ...entry }))]);
      scheduleHold();
    },
    next,
    dispose,
    pause() {
      halted = true;
      // The window is hidden while halted: the head gets its full hold again once it is back.
      holdStart = null;
      dispose();
    },
    resume() {
      halted = false;
      scheduleHold();
    },
    setHidden(hidden) {
      clock = withPaused(clock, hidden, options.now());
      dispose();
      scheduleHold();
    },
  };
}
