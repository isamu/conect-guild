import type { HistoryPr, Snapshot } from '@conect-guild/snapshot';
import { DEPARTMENT_LABELS, type DepartmentLabel } from '../guild.config';
import { pickDepartment } from './quest';

/**
 * Cumulative experience and levels (docs/DESIGN.md 4.6, Issue #19). Counted afresh from the
 * snapshot's `history` every time, so a reopened Issue or a moved label is right on the next fetch.
 * The king has no level.
 */

/** Experience per thing done (the president's decision, 2026-10-12). */
export const XP_PER = {
  /** An Issue of one's own closed as completed (not planned / duplicate are not in the history). */
  clear: 10,
  /** A PR of one's own merged. */
  merge: 5,
  /** かなめ: a scroll handed out at the reception (any Issue ever opened). */
  scroll: 3,
} as const;

export const MAX_LEVEL = 99;

export interface XpTally {
  readonly xp: number;
  /** Completed Issues counted (for かなめ: those with no department). */
  readonly clears: number;
  /** Merged PRs counted (always 0 for かなめ). */
  readonly merges: number;
  /** Opened Issues counted (かなめ only; 0 for the departments). */
  readonly scrolls: number;
}

export interface GuildXp {
  readonly kaname: XpTally;
  readonly departments: ReadonlyMap<DepartmentLabel, XpTally>;
}

export interface LevelProgress {
  readonly level: number;
  readonly xp: number;
  /** Experience still needed for the next level; null at MAX_LEVEL. */
  readonly toNext: number | null;
  /** How far from this level to the next, 0 (just reached) to below 1; 1 at MAX_LEVEL. */
  readonly progress: number;
}

/** Cumulative experience needed to be at `level`: 5 × L × (L − 1) (Lv1 0, Lv2 10, Lv3 30, …). */
export function xpForLevel(level: number): number {
  return 5 * level * (level - 1);
}

/** The highest level whose need `xp` meets (at least 1, at most MAX_LEVEL), and the way on. */
export function levelOf(xp: number): LevelProgress {
  let level = 1;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level += 1;
  if (level === MAX_LEVEL) return { level, xp, toNext: null, progress: 1 };
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, toNext: next - xp, progress: (xp - floor) / (next - floor) };
}

/** Department labels of each Issue we know: the completed ones in the history and the listed ones. */
function issueLabels(
  snapshot: Pick<Snapshot, 'issues' | 'history'>,
): Map<number, readonly string[]> {
  const labels = new Map<number, readonly string[]>();
  for (const issue of snapshot.history.completedIssues) labels.set(issue.number, issue.departments);
  for (const issue of snapshot.issues) labels.set(issue.number, issue.labels);
  return labels;
}

/**
 * A merged PR's department, as domain/party.ts assignPr does for listed PRs: the linked Issues'
 * department labels (fixed order), then the department of the branch prefix. null when neither
 * tells (the PR counts for no one: かなめ's experience has its own measure).
 */
export function departmentOfMergedPr(
  pr: HistoryPr,
  labels: ReadonlyMap<number, readonly string[]>,
): DepartmentLabel | null {
  const linked = pr.linkedIssues.flatMap((n) => labels.get(n) ?? []);
  return pickDepartment(linked).department ?? pr.branchDepartment;
}

/** Nothing done yet. */
export const NO_XP: XpTally = { xp: 0, clears: 0, merges: 0, scrolls: 0 };

function tally(clears: number, merges: number, scrolls: number): XpTally {
  return {
    xp: clears * XP_PER.clear + merges * XP_PER.merge + scrolls * XP_PER.scroll,
    clears,
    merges,
    scrolls,
  };
}

function countBy(
  departments: readonly (DepartmentLabel | null)[],
): Map<DepartmentLabel | null, number> {
  const counts = new Map<DepartmentLabel | null, number>();
  for (const department of departments) counts.set(department, (counts.get(department) ?? 0) + 1);
  return counts;
}

/**
 * Each department's experience (its completed Issues and merged PRs) and かなめ's (every Issue ever
 * opened, and the completed Issues with no department). Every department label has an entry.
 */
export function countXp(snapshot: Pick<Snapshot, 'issues' | 'history'>): GuildXp {
  const { history } = snapshot;
  const clears = countBy(
    history.completedIssues.map((issue) => pickDepartment(issue.departments).department),
  );
  const labels = issueLabels(snapshot);
  const merges = countBy(history.mergedPrs.map((pr) => departmentOfMergedPr(pr, labels)));
  return {
    kaname: tally(clears.get(null) ?? 0, 0, history.openedIssueCount),
    departments: new Map(
      DEPARTMENT_LABELS.map((label) => [
        label,
        tally(clears.get(label) ?? 0, merges.get(label) ?? 0, 0),
      ]),
    ),
  };
}
