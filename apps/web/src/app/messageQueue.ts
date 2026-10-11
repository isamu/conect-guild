import type { GuildEvent } from '../domain/events';
import type { MessageEntry } from '../domain/message';
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
}

/**
 * The message window's queue. Each message shows once: the head stays `holdMs` and then gives way
 * to the next one; the last one stays until the next push or `next()`. Every change is handed to
 * `publish` as a new array.
 */
export function createMessageQueue(
  scheduler: Scheduler,
  holdMs: number,
  publish: (messages: readonly GuildMessage[]) => void,
): MessageQueue {
  let messages: readonly GuildMessage[] = [];
  let cancelHold: Cancel | null = null;
  let nextId = 1;

  function set(next: readonly GuildMessage[]): void {
    messages = next;
    publish(messages);
  }

  function dispose(): void {
    cancelHold?.();
    cancelHold = null;
  }

  function scheduleHold(): void {
    if (cancelHold !== null || messages.length < 2) return;
    cancelHold = scheduler.after(holdMs, () => {
      cancelHold = null;
      next();
    });
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
  };
}
