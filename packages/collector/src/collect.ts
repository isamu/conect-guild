import { SNAPSHOT_SCHEMA_VERSION, snapshotSchema, type Snapshot } from '@conect-guild/snapshot';
import { recentCutoff, selectRecentPrs, toSnapshotIssues, toSnapshotPr } from './build.ts';
import { parseOrThrow, type GhRunner } from './gh.ts';
import { fetchChangedFiles, fetchIssues, fetchPrs } from './github.ts';

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
  const prs = await Promise.all(
    selectRecentPrs(rawPrs, cutoff).map(async (pr) =>
      toSnapshotPr(
        pr,
        repo,
        pr.state === 'open' ? await fetchChangedFiles(gh, repo, pr.number) : [],
      ),
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
