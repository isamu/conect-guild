import type { Snapshot } from '@conect-guild/snapshot';
import { z } from 'zod';
import {
  DEPARTMENT_LABELS,
  RECENT_REWARD_WINDOW_MS,
  departmentLabelSchema,
  type DepartmentLabel,
} from '../guild.config';
import { assignPr, indexIssues } from './party';

const recentRewardsSchema = z.record(departmentLabelSchema, z.number().int().nonnegative());

export type RecentRewards = Readonly<Record<DepartmentLabel, number>>;

/**
 * "最近の成果": per department, the number of its PRs merged within `windowMs` before `now`
 * (epoch milliseconds). PRs whose department is unknown count for no one. The value shrinks as
 * time passes because it follows the collector's 7-day range; cumulative XP is an M4 topic.
 */
export function countRecentRewards(
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
  now: number,
  windowMs: number = RECENT_REWARD_WINDOW_MS,
): RecentRewards {
  const counts = new Map<DepartmentLabel, number>();
  const index = indexIssues(snapshot.issues);
  for (const pr of snapshot.prs) {
    if (pr.mergedAt === null || now - Date.parse(pr.mergedAt) > windowMs) continue;
    const { department } = assignPr(pr, index);
    if (department !== null) counts.set(department, (counts.get(department) ?? 0) + 1);
  }
  // The record schema requires every label, so each department gets a count (0 when none).
  return recentRewardsSchema.parse(
    Object.fromEntries(DEPARTMENT_LABELS.map((label) => [label, counts.get(label) ?? 0])),
  );
}
