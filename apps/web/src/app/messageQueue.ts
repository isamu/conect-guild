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
  /**
   * The ▼ button: skips the rest of the head's hold. The next message still waits until its scene
   * can start (the press is kept until then); without one, the head goes away at once.
   */
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
  /**
   * Whether the canvas is on screen (narrow screens hide it). While it is not, no scenes are kept
   * and nobody waits for them: messages go on every `holdMs`, as the canvas drops those scenes too.
   */
  setStageShown(shown: boolean): void;
}

export interface MessageQueueOptions {
  readonly scheduler: Scheduler;
  /** Wall time in ms. */
  readonly now: () => number;
  /** How long a message stays at least before the next one replaces it. */
  readonly holdMs: number;
  /** How long the last message stays before it closes by itself (the window goes back to the narration). */
  readonly lastHoldMs: number;
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
 * Decides when the next message shows: it keeps the head's hold and the scenes the canvas plays (as
 * the queue sees them), on a clock that stops with the canvas's while the page is hidden.
 */
interface Pacer {
  /** `head` reached the window: its hold starts now, and so does its scene on the canvas. */
  headShown(head: GuildMessage): void;
  /**
   * Ms until `next` may show (nextShowAt), or until the head closes when it is the last one; null
   * while stopped (hidden page or halted screen).
   */
  delayFor(next: GuildMessage | undefined): number | null;
  /** The ▼ button: ends the head's hold. True when `next` (if any) may show at once. */
  skipHold(next: GuildMessage | undefined): boolean;
  setHidden(hidden: boolean): void;
  /** While halted the window is hidden: the head gets its full hold again once it is back. */
  setHalted(halted: boolean): void;
  setStageShown(shown: boolean): void;
}

function createPacer(
  wallNow: () => number,
  holds: Pick<MessageQueueOptions, 'holdMs' | 'lastHoldMs'>,
): Pacer {
  const { holdMs, lastHoldMs } = holds;
  let clock: StageClock = RUNNING_CLOCK;
  let director: Director = EMPTY_DIRECTOR;
  let stageShown = true;
  let halted = false;
  /** Queue time when the head's hold began (when it showed); null after a halt (starts over). */
  let holdStart: number | null = null;
  const now = () => stageTime(clock, wallNow());
  return {
    headShown(head) {
      holdStart = now();
      if (stageShown) director = withHeadScene(director, head, now());
    },
    delayFor(next) {
      if (halted || clock.pausedAt !== null) return null;
      const t = now();
      holdStart ??= t;
      if (next === undefined) return Math.max(holdStart + lastHoldMs - t, 0);
      return Math.max(nextShowAt(director, holdStart + holdMs, next) - t, 0);
    },
    skipHold(next) {
      if (next === undefined) return true;
      const t = now();
      holdStart = t - holdMs;
      return nextShowAt(director, t, next) <= t;
    },
    setHidden(hidden) {
      clock = withPaused(clock, hidden, wallNow());
    },
    setHalted(next) {
      halted = next;
      if (halted) holdStart = null;
    },
    setStageShown(shown) {
      stageShown = shown;
      // The canvas drops its scenes when it goes out of sight; old ones never play later.
      if (!shown) director = EMPTY_DIRECTOR;
    },
  };
}

/**
 * The message window's queue. Each message shows once: the head stays at least `holdMs`, and the
 * next one waits until its scene can start (nextShowAt); the last one closes after `lastHoldMs`
 * (or on `next()`), unless another one is pushed meanwhile. Every change is handed to `publish` as a new array.
 */
export function createMessageQueue(options: MessageQueueOptions): MessageQueue {
  const { scheduler, publish } = options;
  const pacer = createPacer(options.now, options);
  let messages: readonly GuildMessage[] = [];
  let cancelHold: Cancel | null = null;
  let nextId = 1;

  function set(next: readonly GuildMessage[]): void {
    const head = next[0];
    if (head !== undefined && head.id !== messages[0]?.id) pacer.headShown(head);
    messages = next;
    publish(messages);
  }

  function dispose(): void {
    cancelHold?.();
    cancelHold = null;
  }

  function scheduleHold(): void {
    if (cancelHold !== null || messages.length === 0) return;
    const delay = pacer.delayFor(messages[1]);
    // advance() clears the handle (cancelling a timer that has fired does nothing).
    if (delay !== null) cancelHold = scheduler.after(delay, advance);
  }

  function advance(): void {
    dispose();
    set(messages.slice(1));
    scheduleHold();
  }

  /** Re-plans the pending hold after what it waits for has changed. */
  function reschedule(): void {
    dispose();
    scheduleHold();
  }

  return {
    push(entries) {
      if (entries.length === 0) return;
      set([...messages, ...entries.map((entry) => ({ id: nextId++, ...entry }))]);
      // The last one's closing gives way to the hold before the new ones.
      reschedule();
    },
    next() {
      if (pacer.skipHold(messages[1])) advance();
      else reschedule();
    },
    dispose,
    pause() {
      pacer.setHalted(true);
      dispose();
    },
    resume() {
      pacer.setHalted(false);
      scheduleHold();
    },
    setHidden(hidden) {
      pacer.setHidden(hidden);
      reschedule();
    },
    setStageShown(shown) {
      pacer.setStageShown(shown);
      reschedule();
    },
  };
}
