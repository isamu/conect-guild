import { describe, expect, it } from 'vitest';
import type { MemberState } from '../domain/party';
import { bubbleFor, bubblesOf } from './bubbles';

const STATES: readonly MemberState[] = [
  'awaiting-president',
  'awaiting-kaname',
  'working',
  'done',
  'idle',
];

describe('bubbleFor', () => {
  it.each(STATES)('gives a department member in %s the matching bubble or none', (state) => {
    const expected = state === 'awaiting-president' || state === 'awaiting-kaname' ? state : null;
    expect(bubbleFor('minori', state)).toBe(expected);
  });

  it('gives かなめ a bubble while PRs wait for her', () => {
    expect(bubbleFor('kaname', 'awaiting-kaname')).toBe('awaiting-kaname');
    expect(bubbleFor('kaname', 'working')).toBeNull();
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
