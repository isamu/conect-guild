import { describe, expect, it } from 'vitest';
import type { MemberState } from './party';
import {
  assignPr,
  departmentFromBranch,
  deriveMemberStatuses,
  indexIssues,
  isRuleChangePath,
  prWaitKind,
} from './party';
import { T0, at, closedIssue, issue, mergedPr, minutesAfter, pr } from './fixtures.test-util';

describe('isRuleChangePath', () => {
  it.each(['CLAUDE.md', 'pr/CLAUDE.md', '.claude/agents/pr.md'])('matches %s', (path) => {
    expect(isRuleChangePath(path)).toBe(true);
  });

  it.each(['accounting/CLAUDE.md', 'projects/CLAUDE.md', 'a/b/CLAUDE.md', '.claude/agents/x/y.md'])(
    'matches %s too',
    (path) => {
      expect(isRuleChangePath(path)).toBe(true);
    },
  );

  it.each([
    'CLAUDE.md.bak',
    'docs/MYCLAUDE.md',
    'x/.claude/agents/a.md',
    'claude.md',
    'CLAUDE.local.md',
    '.claude/agents',
    '.claude/settings.json',
    '',
  ])('does not match %s', (path) => {
    expect(isRuleChangePath(path)).toBe(false);
  });

  it('treats glob characters literally', () => {
    expect(isRuleChangePath('*/CLAUDE.md')).toBe(true);
    expect(isRuleChangePath('**')).toBe(false);
    expect(isRuleChangePath('.claude/agents*')).toBe(false);
  });
});

describe('prWaitKind', () => {
  it('waits for the president when any changed file is a rule change', () => {
    expect(prWaitKind(pr(1, { changedFiles: ['README.md', 'pr/CLAUDE.md'] }))).toBe('president');
  });

  it('waits for かなめ otherwise, including with no changed files', () => {
    expect(prWaitKind(pr(1, { changedFiles: ['docs/MYCLAUDE.md'] }))).toBe('kaname');
    expect(prWaitKind(pr(1))).toBe('kaname');
  });

  it('waits for no one once closed', () => {
    expect(prWaitKind(pr(1, { state: 'closed', changedFiles: ['CLAUDE.md'] }))).toBeNull();
    expect(prWaitKind(mergedPr(2, T0))).toBeNull();
  });
});

describe('departmentFromBranch', () => {
  it.each([
    ['accounting/october', '経理'],
    ['docs/accounting-closing', '経理'],
    ['pr/newsletter', '広報'],
    ['planning/next-month', '企画'],
    ['general-affairs/desk', '総務'],
  ] as const)('maps %s to %s', (ref, department) => {
    expect(departmentFromBranch(ref)).toBe(department);
  });

  it.each(['main', 'feat/something', 'accounting', 'xaccounting/foo', 'docs/daily-log'])(
    'finds nothing for %s',
    (ref) => {
      expect(departmentFromBranch(ref)).toBeNull();
    },
  );
});

describe('assignPr', () => {
  const issues = indexIssues([
    issue(10, { labels: ['総務'] }),
    issue(11, { labels: ['広報', 'bug'] }),
    issue(12, { labels: ['bug'] }),
  ]);

  it('uses the department label of a linked Issue', () => {
    expect(assignPr(pr(1, { linkedIssues: [10] }), issues)).toEqual({
      department: '総務',
      source: 'linked-issue',
    });
  });

  it('uses the fixed order across several linked Issues', () => {
    expect(assignPr(pr(1, { linkedIssues: [10, 11] }), issues).department).toBe('広報');
  });

  it('prefers the linked Issue over the branch prefix', () => {
    const linked = pr(1, { linkedIssues: [10], headRef: 'accounting/x' });
    expect(assignPr(linked, issues).department).toBe('総務');
  });

  it('falls back to the branch prefix when linked Issues are missing or unlabelled', () => {
    expect(assignPr(pr(1, { linkedIssues: [999], headRef: 'planning/x' }), issues)).toEqual({
      department: '企画',
      source: 'branch-prefix',
    });
    expect(assignPr(pr(1, { linkedIssues: [12], headRef: 'pr/x' }), issues).department).toBe(
      '広報',
    );
  });

  it('gives up as unknown when nothing matches', () => {
    expect(assignPr(pr(1, { linkedIssues: [12] }), issues)).toEqual({
      department: null,
      source: 'unknown',
    });
  });
});

const NOW = at('2026-10-12T12:00:00Z');
const ago = (minutes: number): string => minutesAfter('2026-10-12T12:00:00Z', -minutes);

function stateOf(
  department: string,
  input: Parameters<typeof deriveMemberStatuses>[0],
  now = NOW,
): MemberState | undefined {
  return deriveMemberStatuses(input, now).find((s) => s.department === department)?.state;
}

describe('deriveMemberStatuses: priority', () => {
  it('lists the four department members in the fixed order', () => {
    const statuses = deriveMemberStatuses({ issues: [], prs: [] }, NOW);
    expect(statuses.map((s) => [s.department, s.memberId])).toEqual([
      ['経理', 'minori'],
      ['広報', 'hibiki'],
      ['企画', 'hirame'],
      ['総務', 'sasae'],
    ]);
  });

  it('is idle with a reason when nothing is assigned', () => {
    const [first] = deriveMemberStatuses({ issues: [], prs: [] }, NOW);
    expect(first?.state).toBe('idle');
    expect(first?.reason).toBe('担当の Issue・PR がありません');
  });

  it('puts the president approval first, over every other state', () => {
    const input = {
      issues: [issue(1, { labels: ['経理'] }), closedIssue(2, ago(1), ['経理'])],
      prs: [
        pr(3, { linkedIssues: [1] }),
        pr(4, { linkedIssues: [1], changedFiles: ['CLAUDE.md'] }),
      ],
    };
    expect(stateOf('経理', input)).toBe('awaiting-president');
  });

  it('waits for かなめ when an open PR has no rule change, over working and done', () => {
    const input = {
      issues: [issue(1, { labels: ['広報'] }), closedIssue(2, ago(1), ['広報'])],
      prs: [pr(3, { linkedIssues: [1], changedFiles: ['docs/a.md'] })],
    };
    expect(stateOf('広報', input)).toBe('awaiting-kaname');
  });

  it('is working with an open Issue, over done', () => {
    const input = {
      issues: [issue(1, { labels: ['企画'] }), closedIssue(2, ago(1), ['企画'])],
      prs: [],
    };
    expect(stateOf('企画', input)).toBe('working');
  });
});

describe('deriveMemberStatuses: done and assignment', () => {
  it('is done when an Issue closed within the window, inclusive of the edge', () => {
    const input = (closedAt: string) => ({ issues: [closedIssue(1, closedAt, ['総務'])], prs: [] });
    expect(stateOf('総務', input(ago(0)))).toBe('done');
    expect(stateOf('総務', input(ago(30)))).toBe('done');
    expect(stateOf('総務', input(ago(31)))).toBe('idle');
  });

  it('honours a custom done window', () => {
    const input = { issues: [closedIssue(1, ago(50), ['経理'])], prs: [] };
    expect(deriveMemberStatuses(input, NOW, 60 * 60_000)[0]?.state).toBe('done');
  });

  it('ignores merged and closed PRs for the waiting states', () => {
    const input = {
      issues: [],
      prs: [
        mergedPr(1, ago(1), { headRef: 'accounting/x', changedFiles: [] }),
        pr(2, { state: 'closed', headRef: 'accounting/y', closedAt: ago(1) }),
      ],
    };
    expect(stateOf('経理', input)).toBe('idle');
  });

  it('assigns PRs by branch prefix when no Issue is linked', () => {
    const input = { issues: [], prs: [pr(1, { headRef: 'planning/x' })] };
    expect(stateOf('企画', input)).toBe('awaiting-kaname');
  });

  it('gives a multi-department Issue to the first department only', () => {
    const input = { issues: [issue(1, { labels: ['総務', '広報'] })], prs: [] };
    expect(stateOf('広報', input)).toBe('working');
    expect(stateOf('総務', input)).toBe('idle');
  });
});

describe('deriveMemberStatuses: idle reasons and time', () => {
  it('explains idle when Issues or PRs cannot be assigned (unknown labels only)', () => {
    const input = {
      issues: [issue(1, { labels: ['bug'] }), issue(2), closedIssue(3, ago(1), ['bug'])],
      prs: [pr(4), mergedPr(5, ago(1))],
    };
    const statuses = deriveMemberStatuses(input, NOW);
    expect(statuses.every((s) => s.state === 'idle')).toBe(true);
    expect(statuses[0]?.reason).toBe(
      '担当の Issue・PR がありません。担当を判定できない Issue 2 件・PR 1 件はかなめの受付にあります',
    );
  });

  it('explains idle when a closed Issue has no closing time', () => {
    const input = { issues: [issue(1, { labels: ['経理'], state: 'closed' })], prs: [] };
    const [minori] = deriveMemberStatuses(input, NOW);
    expect(minori?.state).toBe('idle');
    expect(minori?.reason).toContain('閉じた時刻が分からない Issue が 1 件あります');
  });

  it('has no reason outside idle', () => {
    const input = { issues: [issue(1, { labels: ['経理'] })], prs: [] };
    expect(deriveMemberStatuses(input, NOW)[0]?.reason).toBeNull();
  });

  it('does not depend on the wall clock', () => {
    const input = { issues: [closedIssue(1, T0, ['経理'])], prs: [] };
    expect(stateOf('経理', input, at(T0) + 60_000)).toBe('done');
    expect(stateOf('経理', input, at(T0) + 31 * 60_000)).toBe('idle');
  });
});
