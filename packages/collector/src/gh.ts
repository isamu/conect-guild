import { execFile } from 'node:child_process';
import { z } from 'zod';
import { CollectorError } from './errors.ts';

/** Runs `gh` with an argument array and resolves with its stdout. */
export type GhRunner = (args: readonly string[]) => Promise<string>;

export const GH_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Real runner: execFile with an argument array (never a shell string), using the
 * user's own gh authentication. stderr and the error message are dropped so
 * nothing from GitHub can reach the logs.
 */
export function createGhRunner(signal?: AbortSignal): GhRunner {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        // gh is looked up on PATH on purpose: the user's own installed and
        // authenticated CLI is the only credential source (docs/DESIGN.md 4.1).
        // eslint-disable-next-line sonarjs/no-os-command-from-path
        'gh',
        [...args],
        { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER, signal },
        (error, stdout) => {
          if (error) {
            reject(new CollectorError('gh-failed'));
            return;
          }
          resolve(stdout);
        },
      );
    });
}

const slurpedPagesSchema = z.array(z.array(z.unknown()));

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new CollectorError('validation-failed');
  }
}

/** Flatten `gh api --paginate --slurp` output (an array of page arrays). */
export function flattenPages(stdout: string): unknown[] {
  const result = slurpedPagesSchema.safeParse(parseJson(stdout));
  if (!result.success) throw new CollectorError('validation-failed');
  return result.data.flat();
}

/** GET every page of a list endpoint and return the items of all pages. */
export async function ghApiAll(gh: GhRunner, path: string): Promise<unknown[]> {
  const stdout = await gh(['api', '--paginate', '--slurp', path]);
  return flattenPages(stdout);
}

/** Validate with zod; a mismatch becomes a validation-failed error. */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new CollectorError('validation-failed');
  return result.data;
}
