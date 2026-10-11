import { SNAPSHOT_SCHEMA_VERSION, snapshotSchema, type Snapshot } from '@conect-guild/snapshot';
import { recentCutoff, selectRecentPrs, toSnapshotIssues, toSnapshotPr } from './build.ts';
import { parseOrThrow, type GhRunner } from './gh.ts';
import { fetchChangedFiles, fetchIssues, fetchPrs } from './github.ts';
import { mapWithConcurrency } from './limit.ts';

/** At most this many `gh` processes fetch changed files at once. */
export const CHANGED_FILES_CONCURRENCY = 4;

/**
 * Fetch issues and PRs of `repo` and build a validated snapshot.
 * Throws a CollectorError if any request or validation fails.
 */
export async function collectSnapshot(gh: GhRunner, repo: string, now: Date): Promise<Snapshot> {
  const cutoff = recentCutoff(now);
  const [rawIssues, rawPrs] = await Promise.all([
    fetchIssues(gh, repo, cutoff),
    fetchPrs(gh, repo),
  ]);
  const prs = await mapWithConcurrency(
    selectRecentPrs(rawPrs, cutoff),
    CHANGED_FILES_CONCURRENCY,
    async (pr) =>
      toSnapshotPr(
        pr,
        repo,
        pr.state === 'open' ? await fetchChangedFiles(gh, repo, pr.number) : [],
      ),
  );
  return parseOrThrow(snapshotSchema, {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: now.toISOString(),
    repo,
    issues: toSnapshotIssues(rawIssues, cutoff),
    prs,
  });
}
