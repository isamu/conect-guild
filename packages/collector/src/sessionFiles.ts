import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { CompanySeat } from '../collector.config.ts';
import {
  latestCompanySessionIds,
  readSeatStates,
  type SessionsFailureKind,
  type SessionsReading,
} from './sessions.ts';

export interface SessionFilePaths {
  readonly seats: readonly CompanySeat[];
  readonly cwdLogPath: string;
  readonly activityStatePath: string;
}

function failureKindOf(error: unknown): SessionsFailureKind {
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
    const ids = await latestCompanySessionIds(cwdLogLines(paths.cwdLogPath), paths.seats);
    const activity = await readFile(paths.activityStatePath, { encoding: 'utf8', flag: 'r' });
    return readSeatStates(activity, paths.seats, ids);
  } catch (error) {
    return { ok: false, kind: failureKindOf(error) };
  }
}
