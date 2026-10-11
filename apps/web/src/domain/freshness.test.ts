import { describe, expect, it } from 'vitest';
import { T0, at } from './fixtures.test-util';
import { isSnapshotStale } from './freshness';

describe('isSnapshotStale', () => {
  it('is fresh up to 5 minutes and stale after', () => {
    expect(isSnapshotStale(T0, at(T0))).toBe(false);
    expect(isSnapshotStale(T0, at(T0) + 5 * 60_000)).toBe(false);
    expect(isSnapshotStale(T0, at(T0) + 5 * 60_000 + 1)).toBe(true);
  });

  it('treats a fetchedAt in the future as fresh', () => {
    expect(isSnapshotStale(T0, at(T0) - 60_000)).toBe(false);
  });

  it('honours a custom threshold', () => {
    expect(isSnapshotStale(T0, at(T0) + 2_000, 1_000)).toBe(true);
  });
});
