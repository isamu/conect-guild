import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import {
  cueForMessage,
  mayPlay,
  messageCue,
  newlyAwaiting,
  summonsCue,
  type PartyMember,
} from './judge';

const event = (kind: GuildEventKind): GuildEvent => ({
  id: `${kind}#1`,
  kind,
  number: 1,
  department: null,
});

describe('cueForMessage', () => {
  it.each([
    ['issue-opened', 'scroll'],
    ['pr-merged', 'chest'],
    ['issue-closed', 'clear'],
  ] as const)('%s plays %s', (kind, cue) => {
    expect(cueForMessage({ event: event(kind) })).toBe(cue);
  });

  it('a notice (no event) plays the soft text blips', () => {
    expect(cueForMessage({ event: null })).toBe('text');
  });
});

const party = (...awaiting: PartyMember['id'][]): PartyMember[] =>
  (['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'] as const).map((id) => ({
    id,
    state: awaiting.includes(id) ? 'awaiting-permission' : 'working',
  }));

describe('messageCue', () => {
  it('rings a message whose id is new, once', () => {
    expect(messageCue({ id: 2, event: event('pr-merged') }, 1)).toBe('chest');
    expect(messageCue({ id: 2, event: null }, null)).toBe('text');
    expect(messageCue({ id: 2, event: event('pr-merged') }, 2)).toBeNull();
    expect(messageCue(null, 2)).toBeNull();
  });
});

describe('summonsCue', () => {
  it('rings the king for an order whose id is new', () => {
    expect(summonsCue({ id: 1 }, null, { other: null, stageShown: true })).toBe('summon');
    expect(summonsCue({ id: 2 }, 1, { other: null, stageShown: true })).toBe('summon');
  });

  it('stays silent for the same order, no order, or when another sound starts with it', () => {
    expect(summonsCue({ id: 1 }, 1, { other: null, stageShown: true })).toBeNull();
    expect(summonsCue(null, 1, { other: null, stageShown: true })).toBeNull();
    expect(summonsCue({ id: 2 }, 1, { other: 'permission', stageShown: true })).toBeNull();
    expect(summonsCue({ id: 2 }, 1, { other: 'scroll', stageShown: true })).toBeNull();
  });

  it('stays silent while the canvas is not shown (the call is not played there)', () => {
    expect(summonsCue({ id: 2 }, 1, { other: null, stageShown: false })).toBeNull();
  });
});

describe('newlyAwaiting', () => {
  it('finds a member who starts waiting', () => {
    expect(newlyAwaiting(party(), party('minori'))).toEqual(['minori']);
  });

  it('does not repeat for a member who keeps waiting', () => {
    expect(newlyAwaiting(party('minori'), party('minori'))).toEqual([]);
  });

  it('finds only the new one when another keeps waiting', () => {
    expect(newlyAwaiting(party('minori'), party('minori', 'kaname'))).toEqual(['kaname']);
  });

  it('finds several who start together', () => {
    // In party order (the order of `next`).
    expect(newlyAwaiting(party(), party('sasae', 'hibiki'))).toEqual(['hibiki', 'sasae']);
  });

  it('ignores members who stop waiting', () => {
    expect(newlyAwaiting(party('minori'), party())).toEqual([]);
  });

  it('counts a member who waits again after a break as new', () => {
    const first = party('minori');
    const between = party();
    expect(newlyAwaiting(first, between)).toEqual([]);
    expect(newlyAwaiting(between, party('minori'))).toEqual(['minori']);
  });

  it('treats nobody as new on the first party (no previous one)', () => {
    expect(newlyAwaiting(null, party('minori', 'kaname'))).toEqual([]);
  });

  it('ignores other waiting states', () => {
    const next = party().map((row) =>
      row.id === 'yukihiro' ? { ...row, state: 'awaiting-president' as const } : row,
    );
    expect(newlyAwaiting(party(), next)).toEqual([]);
  });
});

describe('mayPlay', () => {
  it('plays only when on, shown and not halted', () => {
    expect(mayPlay({ enabled: true, hidden: false, halted: false })).toBe(true);
  });

  it.each([
    { enabled: false, hidden: false, halted: false },
    { enabled: true, hidden: true, halted: false },
    { enabled: true, hidden: false, halted: true },
    { enabled: false, hidden: true, halted: true },
  ])('stays silent for %o', (gate) => {
    expect(mayPlay(gate)).toBe(false);
  });
});
