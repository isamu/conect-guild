import { describe, expect, it } from 'vitest';
import {
  at,
  closedIssue,
  issue,
  mergedPr,
  minutesAfter,
  pr,
  snapshot,
  T0,
} from '../domain/fixtures.test-util';
import {
  buildBoard,
  buildFetchStatus,
  buildKingBubble,
  buildParty,
  countWaits,
  EMPTY_CUE_QUEUE,
  formatClock,
  receiveCue,
  sceneCue,
  STATE_LABELS,
  takeCues,
} from './guildView';

describe('buildBoard', () => {
  it('groups open quests: reception first, then departments in the fixed order', () => {
    const snap = snapshot({
      issues: [
        issue(3, { labels: ['総務'] }),
        issue(1, { labels: ['経理'] }),
        issue(2),
        issue(4, { labels: ['企画', '広報'] }),
      ],
    });
    const board = buildBoard(snap);
    expect(board.map((g) => g.key)).toEqual(['reception', '経理', '広報', '総務']);
    expect(board.map((g) => g.label)).toEqual([
      'かなめの受付',
      'みのり（経理）',
      'ひびき（広報）',
      'ささえ（総務）',
    ]);
    const multi = board.find((g) => g.key === '広報')?.quests[0];
    expect(multi).toMatchObject({ number: 4, multiDepartment: true });
  });

  it('leaves closed quests off the board', () => {
    const board = buildBoard(snapshot({ issues: [closedIssue(1, T0, ['経理'])] }));
    expect(board).toEqual([]);
  });

  it('returns no groups for an empty snapshot', () => {
    expect(buildBoard(snapshot())).toEqual([]);
  });
});

describe('countWaits', () => {
  it('counts president waits, kaname waits and the reception separately', () => {
    const snap = snapshot({
      issues: [issue(1, { labels: ['経理'] }), issue(2)],
      prs: [
        pr(10, { linkedIssues: [1], changedFiles: ['accounting/CLAUDE.md'] }),
        pr(11, { linkedIssues: [1], changedFiles: ['a.md'] }),
        pr(12, { headRef: 'misc/x' }),
        mergedPr(13, T0),
      ],
    });
    // reception: Issue #2 (no label) + PR #12 (no department).
    expect(countWaits(snap)).toEqual({ president: 1, kaname: 2, reception: 2 });
  });

  it('is all zero for an empty snapshot', () => {
    expect(countWaits(snapshot())).toEqual({ president: 0, kaname: 0, reception: 0 });
  });
});

describe('buildParty', () => {
  const now = at(minutesAfter(T0, 10));

  it('lists six members: かなめ, the four departments, then the king', () => {
    const rows = buildParty(snapshot(), now);
    expect(rows.map((r) => r.name)).toEqual([
      'かなめ',
      'みのり',
      'ひびき',
      'ひらめ',
      'ささえ',
      'ゆきひろ',
    ]);
  });

  it('labels each department state in Japanese, with recent rewards', () => {
    const snap = snapshot({
      issues: [
        issue(1, { labels: ['経理'] }),
        issue(2, { labels: ['広報'] }),
        issue(3, { labels: ['企画'] }),
        closedIssue(4, T0, ['総務']),
      ],
      prs: [
        pr(10, { linkedIssues: [1], changedFiles: ['CLAUDE.md'] }),
        pr(11, { linkedIssues: [2] }),
        mergedPr(12, T0, { linkedIssues: [4] }),
      ],
    });
    const rows = buildParty(snap, now);
    expect(rows.slice(1, 5).map((r) => [r.stateLabel, r.rewards])).toEqual([
      ['社長の承認まち', 0],
      ['かなめの確認まち', 0],
      ['作業中', 0],
      ['完了', 1],
    ]);
  });

  it('explains idle in the tooltip and leaves busy states without one', () => {
    const rows = buildParty(snapshot({ issues: [issue(1, { labels: ['経理'] })] }), now);
    expect(rows[1]?.tooltip).toBeNull();
    expect(rows[2]?.state).toBe('idle');
    expect(rows[2]?.tooltip).toContain('担当の Issue・PR がありません');
  });
});

describe('buildParty: かなめ and the king', () => {
  const now = at(minutesAfter(T0, 10));

  it('puts the king on 承認まち when a rule-changing PR is open', () => {
    const rows = buildParty(snapshot({ prs: [pr(10, { changedFiles: ['CLAUDE.md'] })] }), now);
    expect(rows[5]).toMatchObject({ state: 'awaiting-president', stateLabel: '承認まち 1 件' });
  });

  it('keeps the king idle without rule-changing PRs', () => {
    const rows = buildParty(snapshot({ prs: [pr(10, { changedFiles: ['a.md'] })] }), now);
    expect(rows[5]).toMatchObject({ state: 'idle', stateLabel: '玉座で待機', rewards: null });
  });

  it('shows かなめ reviewing PRs before reception work, and idle with nothing', () => {
    const reviewing = buildParty(snapshot({ issues: [issue(2)], prs: [pr(10)] }), now)[0];
    expect(reviewing).toMatchObject({ state: 'awaiting-kaname', stateLabel: 'PR の確認 1 件' });
    const reception = buildParty(snapshot({ issues: [issue(2)] }), now)[0];
    expect(reception).toMatchObject({ state: 'working', stateLabel: '受付 1 件' });
    const idle = buildParty(snapshot(), now)[0];
    expect(idle).toMatchObject({ state: 'idle', stateLabel: '受付で待機', rewards: null });
  });

  it('has a Japanese label for every state', () => {
    expect(Object.values(STATE_LABELS)).toEqual([
      '社長の承認まち',
      'かなめの確認まち',
      '作業中',
      '完了',
      '待機中',
    ]);
  });
});

describe('buildFetchStatus', () => {
  const fetchedAt = '2026-10-12T00:00:00Z';

  it('shows nothing before the first success', () => {
    expect(buildFetchStatus(null, null, at(fetchedAt))).toEqual({
      failure: null,
      stale: false,
      fetchedAt: null,
    });
  });

  it('labels a failure while keeping the previous snapshot time', () => {
    const view = buildFetchStatus({ fetchedAt }, 'network', at(fetchedAt));
    expect(view.failure).toBe('取得失敗（つながりません）');
    expect(view.fetchedAt).toBe(formatClock(at(fetchedAt)));
  });

  it('marks the snapshot stale only past five minutes', () => {
    expect(buildFetchStatus({ fetchedAt }, null, at(minutesAfter(fetchedAt, 5))).stale).toBe(false);
    expect(buildFetchStatus({ fetchedAt }, null, at(minutesAfter(fetchedAt, 6))).stale).toBe(true);
  });

  it('labels every failure reason', () => {
    const reasons = ['network', 'timeout', 'http', 'parse', 'invalid', 'schema-version'] as const;
    for (const reason of reasons) {
      expect(buildFetchStatus(null, reason, 0).failure).toMatch(/^取得失敗（.+）$/);
    }
  });
});

describe('formatClock', () => {
  it('pads hours and minutes in local time', () => {
    expect(formatClock(new Date(2026, 9, 12, 7, 5).getTime())).toBe('07:05');
    expect(formatClock(new Date(2026, 9, 12, 23, 59).getTime())).toBe('23:59');
  });
});

describe('buildKingBubble', () => {
  it('waits while a rule-changing PR is open', () => {
    const snap = snapshot({ prs: [pr(10, { changedFiles: ['CLAUDE.md'] }), pr(11)] });
    expect(buildKingBubble(snap)).toEqual({ waiting: true, detail: '承認まち 1 件' });
  });

  it('does not wait for PRs that only need かなめ, or for merged rule changes', () => {
    const snap = snapshot({
      prs: [pr(11), mergedPr(12, T0, { changedFiles: ['CLAUDE.md'] })],
    });
    expect(buildKingBubble(snap)).toEqual({ waiting: false, detail: '承認まちの PR はありません' });
  });

  it('does not wait before the first snapshot', () => {
    expect(buildKingBubble(null)).toEqual({ waiting: false, detail: null });
  });
});

describe('sceneCue', () => {
  const closed = {
    id: 'issue-closed#98',
    kind: 'issue-closed',
    number: 98,
    department: '総務',
  } as const;

  it('cues the event of the message in the window, keyed by the message id', () => {
    expect(sceneCue({ id: 7, text: 'クリアした！', event: closed })).toEqual({
      id: 7,
      event: closed,
    });
  });

  it('cues nothing for a notice or an empty window', () => {
    expect(sceneCue({ id: 8, text: 'この期間の出来事は復元できません', event: null })).toBeNull();
    expect(sceneCue(null)).toBeNull();
  });
});

describe('receiveCue / takeCues', () => {
  const event = {
    id: 'pr-merged#5',
    kind: 'pr-merged',
    number: 5,
    department: '経理',
  } as const;
  const first = { id: 3, event };
  const second = { id: 4, event: { ...event, id: 'pr-merged#6', number: 6 } };

  it('plays a cue that arrived before the loop ran', () => {
    const { play } = takeCues(receiveCue(EMPTY_CUE_QUEUE, first));
    expect(play).toEqual([first]);
  });

  it('keeps every cue that arrived while the pictures loaded, in order', () => {
    const queue = receiveCue(receiveCue(EMPTY_CUE_QUEUE, first), second);
    expect(takeCues(queue).play).toEqual([first, second]);
  });

  it('does not queue the same message twice', () => {
    const once = receiveCue(EMPTY_CUE_QUEUE, first);
    expect(receiveCue(once, first)).toBe(once);
    const played = takeCues(once).queue;
    expect(takeCues(receiveCue(played, first)).play).toEqual([]);
  });

  it('queues nothing without a cue, and empties the queue once taken', () => {
    expect(receiveCue(EMPTY_CUE_QUEUE, null)).toBe(EMPTY_CUE_QUEUE);
    const { queue } = takeCues(receiveCue(EMPTY_CUE_QUEUE, first));
    expect(queue).toEqual({ lastId: 3, waiting: [] });
    expect(takeCues(queue).play).toEqual([]);
  });

  it('queues a message again after another one (a new message id)', () => {
    const queue = takeCues(receiveCue(EMPTY_CUE_QUEUE, first)).queue;
    expect(takeCues(receiveCue(queue, second)).play).toEqual([second]);
  });
});
