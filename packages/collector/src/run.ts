import { COLLECTOR_CONFIG } from '../collector.config.ts';
import { parseCliArgs } from './args.ts';
import { collectSnapshot } from './collect.ts';
import { CollectorError, errorKind, type CollectorErrorKind } from './errors.ts';
import type { GhRunner } from './gh.ts';

export interface RunDeps {
  readonly now: () => Date;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly gh: GhRunner;
  readonly writeSnapshot: (content: string) => Promise<void>;
  /** Waits between cycles; resolves early when `signal` aborts. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly signal: AbortSignal;
}

export type CycleResult =
  | { readonly ok: true; readonly issues: number; readonly prs: number }
  | { readonly ok: false; readonly kind: CollectorErrorKind | 'unexpected' };

async function writeOrThrow(deps: RunDeps, content: string): Promise<void> {
  try {
    await deps.writeSnapshot(content);
  } catch {
    throw new CollectorError('write-failed');
  }
}

/** One fetch → validate → write cycle. Nothing is written unless every step succeeds. */
export async function collectOnce(deps: RunDeps): Promise<CycleResult> {
  try {
    const snapshot = await collectSnapshot(deps.gh, COLLECTOR_CONFIG.repo, deps.now());
    await writeOrThrow(deps, `${JSON.stringify(snapshot, null, 2)}\n`);
    return { ok: true, issues: snapshot.issues.length, prs: snapshot.prs.length };
  } catch (error) {
    return { ok: false, kind: errorKind(error) };
  }
}

/** Logs carry only counts, times and error kinds (no titles, bodies or branch names). */
function report(deps: RunDeps, result: CycleResult): void {
  const prefix = `[collector] ${deps.now().toISOString()}`;
  if (result.ok) {
    deps.log(`${prefix} ok: issues=${String(result.issues)} prs=${String(result.prs)}`);
  } else {
    deps.error(`${prefix} failed: ${result.kind}`);
  }
}

/** Collect every interval until the signal aborts. Failures are retried next cycle. */
async function runLoop(deps: RunDeps): Promise<void> {
  // A function call keeps TypeScript from narrowing `aborted` across awaits.
  const stopped = (): boolean => deps.signal.aborted;
  while (!stopped()) {
    const result = await collectOnce(deps);
    // An interrupt during a cycle ends quietly instead of reporting the killed gh.
    if (stopped()) return;
    report(deps, result);
    await deps.sleep(COLLECTOR_CONFIG.intervalMs);
  }
}

/** Entry logic of the collector. Resolves with the process exit code. */
export async function runCollector(args: readonly string[], deps: RunDeps): Promise<number> {
  const mode = parseCliArgs(args);
  if (mode === 'once') {
    const result = await collectOnce(deps);
    report(deps, result);
    return result.ok ? 0 : 1;
  }
  if (mode === 'loop') {
    await runLoop(deps);
    return 0;
  }
  deps.error('[collector] unknown arguments; usage: main.ts [--once]');
  return 2;
}
