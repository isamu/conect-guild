import { snapshotSchema, type GithubPart, type SnapshotSessions } from '@conect-guild/snapshot';
import { COLLECTOR_CONFIG } from '../collector.config.ts';
import { parseCliArgs } from './args.ts';
import { collectSnapshot } from './collect.ts';
import { CollectorError, errorKind, type CollectorErrorKind } from './errors.ts';
import { parseOrThrow, type GhRunner } from './gh.ts';
import type { SessionsReading } from './sessions.ts';

export interface RunDeps {
  readonly now: () => Date;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly gh: GhRunner;
  /** Reads the company sessions from MulmoTerminal's files. Never throws. */
  readonly readSessions: () => Promise<SessionsReading>;
  readonly writeSnapshot: (content: string) => Promise<void>;
  /** Waits between cycles; resolves early when `signal` aborts. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly signal: AbortSignal;
}

type FailureKind = CollectorErrorKind | 'unexpected';

type GithubResult =
  | { readonly ok: true; readonly part: GithubPart }
  | { readonly ok: false; readonly kind: FailureKind };

export type CycleResult =
  | { readonly ok: true; readonly issues: number; readonly prs: number }
  | { readonly ok: false; readonly kind: FailureKind };

type WriteResult = { readonly ok: true } | { readonly ok: false; readonly kind: FailureKind };

async function fetchGithub(deps: RunDeps, now: Date): Promise<GithubResult> {
  try {
    return { ok: true, part: await collectSnapshot(deps.gh, COLLECTOR_CONFIG.repo, now) };
  } catch (error) {
    return { ok: false, kind: errorKind(error) };
  }
}

/** A reader that throws anyway counts as read-failed, so the loop and the GitHub part go on. */
async function readSessionsSafely(deps: RunDeps): Promise<SessionsReading> {
  try {
    return await deps.readSessions();
  } catch {
    return { ok: false, kind: 'read-failed' };
  }
}

/** The sessions part of the snapshot. A failed reading becomes `unavailable`. */
export function toSnapshotSessions(reading: SessionsReading, checkedAt: Date): SnapshotSessions {
  const at = checkedAt.toISOString();
  return reading.ok
    ? { status: 'ok', checkedAt: at, members: [...reading.members] }
    : { status: 'unavailable', checkedAt: at };
}

/**
 * Validates the whole snapshot (the last good GitHub part + this reading of the sessions) and
 * writes it atomically. A failed sessions reading never stops the GitHub part from being written.
 */
async function writeSnapshot(
  deps: RunDeps,
  github: GithubPart,
  reading: SessionsReading,
): Promise<WriteResult> {
  try {
    const sessions = toSnapshotSessions(reading, deps.now());
    const snapshot = parseOrThrow(snapshotSchema, { ...github, sessions });
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    try {
      await deps.writeSnapshot(content);
    } catch {
      throw new CollectorError('write-failed');
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, kind: errorKind(error) };
  }
}

function cycleResult(github: GithubResult, write: WriteResult | null): CycleResult {
  if (!github.ok) return github;
  if (write !== null && !write.ok) return write;
  return { ok: true, issues: github.part.issues.length, prs: github.part.prs.length };
}

/** One full cycle (GitHub, sessions, write). Nothing is written unless GitHub succeeds. */
export async function collectOnce(
  deps: RunDeps,
): Promise<{ readonly github: CycleResult; readonly sessions: SessionsReading }> {
  const github = await fetchGithub(deps, deps.now());
  const sessions = await readSessionsSafely(deps);
  const write = github.ok ? await writeSnapshot(deps, github.part, sessions) : null;
  return { github: cycleResult(github, write), sessions };
}

function prefix(deps: RunDeps): string {
  return `[collector] ${deps.now().toISOString()}`;
}

/** Logs carry only counts, times and error kinds (no titles, bodies, branch names, paths or ids). */
function reportCycle(deps: RunDeps, result: CycleResult): void {
  if (result.ok) {
    deps.log(`${prefix(deps)} ok: issues=${String(result.issues)} prs=${String(result.prs)}`);
  } else {
    deps.error(`${prefix(deps)} failed: ${result.kind}`);
  }
}

/** e.g. `sessions=5 ok` or `sessions unavailable: parse-failed`. */
export function sessionsSummary(reading: SessionsReading): string {
  return reading.ok
    ? `sessions=${String(reading.found)} ok`
    : `sessions unavailable: ${reading.kind}`;
}

/** What the loop remembers between ticks. */
interface LoopState {
  github: GithubPart | null;
  githubAttemptAt: number | null;
  /** The last logged sessions summary; the loop logs only changes (it reads every 5 seconds). */
  sessionsLogged: string | null;
  writeFailing: boolean;
}

export function isGithubDue(lastAttemptAt: number | null, now: number): boolean {
  return lastAttemptAt === null || now - lastAttemptAt >= COLLECTOR_CONFIG.intervalMs;
}

function reportSessions(deps: RunDeps, state: LoopState, reading: SessionsReading): void {
  const summary = sessionsSummary(reading);
  if (summary === state.sessionsLogged) return;
  state.sessionsLogged = summary;
  deps.log(`${prefix(deps)} ${summary}`);
}

/** A write failure outside a GitHub cycle is logged once, when it starts. */
function reportWrite(deps: RunDeps, state: LoopState, write: WriteResult | null): void {
  const failing = write !== null && !write.ok;
  if (failing && !state.writeFailing) deps.error(`${prefix(deps)} failed: ${write.kind}`);
  state.writeFailing = failing;
}

/**
 * One tick of the loop: GitHub when its interval has passed (keeping the last good part when it
 * fails), then the sessions, then one atomic write of both.
 */
async function tick(deps: RunDeps, state: LoopState): Promise<void> {
  const now = deps.now();
  let github: GithubResult | null = null;
  if (isGithubDue(state.githubAttemptAt, now.getTime())) {
    github = await fetchGithub(deps, now);
    state.githubAttemptAt = now.getTime();
    if (github.ok) state.github = github.part;
  }
  if (deps.signal.aborted) return;
  const reading = await readSessionsSafely(deps);
  const write = state.github === null ? null : await writeSnapshot(deps, state.github, reading);
  if (github === null) {
    reportWrite(deps, state, write);
  } else {
    reportCycle(deps, cycleResult(github, write));
    state.writeFailing = write !== null && !write.ok;
  }
  reportSessions(deps, state, reading);
}

/** Collect until the signal aborts. Failures are retried on the next tick. */
async function runLoop(deps: RunDeps): Promise<void> {
  const state: LoopState = {
    github: null,
    githubAttemptAt: null,
    sessionsLogged: null,
    writeFailing: false,
  };
  // A function call keeps TypeScript from narrowing `aborted` across awaits.
  const stopped = (): boolean => deps.signal.aborted;
  while (!stopped()) {
    await tick(deps, state);
    // An interrupt during a tick ends quietly instead of reporting the killed gh.
    if (stopped()) return;
    await deps.sleep(COLLECTOR_CONFIG.sessions.intervalMs);
  }
}

/** Entry logic of the collector. Resolves with the process exit code. */
export async function runCollector(args: readonly string[], deps: RunDeps): Promise<number> {
  const mode = parseCliArgs(args);
  if (mode === 'once') {
    const result = await collectOnce(deps);
    reportCycle(deps, result.github);
    deps.log(`${prefix(deps)} ${sessionsSummary(result.sessions)}`);
    return result.github.ok ? 0 : 1;
  }
  if (mode === 'loop') {
    await runLoop(deps);
    return 0;
  }
  deps.error('[collector] unknown arguments; usage: main.ts [--once]');
  return 2;
}
