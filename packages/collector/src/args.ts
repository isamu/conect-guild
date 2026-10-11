export type CliMode = 'once' | 'loop' | 'invalid';

/** Decide how the collector runs from its command-line arguments. */
export function parseCliArgs(args: readonly string[]): CliMode {
  if (args.length === 0) return 'loop';
  if (args.length === 1 && args[0] === '--once') return 'once';
  return 'invalid';
}
