import { z } from 'zod';
import { createKeyValueStore, type KeyValueStore } from '../adapters/storage';
import type { MemberState } from '../domain/party';
import { memberIdSchema, type MemberId } from '@conect-guild/snapshot/settings';
import { isRestful, type IdleSince } from '../render/idle';
import { IDLE } from '../render/metrics';

/**
 * When each member last had something to do (Issue #23): a state other than idle / done, or a
 * scene. Kept in localStorage as `{memberId: epochMs}` only (no titles), so a reload does not wake
 * everybody up. Pure updates plus a small store that writes through the storage adapter.
 */

/** localStorage key of the last-active times. */
export const LAST_ACTIVE_STORAGE_KEY = 'conect-guild:last-active';

const lastActiveSchema = z.partialRecord(memberIdSchema, z.number().int().nonnegative());
export type LastActive = z.infer<typeof lastActiveSchema>;

export interface PartyStateRow {
  readonly id: MemberId;
  readonly state: MemberState;
}

/**
 * Members with work are active now; a member seen idle for the first time starts counting now.
 * A time in the future (the clock moved back) counts as now.
 */
export function observeParty(
  last: LastActive,
  rows: readonly PartyStateRow[],
  now: number,
): LastActive {
  const next: Partial<Record<MemberId, number>> = { ...last };
  for (const row of rows) {
    const seen = last[row.id];
    if (!isRestful(row.state) || seen === undefined || seen > now) next[row.id] = now;
  }
  return next;
}

/** Members in a scene at `at` are active then (never moves a time back). */
export function markActive(last: LastActive, ids: readonly MemberId[], at: number): LastActive {
  const next: Partial<Record<MemberId, number>> = { ...last };
  for (const id of ids) next[id] = Math.max(last[id] ?? at, at);
  return next;
}

/** Since when each member with nothing to do has had nothing to do. */
export function idleSinceOf(last: LastActive, rows: readonly PartyStateRow[]): IdleSince {
  const since: Partial<Record<MemberId, number>> = {};
  for (const row of rows) {
    const at = last[row.id];
    if (isRestful(row.state) && at !== undefined) since[row.id] = at;
  }
  return since;
}

/** True when a write is due: a member was added, or a time moved on by IDLE.persistStepMs. */
export function needsWrite(stored: LastActive, next: LastActive): boolean {
  return memberIdSchema.options.some((id) => {
    const after = next[id];
    if (after === undefined) return false;
    const before = stored[id];
    return before === undefined || Math.abs(after - before) >= IDLE.persistStepMs;
  });
}

export interface LastActiveTracker {
  /** Takes the party's states at `now` and returns who has been idle since when. */
  observe(rows: readonly PartyStateRow[], now: number): IdleSince;
  /** Members in a scene at `at`; returns the idle times for the rows last observed. */
  markActive(ids: readonly MemberId[], at: number): IdleSince;
}

export function createLastActiveTracker(
  storage: KeyValueStore = createKeyValueStore(),
): LastActiveTracker {
  const read = storage.read(LAST_ACTIVE_STORAGE_KEY, lastActiveSchema);
  let stored: LastActive = read.ok ? read.value : {};
  let last = stored;
  let rows: readonly PartyStateRow[] = [];

  function commit(next: LastActive): IdleSince {
    last = next;
    if (needsWrite(stored, next) && storage.write(LAST_ACTIVE_STORAGE_KEY, next).ok) stored = next;
    return idleSinceOf(last, rows);
  }

  return {
    observe(nextRows, now) {
      rows = nextRows;
      return commit(observeParty(last, rows, now));
    },
    markActive(ids, at) {
      return commit(markActive(last, ids, at));
    },
  };
}
