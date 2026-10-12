import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { snapshotSchema, type Snapshot } from '@conect-guild/snapshot';
import { GUILD_SETTINGS } from '../../../guild.settings.ts';

/**
 * The E2E tests serve only the dummy sample (public/snapshot.sample.json, made-up titles) through
 * the dev server's /snapshot.json route, by writing it where the collector would (docs/DESIGN.md 9).
 */
const WEB_ROOT = path.resolve(import.meta.dirname, '..');
const SAMPLE_FILE = path.join(WEB_ROOT, 'public', 'snapshot.sample.json');
export const DATA_DIR = path.join(WEB_ROOT, '.data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');

/** The fixed "now" of every test (12:00 in Tokyo). */
export const NOW = Date.parse('2026-10-12T03:00:00.000Z');

/**
 * Creates .data for this run and returns how to remove it. Refuses when it already exists: it may
 * hold the collector's real data (or be left by a run that was killed; then delete it by hand).
 * Do not run the collector in the same checkout while the tests run.
 */
export async function claimDataDir(): Promise<() => Promise<void>> {
  try {
    // Not recursive: fails with EEXIST instead of taking over a directory that is already there.
    await mkdir(DATA_DIR, { mode: 0o700 });
  } catch (error) {
    throw new Error(
      `Cannot create ${DATA_DIR} (it may hold the collector's real data). The E2E tests never use an existing one: move it away first.`,
      { cause: error },
    );
  }
  return () => rm(DATA_DIR, { recursive: true, force: true });
}

/** The sample, pointed at guild.settings.ts's repo and fetched at `at`. */
export async function sampleSnapshot(at: number = NOW): Promise<Snapshot> {
  const sample = snapshotSchema.parse(JSON.parse(await readFile(SAMPLE_FILE, 'utf8')));
  const iso = new Date(at).toISOString();
  return {
    ...sample,
    repo: GUILD_SETTINGS.repo,
    fetchedAt: iso,
    sessions:
      sample.sessions.status === 'ok' ? { ...sample.sessions, checkedAt: iso } : sample.sessions,
  };
}

/** Closes the given Issues at `at` (what the collector would see after they were closed). */
export function withClosedIssues(snapshot: Snapshot, numbers: readonly number[], at: number) {
  const iso = new Date(at).toISOString();
  return {
    ...snapshot,
    issues: snapshot.issues.map((issue) =>
      numbers.includes(issue.number)
        ? { ...issue, state: 'closed' as const, updatedAt: iso, closedAt: iso }
        : issue,
    ),
  } satisfies Snapshot;
}

/** Writes the snapshot like the collector: 0600, to a temporary file, then renamed into place. */
export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  const temporary = `${SNAPSHOT_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
  await rename(temporary, SNAPSHOT_FILE);
}
