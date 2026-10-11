import type { Snapshot } from '@conect-guild/snapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import { GAP_NOTICE_MESSAGE } from '../domain/events';
import { issue, mergedPr, minutesAfter, pr, snapshot, T0 } from '../domain/fixtures.test-util';
import { createGuildStore, MESSAGE_HOLD_MS, REFRESH_INTERVAL_MS } from './guildStore';
import { sceneCue, type SceneCue } from './guildView';

/** Events reach the canvas on their messages (render/ starts a scene per cue). */

function memoryStorage(): StorageLike {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

const brokenStorage: StorageLike = {
  getItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
  removeItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
};

const first = snapshot({
  fetchedAt: T0,
  issues: [issue(101, { labels: ['経理'] }), issue(102, { labels: ['広報'] })],
  prs: [pr(110, { linkedIssues: [102] })],
});

/** One minute later: #101 closed, #103 opened (企画), PR #110 merged. */
const busy = snapshot({
  fetchedAt: minutesAfter(T0, 1),
  issues: [
    issue(101, { labels: ['経理'], state: 'closed', closedAt: minutesAfter(T0, 0.5) }),
    issue(102, { labels: ['広報'] }),
    issue(103, { labels: ['企画'] }),
  ],
  prs: [mergedPr(110, minutesAfter(T0, 0.5), { linkedIssues: [102] })],
});

const ok = (snap: Snapshot): SnapshotLoadResult => ({ ok: true, snapshot: snap });

function setup(results: SnapshotLoadResult[], storage: StorageLike = memoryStorage()) {
  const store = createGuildStore({
    loadSnapshot: () =>
      Promise.resolve(results.shift() ?? ({ ok: false, reason: 'network' } as const)),
    storage: createKeyValueStore(() => storage),
  });
  return store;
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createGuildStore: events for the canvas', () => {
  it('puts no event on the first load', async () => {
    const store = setup([ok(first)]);
    store.start();
    await settle();
    expect(store.state.messages).toEqual([]);
    store.stop();
  });

  it('carries each new event on its message, in the diff order', async () => {
    const store = setup([ok(first), ok(busy)]);
    store.start();
    await settle();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(store.state.messages.map((m) => m.event?.id)).toEqual([
      'issue-opened#103',
      'pr-merged#110',
      'issue-closed#101',
    ]);
    expect(store.state.messages.map((m) => m.event?.department)).toEqual(['企画', '広報', '経理']);
    store.stop();
  });

  it('cues each scene once, when its message reaches the window, 8 seconds apart', async () => {
    const store = setup([ok(first), ok(busy)]);
    const cues: SceneCue[] = [];
    const record = () => {
      const cue = sceneCue(store.state.messages[0] ?? null);
      if (cue !== null && cues.at(-1)?.id !== cue.id) cues.push(cue);
    };
    store.start();
    await settle();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    record();
    expect(cues.map((c) => c.event.kind)).toEqual(['issue-opened']);
    await vi.advanceTimersByTimeAsync(MESSAGE_HOLD_MS - 1);
    record();
    expect(cues).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    record();
    await vi.advanceTimersByTimeAsync(MESSAGE_HOLD_MS);
    record();
    // The last message stays, and so does its cue: no second start.
    await vi.advanceTimersByTimeAsync(MESSAGE_HOLD_MS * 3);
    record();
    expect(cues.map((c) => c.event.id)).toEqual([
      'issue-opened#103',
      'pr-merged#110',
      'issue-closed#101',
    ]);
    store.stop();
  });
});

describe('createGuildStore: halted screen', () => {
  const later = snapshot({ ...busy, fetchedAt: minutesAfter(T0, 2) });
  const halt = { ok: false, reason: 'schema-version' } as const;
  const heads = (store: ReturnType<typeof setup>) => store.state.messages[0]?.event?.id;

  it('holds the messages and their scenes while halted, and goes on once it is back', async () => {
    const store = setup([ok(first), ok(busy), halt, ok(later)]);
    store.start();
    await settle();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(heads(store)).toBe('issue-opened#103');
    await store.refresh();
    expect(store.state.halted).toBe(true);
    await vi.advanceTimersByTimeAsync(MESSAGE_HOLD_MS * 3);
    expect(heads(store)).toBe('issue-opened#103');
    expect(store.state.messages).toHaveLength(3);
    await store.refresh();
    expect(store.state.halted).toBe(false);
    await vi.advanceTimersByTimeAsync(MESSAGE_HOLD_MS);
    expect(heads(store)).toBe('pr-merged#110');
    store.stop();
  });

  it('keeps holding when a later fetch fails for another reason', async () => {
    const store = setup([ok(first), ok(busy), halt, { ok: false, reason: 'network' }]);
    store.start();
    await settle();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    await store.refresh();
    await store.refresh();
    expect(store.state.halted).toBe(true);
    await vi.advanceTimersByTimeAsync(MESSAGE_HOLD_MS * 3);
    expect(heads(store)).toBe('issue-opened#103');
    store.stop();
  });
});

describe('createGuildStore: no repeated or missing events', () => {
  it('does not send the same events again on the next fetches', async () => {
    const again = { ...busy, fetchedAt: minutesAfter(T0, 2) };
    const store = setup([ok(first), ok(busy), ok(again), ok(again)]);
    store.start();
    await settle();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    const ids = store.state.messages.map((m) => m.id);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2);
    // Only the hold timer moved the queue; nothing new was added.
    expect(store.state.messages.map((m) => m.id)).toEqual(ids.slice(-1));
    store.stop();
  });

  it('puts no event on the gap notice', async () => {
    const late = { ...busy, fetchedAt: minutesAfter(T0, 8 * 24 * 60) };
    const store = setup([ok(first), ok(late)]);
    store.start();
    await settle();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(store.state.messages).toHaveLength(1);
    expect(store.state.messages[0]).toMatchObject({ text: GAP_NOTICE_MESSAGE, event: null });
    store.stop();
  });

  it('sends no events without a working localStorage', async () => {
    const store = setup([ok(first), ok(busy)], brokenStorage);
    store.start();
    await settle();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(store.state.snapshot).toEqual(busy);
    expect(store.state.messages).toEqual([]);
    store.stop();
  });
});
