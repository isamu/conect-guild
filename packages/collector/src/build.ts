import type { SnapshotIssue, SnapshotPr } from '@conect-guild/snapshot';
import type { RawIssue, RawPr } from './github.ts';
import { extractLinkedIssues } from './links.ts';

/** Closed issues and PRs are kept for this long (docs/DESIGN.md 4.1). */
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function recentCutoff(now: Date): Date {
  return new Date(now.getTime() - RECENT_WINDOW_MS);
}

function isOpenOrRecentlyClosed(
  item: { readonly state: 'open' | 'closed'; readonly closed_at: string | null },
  cutoff: Date,
): boolean {
  if (item.state === 'open') return true;
  return item.closed_at !== null && Date.parse(item.closed_at) >= cutoff.getTime();
}

/**
 * One item per number. An item fetched from both the open and the closed list
 * was closed while we were fetching, so the closed copy wins.
 */
function uniquePreferClosed<
  T extends { readonly number: number; readonly state: 'open' | 'closed' },
>(items: readonly T[]): T[] {
  const byNumber = new Map<number, T>();
  for (const item of items) {
    if (!byNumber.has(item.number) || item.state === 'closed') byNumber.set(item.number, item);
  }
  return [...byNumber.values()];
}

function isoOrNull(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** Issues without PRs: all open ones and those closed since `cutoff`. */
export function toSnapshotIssues(raw: readonly RawIssue[], cutoff: Date): SnapshotIssue[] {
  const issues = uniquePreferClosed(raw.filter((issue) => issue.pull_request === undefined)).filter(
    (issue) => isOpenOrRecentlyClosed(issue, cutoff),
  );
  return issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    labels: issue.labels.map((label) => label.name),
    state: issue.state,
    createdAt: new Date(issue.created_at).toISOString(),
    updatedAt: new Date(issue.updated_at).toISOString(),
    closedAt: isoOrNull(issue.closed_at),
  }));
}

/** All open PRs and those closed or merged since `cutoff`. */
export function selectRecentPrs(raw: readonly RawPr[], cutoff: Date): RawPr[] {
  return uniquePreferClosed(raw).filter((pr) => isOpenOrRecentlyClosed(pr, cutoff));
}

/** Snapshot form of a PR. The body is read for links only and dropped here. */
export function toSnapshotPr(pr: RawPr, repo: string, changedFiles: readonly string[]): SnapshotPr {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    mergedAt: isoOrNull(pr.merged_at),
    closedAt: isoOrNull(pr.closed_at),
    headRef: pr.head.ref,
    linkedIssues: extractLinkedIssues(pr.title, pr.body, repo),
    changedFiles: pr.state === 'open' ? [...changedFiles] : [],
  };
}
