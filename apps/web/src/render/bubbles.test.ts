import { describe, expect, it } from 'vitest';
import { issue, pr } from '../domain/fixtures.test-util';
import { deriveMemberStatuses, type MemberState } from '../domain/party';
import type { LiveStates } from '../domain/session';
import { bubbleFor, bubblesOf } from './bubbles';

const STATES: readonly MemberState[] = [
  'awaiting-permission',
  'awaiting-president',
  'awaiting-kaname',
  'busy',
  'working',
  'done',
  'idle',
];

const WAITING: readonly MemberState[] = [
  'awaiting-permission',
  'awaiting-president',
  'awaiting-kaname',
];

describe('bubbleFor', () => {
  it.each(STATES)('gives a department member in %s the matching bubble or none', (state) => {
    const expected = WAITING.includes(state) ? state : null;
    expect(bubbleFor('minori', state)).toBe(expected);
  });

  it('gives かなめ a bubble while PRs wait for her', () => {
    expect(bubbleFor('kaname', 'awaiting-kaname')).toBe('awaiting-kaname');
    expect(bubbleFor('kaname', 'working')).toBeNull();
  });

  it('gives かなめ the permission bubble while her session waits, and none while busy', () => {
    expect(bubbleFor('kaname', 'awaiting-permission')).toBe('awaiting-permission');
    expect(bubbleFor('kaname', 'busy')).toBeNull();
  });

  it('shows the permission bubble over a PR waiting for the president (order of 4.6)', () => {
    const snapshot = {
      issues: [issue(1, { labels: ['経理'] })],
      prs: [pr(2, { linkedIssues: [1], changedFiles: ['CLAUDE.md'] })],
    };
    const rows = (live: LiveStates) =>
      deriveMemberStatuses(snapshot, 0, undefined, live).map((s) => ({
        id: s.memberId,
        state: s.state,
      }));
    expect(bubblesOf(rows({}))).toEqual({ minori: 'awaiting-president' });
    expect(bubblesOf(rows({ minori: 'awaiting-permission' }))).toEqual({
      minori: 'awaiting-permission',
    });
  });

  it('leaves the king to the HTML bubble', () => {
    for (const state of STATES) expect(bubbleFor('yukihiro', state)).toBeNull();
  });
});

describe('bubblesOf', () => {
  it('keeps only the members who wait', () => {
    expect(
      bubblesOf([
        { id: 'kaname', state: 'awaiting-kaname' },
        { id: 'minori', state: 'awaiting-president' },
        { id: 'hibiki', state: 'working' },
        { id: 'yukihiro', state: 'awaiting-president' },
      ]),
    ).toEqual({ kaname: 'awaiting-kaname', minori: 'awaiting-president' });
  });

  it('is empty without rows', () => {
    expect(bubblesOf([])).toEqual({});
  });
});
