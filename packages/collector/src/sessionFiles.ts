import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { CompanySeat } from '../collector.config.ts';
import {
  latestCompanySessionIds,
  readSeatStates,
  type SessionsFailureKind,
  type SessionsReading,
} from './sessions.ts';

/**
 * Upper bounds on what is read. Both files are small (the cwd log grows by one short line per new
 * session); a file past these is not what we expect, and reading it whole every 5 seconds would
 * cost memory and time, so it makes the sessions unavailable instead.
 */
export const MAX_CWD_LOG_BYTES = 16 * 1024 * 1024;
export const MAX_ACTIVITY_STATE_BYTES = 1024 * 1024;

class TooLargeError extends Error {}

async function assertSize(path: string, maxBytes: number): Promise<void> {
  if ((await stat(path)).size > maxBytes) throw new TooLargeError();
}

export interface SessionFilePaths {
  readonly seats: readonly CompanySeat[];
  readonly cwdLogPath: string;
  readonly activityStatePath: string;
}

function failureKindOf(error: unknown): SessionsFailureKind {
  if (error instanceof TooLargeError) return 'too-large';
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
    ? 'missing'
    : 'read-failed';
}

/**
 * Lines of the cwd log, streamed: each line is handed over and dropped, so the lines of other
 * directories are never held together. Opened read-only; MulmoTerminal's files are never written.
 */
function cwdLogLines(path: string): AsyncIterable<string> {
  return createInterface({
    input: createReadStream(path, { encoding: 'utf8', flags: 'r' }),
    crlfDelay: Infinity,
  });
}

/** Reads MulmoTerminal's two files and returns the company seats' states. Never throws. */
export async function readCompanySessions(paths: SessionFilePaths): Promise<SessionsReading> {
  try {
    await assertSize(paths.cwdLogPath, MAX_CWD_LOG_BYTES);
    const ids = await latestCompanySessionIds(cwdLogLines(paths.cwdLogPath), paths.seats);
    await assertSize(paths.activityStatePath, MAX_ACTIVITY_STATE_BYTES);
    const activity = await readFile(paths.activityStatePath, { encoding: 'utf8', flag: 'r' });
    return readSeatStates(activity, paths.seats, ids);
  } catch (error) {
    return { ok: false, kind: failureKindOf(error) };
  }
}
