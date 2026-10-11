import { parseCliArgs } from './args.ts';

export interface RunDeps {
  readonly now: () => Date;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

/**
 * Entry logic of the collector. Returns the process exit code.
 * M0 never contacts GitHub; real collection arrives in M1.
 * Logs carry only counts, times and error kinds (no titles or branch names).
 */
export function runCollector(args: readonly string[], deps: RunDeps): number {
  const mode = parseCliArgs(args);
  if (mode === 'once') {
    deps.log(
      `[collector] ${deps.now().toISOString()} once: issues=0 prs=0 (M0: GitHub not contacted)`,
    );
    return 0;
  }
  if (mode === 'loop') {
    deps.error('[collector] continuous mode is implemented in M1; use --once');
    return 1;
  }
  deps.error('[collector] unknown arguments; usage: main.ts --once');
  return 2;
}
