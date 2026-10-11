import type { SnapshotIssue } from '@conect-guild/snapshot';
import { DEPARTMENT_LABELS, type DepartmentLabel } from '../guild.config';

export interface DepartmentPick {
  /** The department in charge, or null for "かなめの受付" (no department label). */
  readonly department: DepartmentLabel | null;
  /** True when two or more department labels were present. */
  readonly multiDepartment: boolean;
}

export interface Quest {
  readonly number: number;
  readonly title: string;
  readonly state: SnapshotIssue['state'];
  readonly closedAt: string | null;
  /** null means the scroll waits at かなめ's reception desk. */
  readonly department: DepartmentLabel | null;
  readonly multiDepartment: boolean;
}

/** Department labels among `labels`, in the fixed order (経理 → 広報 → 企画 → 総務), without repeats. */
export function departmentLabelsOf(labels: readonly string[]): DepartmentLabel[] {
  return DEPARTMENT_LABELS.filter((label) => labels.includes(label));
}

/** 0 department labels → reception; 2 or more → the first in the fixed order, marked as multi. */
export function pickDepartment(labels: readonly string[]): DepartmentPick {
  const found = departmentLabelsOf(labels);
  return { department: found[0] ?? null, multiDepartment: found.length >= 2 };
}

export function toQuest(issue: SnapshotIssue): Quest {
  const { department, multiDepartment } = pickDepartment(issue.labels);
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    closedAt: issue.closedAt,
    department,
    multiDepartment,
  };
}

export function toQuests(issues: readonly SnapshotIssue[]): Quest[] {
  return issues.map(toQuest);
}
