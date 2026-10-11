import type { Snapshot } from '@conect-guild/snapshot';
import { RECENT_REWARD_WINDOW_MS, type DepartmentLabel } from '../guild.config';
import { assignPr, indexIssues } from './party';

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
  const counts: Record<DepartmentLabel, number> = { 経理: 0, 広報: 0, 企画: 0, 総務: 0 };
  const index = indexIssues(snapshot.issues);
  for (const pr of snapshot.prs) {
    if (pr.mergedAt === null || now - Date.parse(pr.mergedAt) > windowMs) continue;
    const { department } = assignPr(pr, index);
    if (department !== null) counts[department] += 1;
  }
  return counts;
}
