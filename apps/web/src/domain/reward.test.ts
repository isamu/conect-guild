import { describe, expect, it } from 'vitest';
import { at, issue, mergedPr, minutesAfter, pr, snapshot } from './fixtures.test-util';
import { countRecentRewards } from './reward';

const NOW_ISO = '2026-10-12T12:00:00Z';
const NOW = at(NOW_ISO);
const DAY = 24 * 60;
const ago = (minutes: number): string => minutesAfter(NOW_ISO, -minutes);

describe('countRecentRewards', () => {
  it('is zero for everyone with no PRs', () => {
    expect(countRecentRewards(snapshot(), NOW)).toEqual({ 経理: 0, 広報: 0, 企画: 0, 総務: 0 });
  });

  it('counts merged PRs per assigned department', () => {
    const input = snapshot({
      issues: [issue(1, { labels: ['広報'] })],
      prs: [
        mergedPr(10, ago(60), { linkedIssues: [1] }),
        mergedPr(11, ago(DAY), { linkedIssues: [1] }),
        mergedPr(12, ago(5), { headRef: 'accounting/x' }),
      ],
    });
    expect(countRecentRewards(input, NOW)).toEqual({ 経理: 1, 広報: 2, 企画: 0, 総務: 0 });
  });

  it('keeps the 7-day edge and drops anything older', () => {
    const input = snapshot({
      prs: [
        mergedPr(1, ago(7 * DAY), { headRef: 'planning/a' }),
        mergedPr(2, ago(7 * DAY + 1), { headRef: 'planning/b' }),
      ],
    });
    expect(countRecentRewards(input, NOW).企画).toBe(1);
  });

  it('ignores open, closed-unmerged and unassigned PRs', () => {
    const input = snapshot({
      prs: [
        pr(1, { headRef: 'planning/a' }),
        pr(2, { state: 'closed', closedAt: ago(1), headRef: 'planning/b' }),
        mergedPr(3, ago(1), { headRef: 'feat/unknown' }),
      ],
    });
    expect(countRecentRewards(input, NOW)).toEqual({ 経理: 0, 広報: 0, 企画: 0, 総務: 0 });
  });

  it('shrinks as time passes and honours a custom window', () => {
    const input = snapshot({ prs: [mergedPr(1, ago(60), { headRef: 'pr/a' })] });
    expect(countRecentRewards(input, NOW + 7 * DAY * 60_000).広報).toBe(0);
    expect(countRecentRewards(input, NOW, 30 * 60_000).広報).toBe(0);
    expect(countRecentRewards(input, NOW, 60 * 60_000).広報).toBe(1);
  });
});
