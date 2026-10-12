import type {
  HistoryIssue,
  HistoryPr,
  SnapshotHistory,
  SnapshotIssue,
  SnapshotPr,
} from '@conect-guild/snapshot';
import {
  DEPARTMENT_LABELS,
  departmentFromBranch,
  type BranchPrefixRule,
} from '@conect-guild/snapshot/settings';
import type { RawIssue, RawPr } from './github.ts';
import { extractLinkedIssues } from './links.ts';

/** Closed issues and PRs are kept for this long (docs/DESIGN.md 4.1). */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
 * One issue per number. Issues come from one list read page by page (github.ts fetchIssues), so
 * an issue read twice (the pages shifted) is newest in the copy read last.
 */
function uniqueReadLast(issues: readonly RawIssue[]): RawIssue[] {
  return [...new Map(issues.map((issue) => [issue.number, issue])).values()];
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
  const issues = uniqueReadLast(raw.filter((issue) => !issue.is_pull_request)).filter((issue) =>
    isOpenOrRecentlyClosed(issue, cutoff),
  );
  return issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    labels: [...issue.labels],
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
    headRef: pr.head_ref,
    linkedIssues: extractLinkedIssues(pr.title, pr.body, repo),
    changedFiles: pr.state === 'open' ? [...changedFiles] : [],
  };
}

function byNumber(a: { readonly number: number }, b: { readonly number: number }): number {
  return a.number - b.number;
}

/** Only the department labels, in the fixed order; other labels stay out. */
function toHistoryIssue(issue: RawIssue): HistoryIssue {
  const departments = DEPARTMENT_LABELS.filter((label) => issue.labels.includes(label));
  return { number: issue.number, departments };
}

/** Only the department the branch name points at goes in; the branch name stays out. */
function toHistoryPr(
  pr: RawPr,
  repo: string,
  branchPrefixes: readonly BranchPrefixRule[],
): HistoryPr {
  return {
    number: pr.number,
    linkedIssues: extractLinkedIssues(pr.title, pr.body, repo),
    branchDepartment: departmentFromBranch(pr.head_ref, branchPrefixes),
  };
}

/**
 * The whole history, counted afresh from what GitHub says now (docs/DESIGN.md 4.1, 4.2): how many
 * Issues were ever opened, the Issues closed as completed, and the merged PRs. Numbers and
 * departments only; titles, other labels, branch names and times are dropped here.
 */
export function toHistory(
  rawIssues: readonly RawIssue[],
  rawPrs: readonly RawPr[],
  repo: string,
  branchPrefixes: readonly BranchPrefixRule[],
): SnapshotHistory {
  const issues = uniqueReadLast(rawIssues.filter((issue) => !issue.is_pull_request));
  const completed = issues.filter(
    (issue) => issue.state === 'closed' && issue.state_reason === 'completed',
  );
  const merged = uniquePreferClosed(rawPrs).filter((pr) => pr.merged_at !== null);
  return {
    openedIssueCount: issues.length,
    completedIssues: completed.map(toHistoryIssue).toSorted(byNumber),
    mergedPrs: merged.map((pr) => toHistoryPr(pr, repo, branchPrefixes)).toSorted(byNumber),
  };
}
