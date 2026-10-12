import { type HistoryPr, type SnapshotHistory } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { closedIssue, issue, snapshot, T0 } from './fixtures.test-util';
import {
  countXp,
  departmentOfMergedPr,
  levelOf,
  MAX_LEVEL,
  NO_XP,
  xpForLevel,
  XP_PER,
  type XpTally,
} from './xp';

function history(over: Partial<SnapshotHistory> = {}): SnapshotHistory {
  return { openedIssueCount: 0, completedIssues: [], mergedPrs: [], ...over };
}

function merged(number: number, over: Partial<HistoryPr> = {}): HistoryPr {
  return { number, linkedIssues: [], branchDepartment: null, ...over };
}

function xpOf(
  input: Parameters<typeof countXp>[0],
  label: '経理' | '広報' | '企画' | '総務',
): XpTally {
  return countXp(input).departments.get(label) ?? NO_XP;
}

describe('xpForLevel', () => {
  it('is 5 × L × (L − 1)', () => {
    expect([1, 2, 3, 5, 10, 99].map(xpForLevel)).toEqual([0, 10, 30, 100, 450, 48_510]);
  });
});

describe('levelOf', () => {
  it('starts at level 1 with no experience', () => {
    expect(levelOf(0)).toEqual({ level: 1, xp: 0, toNext: 10, progress: 0 });
  });

  it('reaches a level exactly at its threshold, not one point before', () => {
    expect(levelOf(9)).toEqual({ level: 1, xp: 9, toNext: 1, progress: 0.9 });
    expect(levelOf(10)).toEqual({ level: 2, xp: 10, toNext: 20, progress: 0 });
    expect(levelOf(29).level).toBe(2);
    expect(levelOf(30)).toEqual({ level: 3, xp: 30, toNext: 30, progress: 0 });
  });

  it('measures the way to the next level within the current one', () => {
    expect(levelOf(45)).toEqual({ level: 3, xp: 45, toNext: 15, progress: 0.5 });
  });

  it('stops at level 99, with nothing more to go', () => {
    const top = xpForLevel(MAX_LEVEL);
    expect(levelOf(top - 1)).toMatchObject({ level: 98, toNext: 1 });
    expect(levelOf(top)).toEqual({ level: 99, xp: top, toNext: null, progress: 1 });
    expect(levelOf(top * 10)).toEqual({ level: 99, xp: top * 10, toNext: null, progress: 1 });
  });
});

describe('countXp for completed Issues', () => {
  it('gives no one experience with an empty history', () => {
    const xp = countXp(snapshot());
    expect(xp.kaname).toEqual(NO_XP);
    expect([...xp.departments.keys()]).toEqual(['経理', '広報', '企画', '総務']);
    expect([...xp.departments.values()]).toEqual([NO_XP, NO_XP, NO_XP, NO_XP]);
  });

  it('gives 10 per completed Issue to its department, the first in the fixed order', () => {
    const input = snapshot({
      history: history({
        openedIssueCount: 3,
        completedIssues: [
          { number: 1, departments: ['経理'] },
          { number: 2, departments: ['広報', '総務'] },
          { number: 3, departments: ['広報'] },
        ],
      }),
    });
    expect(xpOf(input, '経理')).toEqual({ xp: 10, clears: 1, merges: 0, scrolls: 0 });
    expect(xpOf(input, '広報')).toEqual({ xp: 20, clears: 2, merges: 0, scrolls: 0 });
    expect(xpOf(input, '総務')).toEqual(NO_XP);
  });
});

describe('countXp for merged PRs', () => {
  it('gives 5 per merged PR, by its linked Issue, then its branch', () => {
    const input = snapshot({
      history: history({
        openedIssueCount: 1,
        completedIssues: [{ number: 1, departments: ['企画'] }],
        mergedPrs: [
          merged(10, { linkedIssues: [1], branchDepartment: '経理' }),
          merged(11, { branchDepartment: '経理' }),
        ],
      }),
    });
    expect(xpOf(input, '企画')).toEqual({ xp: 15, clears: 1, merges: 1, scrolls: 0 });
    expect(xpOf(input, '経理')).toEqual({ xp: 5, clears: 0, merges: 1, scrolls: 0 });
  });

  it('gives a PR linked to several Issues to the first department in the fixed order', () => {
    const input = snapshot({
      history: history({
        openedIssueCount: 2,
        completedIssues: [
          { number: 1, departments: ['総務'] },
          { number: 2, departments: ['広報'] },
        ],
        mergedPrs: [merged(10, { linkedIssues: [1, 2] })],
      }),
    });
    expect(xpOf(input, '広報').merges).toBe(1);
    expect(xpOf(input, '総務').merges).toBe(0);
  });

  it('finds a linked Issue still open (or not completed) among the listed Issues', () => {
    const input = snapshot({
      issues: [issue(5, { labels: ['総務', 'bug'] })],
      history: history({ openedIssueCount: 1, mergedPrs: [merged(10, { linkedIssues: [5] })] }),
    });
    expect(xpOf(input, '総務')).toEqual({ xp: 5, clears: 0, merges: 1, scrolls: 0 });
  });

  it('falls back to the branch when the linked Issue has no department or is unknown', () => {
    const input = snapshot({
      issues: [issue(5)],
      history: history({
        openedIssueCount: 1,
        mergedPrs: [
          merged(10, { linkedIssues: [5], branchDepartment: '経理' }),
          merged(11, { linkedIssues: [404], branchDepartment: '経理' }),
        ],
      }),
    });
    expect(xpOf(input, '経理').merges).toBe(2);
  });

  it('counts a PR with no department for no one (not for かなめ either)', () => {
    const input = snapshot({
      history: history({ openedIssueCount: 1, mergedPrs: [merged(10, { linkedIssues: [404] })] }),
    });
    const xp = countXp(input);
    expect(xp.kaname).toEqual({ xp: 3, clears: 0, merges: 0, scrolls: 1 });
    expect([...xp.departments.values()].every((t) => t.merges === 0)).toBe(true);
  });
});

describe('countXp for かなめ and what is not counted', () => {
  it('gives かなめ 3 per opened Issue and 10 per completed Issue with no department', () => {
    const input = snapshot({
      history: history({
        openedIssueCount: 5,
        completedIssues: [
          { number: 1, departments: [] },
          { number: 2, departments: [] },
          { number: 3, departments: ['経理'] },
        ],
      }),
    });
    expect(countXp(input).kaname).toEqual({
      xp: 5 * XP_PER.scroll + 2 * XP_PER.clear,
      clears: 2,
      merges: 0,
      scrolls: 5,
    });
    expect(xpOf(input, '経理').clears).toBe(1);
  });

  it('counts only the history: an Issue closed as not planned (listed, not completed) is worth nothing', () => {
    // The collector leaves not planned / duplicate closes out of completedIssues
    // (packages/collector/src/build.history.test.ts); the listed Issues are not counted as clears.
    const input = snapshot({
      issues: [closedIssue(7, T0, ['経理']), closedIssue(8, T0)],
      history: history({ openedIssueCount: 2 }),
    });
    expect(xpOf(input, '経理')).toEqual(NO_XP);
    expect(countXp(input).kaname).toEqual({ xp: 6, clears: 0, merges: 0, scrolls: 2 });
  });
});

describe('departmentOfMergedPr', () => {
  it('prefers the linked Issues over the branch', () => {
    const labels = new Map([[1, ['広報']]]);
    expect(
      departmentOfMergedPr(merged(9, { linkedIssues: [1], branchDepartment: '経理' }), labels),
    ).toBe('広報');
  });

  it('is null with no labelled link and no branch department', () => {
    expect(
      departmentOfMergedPr(merged(9, { linkedIssues: [1] }), new Map([[1, ['bug']]])),
    ).toBeNull();
  });
});
