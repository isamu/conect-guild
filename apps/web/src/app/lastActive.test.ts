import { describe, expect, it } from 'vitest';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import {
  createLastActiveTracker,
  idleSinceOf,
  LAST_ACTIVE_STORAGE_KEY,
  markActive,
  needsWrite,
  observeParty,
  type PartyStateRow,
} from './lastActive';

class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failWith: Error | null = null;
  writes = 0;

  getItem(key: string): string | null {
    if (this.failWith !== null) throw this.failWith;
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWith !== null) throw this.failWith;
    this.writes += 1;
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const rows = (entries: Record<string, PartyStateRow['state']>): PartyStateRow[] =>
  Object.entries(entries).flatMap(([id, state]) =>
    id === 'minori' || id === 'hibiki' || id === 'kaname' || id === 'yukihiro'
      ? [{ id, state }]
      : [],
  );

describe('observeParty', () => {
  it('marks members with work active now and keeps the idle ones', () => {
    const last = { minori: 100, hibiki: 100, kaname: 100, yukihiro: 100 };
    const next = observeParty(
      last,
      rows({ minori: 'working', hibiki: 'busy', kaname: 'idle', yukihiro: 'done' }),
      500,
    );
    expect(next).toEqual({ minori: 500, hibiki: 500, kaname: 100, yukihiro: 100 });
  });

  it('counts every waiting state as work', () => {
    for (const state of ['awaiting-permission', 'awaiting-president', 'awaiting-kaname'] as const) {
      expect(observeParty({ minori: 1 }, rows({ minori: state }), 9).minori).toBe(9);
    }
  });

  it('starts counting now for a member seen idle the first time', () => {
    expect(observeParty({}, rows({ minori: 'idle' }), 42)).toEqual({ minori: 42 });
  });

  it('treats a time in the future as now (the clock moved back)', () => {
    expect(observeParty({ minori: 1_000 }, rows({ minori: 'idle' }), 10)).toEqual({ minori: 10 });
  });

  it('keeps the members not in the rows', () => {
    expect(observeParty({ sasae: 7 }, [], 10)).toEqual({ sasae: 7 });
  });
});

describe('markActive', () => {
  it('moves the times on, never back', () => {
    expect(markActive({ minori: 100, hibiki: 900 }, ['minori', 'hibiki', 'kaname'], 500)).toEqual({
      minori: 500,
      hibiki: 900,
      kaname: 500,
    });
  });
});

describe('idleSinceOf', () => {
  it('lists only the members with nothing to do', () => {
    const last = { minori: 1, hibiki: 2, kaname: 3 };
    expect(idleSinceOf(last, rows({ minori: 'idle', hibiki: 'working', kaname: 'done' }))).toEqual({
      minori: 1,
      kaname: 3,
    });
  });

  it('leaves out an idle member with no time', () => {
    expect(idleSinceOf({}, rows({ minori: 'idle' }))).toEqual({});
  });
});

describe('needsWrite', () => {
  it('writes for a new member or a time moved on by the step', () => {
    expect(needsWrite({}, { minori: 1 })).toBe(true);
    expect(needsWrite({ minori: 0 }, { minori: 9_999 })).toBe(false);
    expect(needsWrite({ minori: 0 }, { minori: 10_000 })).toBe(true);
    expect(needsWrite({ minori: 0 }, {})).toBe(false);
  });
});

describe('createLastActiveTracker', () => {
  function setup(stored?: string) {
    const storage = new FakeStorage();
    if (stored !== undefined) storage.items.set(LAST_ACTIVE_STORAGE_KEY, stored);
    return { storage, tracker: createLastActiveTracker(createKeyValueStore(() => storage)) };
  }

  it('goes on from the stored times after a reload', () => {
    const { tracker } = setup(JSON.stringify({ minori: 1_000 }));
    expect(tracker.observe(rows({ minori: 'idle' }), 5_000_000)).toEqual({ minori: 1_000 });
  });

  it('stores member ids and epoch ms only', () => {
    const { storage, tracker } = setup();
    tracker.observe(rows({ minori: 'idle', hibiki: 'working' }), 5_000);
    expect(JSON.parse(storage.items.get(LAST_ACTIVE_STORAGE_KEY) ?? 'null')).toEqual({
      minori: 5_000,
      hibiki: 5_000,
    });
  });

  it('ignores a stored value of the wrong shape and starts over', () => {
    for (const bad of ['{"minori":"x"}', '{"nobody":1}', '[1]', 'not json', '{"minori":-1}']) {
      const { tracker } = setup(bad);
      expect(tracker.observe(rows({ minori: 'idle' }), 7_000)).toEqual({ minori: 7_000 });
    }
  });

  it('writes only when a time moved on by the step', () => {
    const { storage, tracker } = setup();
    tracker.observe(rows({ minori: 'working' }), 0);
    tracker.observe(rows({ minori: 'working' }), 5_000);
    expect(storage.writes).toBe(1);
    tracker.observe(rows({ minori: 'working' }), 10_000);
    expect(storage.writes).toBe(2);
  });

  it('marks scene members active and answers for the rows last seen', () => {
    const { tracker } = setup();
    tracker.observe(rows({ kaname: 'idle', minori: 'working' }), 100);
    expect(tracker.markActive(['kaname'], 900)).toEqual({ kaname: 900 });
  });

  it('goes on without localStorage and never throws', () => {
    const { storage, tracker } = setup();
    storage.failWith = new Error('blocked');
    expect(tracker.observe(rows({ minori: 'idle' }), 50)).toEqual({ minori: 50 });
    expect(tracker.markActive(['minori'], 60_000)).toEqual({ minori: 60_000 });
    expect(storage.writes).toBe(0);
  });

  it('tries again after a failed write', () => {
    const { storage, tracker } = setup();
    storage.failWith = new Error('quota');
    tracker.observe(rows({ minori: 'idle' }), 50);
    storage.failWith = null;
    tracker.observe(rows({ minori: 'idle' }), 60);
    expect(storage.items.get(LAST_ACTIVE_STORAGE_KEY)).toBe('{"minori":50}');
  });
});
