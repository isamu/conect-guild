import type { SessionState, SnapshotSession } from '@conect-guild/snapshot';
import { z } from 'zod';
import type { CompanySeat } from '../collector.config.ts';

/**
 * Company session states from MulmoTerminal's files (docs/DESIGN.md 4.7). Pure: the caller reads
 * the files. Only the five company directories are kept; every other line is dropped where it is
 * read, and nothing of it (path, id or count) leaves these functions.
 */

/** MulmoTerminal's session id (a UUID, `SESSION_ID_RE` in its server/config/env.ts). */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One line of dev-terminal-cwds.json: `<id> <absolute path>`. The id holds no space, so the first
 * space splits it and the rest (spaces included) is the path. Trimmed as MulmoTerminal does.
 */
export function parseCwdLine(line: string): { id: string; cwd: string } | null {
  const text = line.trim();
  const at = text.indexOf(' ');
  if (at <= 0) return null;
  const id = text.slice(0, at);
  const cwd = text.slice(at + 1).trim();
  return SESSION_ID.test(id) && cwd !== '' ? { id, cwd } : null;
}

/**
 * The current session id of each company seat, keyed by the seat's cwd.
 *
 * The log only grows and the last line of an id is its truth, so for each seat this is the id of
 * its last line whose id was not moved elsewhere later. Lines of other directories are only
 * compared and dropped: their path and id are never stored, so they cannot leak.
 */
export async function latestCompanySessionIds(
  lines: AsyncIterable<string> | Iterable<string>,
  seats: readonly CompanySeat[],
): Promise<ReadonlyMap<string, string>> {
  // Candidate ids per seat, oldest first. Only ids last seen at a company path stay here.
  const candidates = new Map<string, string[]>(seats.map((seat) => [seat.cwd, []]));
  for await (const line of lines) {
    const record = parseCwdLine(line);
    if (record === null) continue;
    for (const [cwd, ids] of candidates) {
      candidates.set(
        cwd,
        ids.filter((id) => id !== record.id),
      );
    }
    candidates.get(record.cwd)?.push(record.id);
  }
  const latest = new Map<string, string>();
  for (const [cwd, ids] of candidates) {
    const last = ids.at(-1);
    if (last !== undefined) latest.set(cwd, last);
  }
  return latest;
}

/** One entry of activity-state.json. Extra keys are ignored; a missing or mistyped one fails. */
export const activityEntrySchema = z.object({
  working: z.boolean(),
  waiting: z.boolean(),
  event: z.string().nullable(),
});

export type ActivityEntry = z.infer<typeof activityEntrySchema>;

const activityFileSchema = z.record(z.string(), z.unknown());

/**
 * The rules, top first: a Notification while waiting asks for a permission; a turn in progress is
 * working; any other wait (Stop, MarkedUnread) finished a turn; no entry is idle.
 */
export function sessionStateOf(entry: ActivityEntry | undefined): SessionState {
  if (entry === undefined) return 'idle';
  if (entry.waiting && entry.event === 'Notification') return 'awaiting-permission';
  if (entry.working) return 'working';
  if (entry.waiting) return 'resting';
  return 'idle';
}

export type SessionsFailureKind = 'missing' | 'read-failed' | 'parse-failed' | 'invalid';

export type SessionsReading =
  | {
      readonly ok: true;
      readonly members: readonly SnapshotSession[];
      /** How many seats have a session in the cwd log. */
      readonly found: number;
    }
  | { readonly ok: false; readonly kind: SessionsFailureKind };

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

type EntryLookup = { ok: true; entry: ActivityEntry | undefined } | { ok: false };

function lookupEntry(file: Readonly<Record<string, unknown>>, id: string | undefined): EntryLookup {
  if (id === undefined || !Object.hasOwn(file, id)) return { ok: true, entry: undefined };
  const entry = activityEntrySchema.safeParse(file[id]);
  return entry.success ? { ok: true, entry: entry.data } : { ok: false };
}

/**
 * Each seat's state from the activity-state.json text. Only the seats' ids are looked up; other
 * keys are never read. The file is rewritten in place by MulmoTerminal, so an empty or half
 * written text is normal now and then: it fails this cycle and the next one reads it again.
 */
export function readSeatStates(
  activityText: string,
  seats: readonly CompanySeat[],
  ids: ReadonlyMap<string, string>,
): SessionsReading {
  const json = parseJson(activityText);
  if (!json.ok) return { ok: false, kind: 'parse-failed' };
  const file = activityFileSchema.safeParse(json.value);
  if (!file.success) return { ok: false, kind: 'invalid' };
  const members: SnapshotSession[] = [];
  for (const seat of seats) {
    const lookup = lookupEntry(file.data, ids.get(seat.cwd));
    if (!lookup.ok) return { ok: false, kind: 'invalid' };
    members.push({ department: seat.department, state: sessionStateOf(lookup.entry) });
  }
  return { ok: true, members, found: seats.filter((seat) => ids.has(seat.cwd)).length };
}
