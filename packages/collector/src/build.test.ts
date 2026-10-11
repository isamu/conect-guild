import { describe, expect, it } from 'vitest';
import { recentCutoff, selectRecentPrs, toSnapshotIssues, toSnapshotPr } from './build.ts';
import type { RawIssue, RawPr } from './github.ts';

const NOW = new Date('2026-10-12T00:00:00.000Z');
const CUTOFF = recentCutoff(NOW);

function issue(patch: Partial<RawIssue>): RawIssue {
  return {
    number: 1,
    title: 'Issue',
    state: 'open',
    labels: [{ name: '経理' }],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    closed_at: null,
    ...patch,
  };
}

function pr(patch: Partial<RawPr>): RawPr {
  return {
    number: 10,
    title: 'PR (#1)',
    body: 'Body text',
    state: 'open',
    merged_at: null,
    closed_at: null,
    head: { ref: 'accounting/x' },
    ...patch,
  };
}

describe('recentCutoff', () => {
  it('is exactly 7 days before now', () => {
    expect(CUTOFF.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});

describe('toSnapshotIssues', () => {
  it('maps fields to the snapshot shape with normalized ISO times', () => {
    expect(toSnapshotIssues([issue({})], CUTOFF)).toEqual([
      {
        number: 1,
        title: 'Issue',
        labels: ['経理'],
        state: 'open',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
        closedAt: null,
      },
    ]);
  });

  it('drops pull requests mixed into the issues list', () => {
    const items = [issue({ number: 1 }), issue({ number: 2, pull_request: { url: 'x' } })];
    expect(toSnapshotIssues(items, CUTOFF).map((i) => i.number)).toEqual([1]);
  });

  it('keeps closed issues only when closed_at is within 7 days (boundary inclusive)', () => {
    const items = [
      issue({ number: 1, state: 'closed', closed_at: '2026-10-05T00:00:00Z' }),
      issue({ number: 2, state: 'closed', closed_at: '2026-10-04T23:59:59Z' }),
      issue({ number: 3, state: 'closed', closed_at: null }),
      issue({ number: 4, state: 'open', created_at: '2020-01-01T00:00:00Z' }),
    ];
    expect(toSnapshotIssues(items, CUTOFF).map((i) => i.number)).toEqual([1, 4]);
  });

  it('keeps one entry per number when an issue appears in both lists', () => {
    const items = [
      issue({ number: 5 }),
      issue({ number: 5, state: 'closed', closed_at: '2026-10-11T00:00:00Z' }),
    ];
    expect(toSnapshotIssues(items, CUTOFF)).toHaveLength(1);
  });
});

describe('selectRecentPrs', () => {
  it('keeps open PRs and PRs closed or merged within 7 days', () => {
    const items = [
      pr({ number: 1 }),
      pr({
        number: 2,
        state: 'closed',
        merged_at: '2026-10-10T00:00:00Z',
        closed_at: '2026-10-10T00:00:00Z',
      }),
      pr({ number: 3, state: 'closed', closed_at: '2026-10-06T00:00:00Z' }),
      pr({ number: 4, state: 'closed', closed_at: '2026-09-01T00:00:00Z' }),
      pr({ number: 1 }),
    ];
    expect(selectRecentPrs(items, CUTOFF).map((p) => p.number)).toEqual([1, 2, 3]);
  });
});

describe('toSnapshotPr', () => {
  it('stores links and changed files for an open PR, never the body', () => {
    const result = toSnapshotPr(pr({ body: 'Closes #7' }), 'o/r', ['a.md']);
    expect(result).toEqual({
      number: 10,
      title: 'PR (#1)',
      state: 'open',
      mergedAt: null,
      closedAt: null,
      headRef: 'accounting/x',
      linkedIssues: [7],
      changedFiles: ['a.md'],
    });
    expect(JSON.stringify(result)).not.toContain('Closes');
  });

  it('gives closed PRs no changed files', () => {
    const closed = pr({
      state: 'closed',
      merged_at: '2026-10-10T00:00:00Z',
      closed_at: '2026-10-10T00:00:00Z',
    });
    const result = toSnapshotPr(closed, 'o/r', ['a.md']);
    expect(result.changedFiles).toEqual([]);
    expect(result.mergedAt).toBe('2026-10-10T00:00:00.000Z');
  });
});
