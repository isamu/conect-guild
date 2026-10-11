import { createReadStream, type ReadStream } from 'node:fs';
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

/**
 * A read-only stream of at most `maxBytes + 1` bytes, so a file that grows while it is read is
 * still capped. {@link assertWithin} then tells whether the limit was passed.
 */
function cappedStream(path: string, maxBytes: number, signal?: AbortSignal): ReadStream {
  return createReadStream(path, { encoding: 'utf8', flags: 'r', start: 0, end: maxBytes, signal });
}

function assertWithin(stream: ReadStream, maxBytes: number): void {
  if (stream.bytesRead > maxBytes) throw new TooLargeError();
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
 * The company session ids from the cwd log, streamed: each line is handed over and dropped, so the
 * lines of other directories are never held together.
 */
async function readCwdLog(
  paths: SessionFilePaths,
  signal: AbortSignal | undefined,
): Promise<ReadonlyMap<string, string>> {
  const stream = cappedStream(paths.cwdLogPath, MAX_CWD_LOG_BYTES, signal);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const ids = await latestCompanySessionIds(lines, paths.seats);
  assertWithin(stream, MAX_CWD_LOG_BYTES);
  return ids;
}

async function readActivityState(path: string, signal: AbortSignal | undefined): Promise<string> {
  const stream = cappedStream(path, MAX_ACTIVITY_STATE_BYTES, signal);
  let text = '';
  for await (const chunk of stream) text += String(chunk);
  assertWithin(stream, MAX_ACTIVITY_STATE_BYTES);
  return text;
}

/**
 * Reads MulmoTerminal's two files and returns the company seats' states. Never throws; an abort
 * of `signal` ends the reading (read-failed). Both are
 * opened read-only; MulmoTerminal's files are never written or locked.
 */
export async function readCompanySessions(
  paths: SessionFilePaths,
  signal?: AbortSignal,
): Promise<SessionsReading> {
  try {
    const ids = await readCwdLog(paths, signal);
    const activity = await readActivityState(paths.activityStatePath, signal);
    return readSeatStates(activity, paths.seats, ids);
  } catch (error) {
    return { ok: false, kind: failureKindOf(error) };
  }
}
