import type { Snapshot } from '@conect-guild/snapshot';
import { shallowReactive } from 'vue';
import { z } from 'zod';
import {
  loadSnapshot,
  type SnapshotLoadFailure,
  type SnapshotLoadResult,
} from '../adapters/snapshot';
import { createKeyValueStore, type KeyValueStore } from '../adapters/storage';
import { parseBaseline } from '../domain/baseline';
import { diffSnapshot } from '../domain/events';
import { diffEntries, type MessageEntry } from '../domain/message';
import { createMessageQueue, type GuildMessage, type MessageQueue } from './messageQueue';
import { globalScheduler, type Cancel, type Scheduler } from './scheduler';

export type { GuildMessage } from './messageQueue';

/** localStorage key of the diff baseline (numbers, states and times only). */
export const BASELINE_STORAGE_KEY = 'conect-guild:baseline';
/**
 * The collector rewrites the snapshot every 5 seconds (the session states; GitHub every 60).
 * The fetch is local and no-store, so following it closely is cheap.
 */
export const REFRESH_INTERVAL_MS = 5_000;
/**
 * How long a message stays at least before the next queued one replaces it; longer when the next
 * one's scene has to wait for its cast (app/messageQueue.ts). The last one stays.
 */
export const MESSAGE_HOLD_MS = 8_000;

export interface GuildState {
  /** The last successfully loaded snapshot; kept when later fetches fail. */
  snapshot: Snapshot | null;
  /** Failure of the latest fetch; null after a success. */
  failure: SnapshotLoadFailure | null;
  /** True after a schema-version failure: the screen stops and asks to update the collector. */
  halted: boolean;
  /** False when localStorage cannot be read or written: the screen goes on without events. */
  effectsAvailable: boolean;
  /** Epoch ms of the latest finished fetch (success or failure). */
  checkedAt: number | null;
  /**
   * Message window queue; the head is on screen. Each new event of a fetch arrives here once, on
   * its message, and its scene plays when that message reaches the head.
   */
  messages: readonly GuildMessage[];
  /** Result of the last "基準を消す". */
  baselineNotice: string | null;
}

export interface GuildStoreOptions {
  readonly loadSnapshot?: () => Promise<SnapshotLoadResult>;
  readonly storage?: KeyValueStore;
  readonly now?: () => number;
  readonly scheduler?: Scheduler;
  readonly refreshIntervalMs?: number;
  readonly messageHoldMs?: number;
}

export interface GuildStore {
  readonly state: Readonly<GuildState>;
  /** Loads once now, then every refresh interval. */
  start(): void;
  /** Stops all timers; results of a fetch still in flight are dropped. */
  stop(): void;
  /** Fetches once. Skipped while another fetch is in flight. */
  refresh(): Promise<void>;
  /** Removes the head message (the ▼ button). */
  nextMessage(): void;
  /** Stops the messages (and the scenes they start) while the page is hidden. */
  setHidden(hidden: boolean): void;
  /** Removes the stored baseline; the next fetch counts as the first one (no events). */
  clearBaseline(): void;
}

interface SyncOutcome {
  readonly effectsAvailable: boolean;
  readonly entries: readonly MessageEntry[];
}

/**
 * Diffs against the stored baseline and stores the new one (docs/DESIGN.md 4.4).
 * Without a working localStorage there are no events, so nothing is replayed on every fetch.
 */
function syncBaseline(storage: KeyValueStore, snapshot: Snapshot): SyncOutcome {
  const stored = storage.read(BASELINE_STORAGE_KEY, z.unknown());
  if (!stored.ok && stored.reason === 'unavailable')
    return { effectsAvailable: false, entries: [] };
  const diff = diffSnapshot(stored.ok ? parseBaseline(stored.value) : null, snapshot);
  if (diff.baselineUpdate.action === 'replace') {
    const written = storage.write(BASELINE_STORAGE_KEY, diff.baselineUpdate.baseline);
    if (!written.ok) return { effectsAvailable: false, entries: [] };
  }
  return { effectsAvailable: true, entries: diffEntries(diff, snapshot) };
}

function initialState(): GuildState {
  return {
    snapshot: null,
    failure: null,
    halted: false,
    effectsAvailable: true,
    checkedAt: null,
    messages: [],
    baselineNotice: null,
  };
}

/** Applies one fetch result. Returns the messages (with their events) to queue. */
function applyResult(
  state: GuildState,
  storage: KeyValueStore,
  result: SnapshotLoadResult,
): readonly MessageEntry[] {
  if (!result.ok) {
    state.failure = result.reason;
    // Once halted, only a snapshot of the expected version resumes the screen.
    state.halted = state.halted || result.reason === 'schema-version';
    return [];
  }
  state.snapshot = result.snapshot;
  state.failure = null;
  state.halted = false;
  const outcome = syncBaseline(storage, result.snapshot);
  state.effectsAvailable = outcome.effectsAvailable;
  return outcome.entries;
}

/** The message queue that publishes into `state.messages`. */
function queueInto(
  state: GuildState,
  options: { scheduler: Scheduler; now: () => number; holdMs: number | undefined },
): MessageQueue {
  return createMessageQueue({
    scheduler: options.scheduler,
    now: options.now,
    holdMs: options.holdMs ?? MESSAGE_HOLD_MS,
    publish: (list) => {
      state.messages = list;
    },
  });
}

export function createGuildStore(options: GuildStoreOptions = {}): GuildStore {
  const load = options.loadSnapshot ?? (() => loadSnapshot());
  const storage = options.storage ?? createKeyValueStore();
  const now = options.now ?? Date.now;
  const scheduler = options.scheduler ?? globalScheduler;
  const state = shallowReactive<GuildState>(initialState());
  const queue = queueInto(state, { scheduler, now, holdMs: options.messageHoldMs });
  let cancelRefresh: Cancel | null = null;
  let inFlight = false;
  // Bumped by stop(), so a fetch that started before it cannot touch the state.
  let generation = 0;

  async function refresh(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    const started = generation;
    try {
      const result = await load();
      if (started !== generation) return;
      state.checkedAt = now();
      const entries = applyResult(state, storage, result);
      // While halted the window is hidden: hold the messages (and their scenes) until it is back.
      if (state.halted) queue.pause();
      else queue.resume();
      queue.push(entries);
    } finally {
      inFlight = false;
    }
  }

  return {
    state,
    start() {
      if (cancelRefresh !== null) return;
      cancelRefresh = scheduler.every(options.refreshIntervalMs ?? REFRESH_INTERVAL_MS, () => {
        void refresh();
      });
      void refresh();
    },
    stop() {
      generation += 1;
      cancelRefresh?.();
      cancelRefresh = null;
      queue.dispose();
    },
    refresh,
    nextMessage() {
      queue.next();
    },
    setHidden(hidden) {
      queue.setHidden(hidden);
    },
    clearBaseline() {
      const removed = storage.remove(BASELINE_STORAGE_KEY);
      state.baselineNotice = removed.ok
        ? '基準を消しました'
        : '基準を消せませんでした（localStorage が使えません）';
    },
  };
}
