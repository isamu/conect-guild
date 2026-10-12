import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@conect-guild/snapshot';
import { toBaseline, type Baseline } from './baseline';
import { GAP_NOTICE_MESSAGE, diffSnapshot, type DiffResult } from './events';
import { T0, closedIssue, issue, mergedPr, minutesAfter, pr, snapshot } from './fixtures.test-util';

const T1 = minutesAfter(T0, 1);
const LATER = minutesAfter(T0, 2);

function baselineOf(over: Partial<Snapshot>): Baseline {
  return toBaseline(snapshot({ fetchedAt: T0, ...over }));
}

function ids(result: DiffResult): string[] {
  return result.events.map((e) => e.id);
}

describe('diffSnapshot: when to stay quiet', () => {
  it('stores the first snapshot without events', () => {
    const next = snapshot({ fetchedAt: T1, issues: [issue(1), closedIssue(2, T1)] });
    const result = diffSnapshot(null, next);
    expect(result.events).toEqual([]);
    expect(result.notice).toBeNull();
    expect(result.baselineUpdate).toEqual({ action: 'replace', baseline: toBaseline(next) });
  });

  it('never rewinds: an older or equal fetchedAt changes nothing', () => {
    const base = baselineOf({ issues: [issue(1)] });
    for (const fetchedAt of [T0, minutesAfter(T0, -1)]) {
      const result = diffSnapshot(base, snapshot({ fetchedAt, issues: [closedIssue(1, T0)] }));
      expect(result).toEqual({ events: [], baselineUpdate: { action: 'keep' }, notice: null });
    }
  });

  it('skips events after a gap of more than 7 days and says so', () => {
    const base = baselineOf({ issues: [issue(1)] });
    const next = snapshot({
      fetchedAt: minutesAfter(T0, 7 * 24 * 60 + 1),
      issues: [closedIssue(1, T1)],
    });
    const result = diffSnapshot(base, next);
    expect(result.events).toEqual([]);
    expect(result.notice).toEqual({ kind: 'gap-unrecoverable', message: GAP_NOTICE_MESSAGE });
    expect(GAP_NOTICE_MESSAGE).toBe('この期間の出来事は復元できません');
    expect(result.baselineUpdate).toEqual({ action: 'replace', baseline: toBaseline(next) });
  });

  it('still diffs at exactly 7 days', () => {
    const base = baselineOf({ issues: [issue(1)] });
    const next = snapshot({
      fetchedAt: minutesAfter(T0, 7 * 24 * 60),
      issues: [closedIssue(1, T1)],
    });
    const result = diffSnapshot(base, next);
    expect(ids(result)).toEqual(['issue-closed#1']);
    expect(result.notice).toBeNull();
  });

  it('honours a custom gap limit', () => {
    const base = baselineOf({ issues: [issue(1)] });
    const result = diffSnapshot(
      base,
      snapshot({ fetchedAt: LATER, issues: [closedIssue(1, T1)] }),
      60_000,
    );
    expect(result.events).toEqual([]);
    expect(result.notice?.kind).toBe('gap-unrecoverable');
  });

  it('emits nothing when nothing changed, but still moves the baseline forward', () => {
    const issues = [issue(1), closedIssue(2, T0)];
    const prs = [pr(3), mergedPr(4, T0)];
    const next = snapshot({ fetchedAt: T1, issues, prs });
    const result = diffSnapshot(baselineOf({ issues, prs }), next);
    expect(result.events).toEqual([]);
    expect(result.baselineUpdate).toEqual({ action: 'replace', baseline: toBaseline(next) });
  });
});

describe('diffSnapshot: another repository', () => {
  it('treats a baseline of another repository as the first load', () => {
    const base = baselineOf({ repo: 'old-team/company', issues: [issue(1)], prs: [pr(3)] });
    const next = snapshot({
      fetchedAt: T1,
      repo: 'new-team/company',
      issues: [closedIssue(1, T1), issue(2)],
      prs: [mergedPr(3, T1)],
    });
    const result = diffSnapshot(base, next);
    expect(result.events).toEqual([]);
    expect(result.notice).toBeNull();
    expect(result.baselineUpdate).toEqual({ action: 'replace', baseline: toBaseline(next) });
  });
});

describe('diffSnapshot: Issue events', () => {
  it('opens a quest for a new open Issue with its department', () => {
    const result = diffSnapshot(
      baselineOf({}),
      snapshot({ fetchedAt: T1, issues: [issue(5, { labels: ['企画'] }), issue(6)] }),
    );
    expect(result.events).toEqual([
      { id: 'issue-opened#5', kind: 'issue-opened', number: 5, department: '企画' },
      { id: 'issue-opened#6', kind: 'issue-opened', number: 6, department: null },
    ]);
  });

  it('clears a quest that was open in the baseline', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [issue(1)] }),
      snapshot({ fetchedAt: T1, issues: [closedIssue(1, T1, ['総務', '経理'])] }),
    );
    expect(result.events).toEqual([
      { id: 'issue-closed#1', kind: 'issue-closed', number: 1, department: '経理' },
    ]);
  });

  it('does not clear again what the baseline already had closed', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [closedIssue(1, T0)] }),
      snapshot({ fetchedAt: T1, issues: [closedIssue(1, T0)] }),
    );
    expect(result.events).toEqual([]);
  });
});

describe('diffSnapshot: Issues closed between fetches', () => {
  it('clears again an Issue reopened and closed again between fetches', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [closedIssue(1, minutesAfter(T0, -60))] }),
      snapshot({ fetchedAt: LATER, issues: [closedIssue(1, T1)] }),
    );
    expect(ids(result)).toEqual(['issue-closed#1']);
  });

  it('does not clear an Issue still open after being closed in the baseline', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [closedIssue(1, T0)] }),
      snapshot({ fetchedAt: T1, issues: [issue(1)] }),
    );
    expect(result.events).toEqual([]);
  });

  it('shows only the clear for an Issue opened and closed between fetches', () => {
    const result = diffSnapshot(
      baselineOf({}),
      snapshot({ fetchedAt: LATER, issues: [closedIssue(9, T1)] }),
    );
    expect(ids(result)).toEqual(['issue-closed#9']);
  });

  it('ignores an unknown closed Issue that closed before the baseline', () => {
    const result = diffSnapshot(
      baselineOf({}),
      snapshot({
        fetchedAt: T1,
        issues: [closedIssue(9, T0), closedIssue(10, minutesAfter(T0, -5))],
      }),
    );
    expect(result.events).toEqual([]);
  });

  it('ignores an unknown closed Issue with no closing time', () => {
    const result = diffSnapshot(
      baselineOf({}),
      snapshot({ fetchedAt: T1, issues: [issue(9, { state: 'closed' })] }),
    );
    expect(result.events).toEqual([]);
  });

  it('does not treat a reopened Issue as new', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [closedIssue(1, T0)] }),
      snapshot({ fetchedAt: T1, issues: [issue(1)] }),
    );
    expect(result.events).toEqual([]);
  });
});

describe('diffSnapshot: PR events', () => {
  it('brings the treasure home for a PR merged since the baseline', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [issue(1, { labels: ['広報'] })], prs: [pr(2, { linkedIssues: [1] })] }),
      snapshot({
        fetchedAt: T1,
        issues: [issue(1, { labels: ['広報'] })],
        prs: [mergedPr(2, T1, { linkedIssues: [1] })],
      }),
    );
    expect(result.events).toEqual([
      { id: 'pr-merged#2', kind: 'pr-merged', number: 2, department: '広報' },
    ]);
  });

  it('shows the return for a merged PR missing from the baseline only if merged after it', () => {
    const result = diffSnapshot(
      baselineOf({}),
      snapshot({
        fetchedAt: LATER,
        prs: [
          mergedPr(3, T1, { headRef: 'pr/a' }),
          mergedPr(4, T0),
          mergedPr(5, minutesAfter(T0, -9)),
        ],
      }),
    );
    expect(result.events).toEqual([
      { id: 'pr-merged#3', kind: 'pr-merged', number: 3, department: '広報' },
    ]);
  });

  it('ignores new open PRs and PRs closed without merging', () => {
    const result = diffSnapshot(
      baselineOf({ prs: [pr(1)] }),
      snapshot({ fetchedAt: T1, prs: [pr(1, { state: 'closed', closedAt: T1 }), pr(2)] }),
    );
    expect(result.events).toEqual([]);
  });
});

describe('diffSnapshot: order and duplicates', () => {
  it('orders events: opened, merged, closed, then by number', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [issue(1), issue(2)], prs: [pr(7)] }),
      snapshot({
        fetchedAt: T1,
        issues: [closedIssue(2, T1), closedIssue(1, T1), issue(4), issue(3)],
        prs: [mergedPr(7, T1)],
      }),
    );
    expect(ids(result)).toEqual([
      'issue-opened#3',
      'issue-opened#4',
      'pr-merged#7',
      'issue-closed#1',
      'issue-closed#2',
    ]);
  });

  it('never emits the same id twice, even for duplicated entries', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [issue(1)] }),
      snapshot({
        fetchedAt: T1,
        issues: [closedIssue(1, T1), closedIssue(1, T1)],
        prs: [mergedPr(1, T1), mergedPr(1, T1)],
      }),
    );
    expect(ids(result)).toEqual(['pr-merged#1', 'issue-closed#1']);
  });

  it('does not repeat events once the caller stores the new baseline', () => {
    const next = snapshot({ fetchedAt: T1, issues: [closedIssue(1, T1)] });
    const first = diffSnapshot(baselineOf({ issues: [issue(1)] }), next);
    expect(ids(first)).toEqual(['issue-closed#1']);
    if (first.baselineUpdate.action !== 'replace') throw new Error('expected a replace');
    const again = diffSnapshot(first.baselineUpdate.baseline, { ...next, fetchedAt: LATER });
    expect(again.events).toEqual([]);
  });
});

describe('diffSnapshot: Issues closed in both the baseline and the snapshot', () => {
  it('does not clear again a closedAt newer than the baseline that has not changed', () => {
    // A closedAt later than the baseline's fetchedAt (clock skew, sample data) stays the same.
    const future = minutesAfter(T0, 600);
    const base = baselineOf({ issues: [closedIssue(1, future)] });
    for (const fetchedAt of [T1, LATER]) {
      const result = diffSnapshot(base, snapshot({ fetchedAt, issues: [closedIssue(1, future)] }));
      expect(result.events).toEqual([]);
    }
  });

  it('clears again when the closedAt moved later (reopened and closed again)', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [closedIssue(1, minutesAfter(T0, -5))] }),
      snapshot({ fetchedAt: T1, issues: [closedIssue(1, minutesAfter(T0, 600))] }),
    );
    expect(ids(result)).toEqual(['issue-closed#1']);
  });

  it('does not clear when the closedAt moved earlier (not a new close)', () => {
    const result = diffSnapshot(
      baselineOf({ issues: [closedIssue(1, minutesAfter(T0, 600))] }),
      snapshot({ fetchedAt: T1, issues: [closedIssue(1, minutesAfter(T0, -5))] }),
    );
    expect(result.events).toEqual([]);
  });

  it('does not clear when either closedAt is unknown', () => {
    const unknown = issue(1, { state: 'closed', closedAt: null });
    expect(
      diffSnapshot(
        baselineOf({ issues: [unknown] }),
        snapshot({ fetchedAt: T1, issues: [closedIssue(1, T1)] }),
      ).events,
    ).toEqual([]);
    expect(
      diffSnapshot(
        baselineOf({ issues: [closedIssue(1, T0)] }),
        snapshot({ fetchedAt: T1, issues: [unknown] }),
      ).events,
    ).toEqual([]);
  });
});
