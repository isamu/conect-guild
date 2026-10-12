import type { Snapshot } from '@conect-guild/snapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotLoadResult } from '../adapters/snapshot';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import { minutesAfter, snapshot, T0 } from '../domain/fixtures.test-util';
import { BASELINE_STORAGE_KEY, createGuildStore } from './guildStore';

/** Level-ups through the store (Issue #19): what the window gets after a halt or a version move. */

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

/** みのり with `clears` completed Issues (10 each: Lv 2 at 1, Lv 3 at 3), fetched `minutes` in. */
function minoriWith(clears: number, minutes: number): Snapshot {
  return snapshot({
    fetchedAt: minutesAfter(T0, minutes),
    history: {
      openedIssueCount: clears,
      completedIssues: Array.from({ length: clears }, (_, i) => ({
        number: i + 1,
        departments: ['経理'],
      })),
      mergedPrs: [],
    },
  });
}

const ok = (snap: Snapshot): SnapshotLoadResult => ({ ok: true, snapshot: snap });
const halt = { ok: false, reason: 'schema-version' } as const;

function setup(results: SnapshotLoadResult[], storage: StorageLike) {
  return createGuildStore({
    refreshIntervalMs: 60_000,
    loadSnapshot: () =>
      Promise.resolve(results.shift() ?? ({ ok: false, reason: 'network' } as const)),
    storage: createKeyValueStore(() => storage),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createGuildStore: level-ups', () => {
  it('says nothing on the first load, then tells a level-up', async () => {
    const store = setup([ok(minoriWith(1, 0)), ok(minoriWith(3, 1))], memoryStorage());
    await store.refresh();
    expect(store.state.messages).toEqual([]);
    await store.refresh();
    expect(store.state.messages.map((m) => m.text)).toEqual(['みのりは レベル 3 に あがった！']);
    expect(store.state.messages[0]?.event?.kind).toBe('level-up');
    store.stop();
  });

  it('tells a level-up reached while halted once the screen is back', async () => {
    const store = setup([ok(minoriWith(1, 0)), halt, ok(minoriWith(3, 2))], memoryStorage());
    await store.refresh();
    await store.refresh();
    expect(store.state.halted).toBe(true);
    expect(store.state.messages).toEqual([]);
    await store.refresh();
    expect(store.state.halted).toBe(false);
    expect(store.state.messages.map((m) => m.text)).toEqual(['みのりは レベル 3 に あがった！']);
    store.stop();
  });

  it('stays quiet after the update from a baseline of the version before the levels', async () => {
    const storage = memoryStorage();
    // What the screen of #19's second PR stored: version 2, no levels.
    storage.setItem(
      BASELINE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        fetchedAt: T0,
        repo: '00000000',
        issues: [],
        prs: [],
      }),
    );
    const store = setup([ok(minoriWith(9, 1)), ok(minoriWith(9, 2))], storage);
    await store.refresh();
    await store.refresh();
    expect(store.state.messages).toEqual([]);
    expect(storage.getItem(BASELINE_STORAGE_KEY)).toContain('"levels"');
    store.stop();
  });

  it('keeps only numbers in the stored levels', async () => {
    const storage = memoryStorage();
    const store = setup([ok(minoriWith(3, 0))], storage);
    await store.refresh();
    const stored = storage.getItem(BASELINE_STORAGE_KEY) ?? '';
    expect(stored).toContain('"levels":{"kaname":1,"minori":3,"hibiki":1,"hirame":1,"sasae":1}');
    expect(stored).not.toContain('経理');
    expect(stored).not.toContain('みのり');
    store.stop();
  });
});
