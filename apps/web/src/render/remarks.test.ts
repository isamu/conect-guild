import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import type { MemberId } from '../guild.config';
import type { Bubbles } from './bubbles';
import { EMPTY_DIRECTOR, scheduleEvent, sendHome } from './director';
import type { IdlePose } from './idle';
import { linesOf } from './lineBook';
import { createLinePicker, type PickLine } from './lines';
import { LINES } from './metrics';
import { walkSegment } from './motion';
import { tileToPoint } from './path';
import {
  isFree,
  isRemarking,
  newlyWaiting,
  NO_REMARKS,
  pruneRemarks,
  receiveParty,
  remarksAt,
  remarkTurns,
  silenced,
  type RemarkMoment,
  type RemarkParty,
  type Remarks,
} from './remarks';
import { DEFAULT_SEATS } from './scenes';

/** Random numbers in turn, then 0.99 (a draw that says nothing). */
function draws(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0.99;
}

/** The first line of the moment, every time. */
const first: PickLine = (actor, scene) => linesOf(actor, scene)[0] ?? null;

const everyoneFree = () => true;

function moment(over: Partial<RemarkMoment> = {}): RemarkMoment {
  return { t: 1_000, quiet: false, free: everyoneFree, random: () => 0, pick: first, ...over };
}

function party(bubbles: Bubbles, over: Partial<RemarkParty> = {}): RemarkParty {
  return { bubbles, known: true, halted: false, ...over };
}

/** Remarks that have seen `bubbles` already. */
function seen(bubbles: Bubbles): Remarks {
  return { previous: bubbles, said: [] };
}

describe('newlyWaiting', () => {
  it('finds nobody on the first party (nothing to compare with)', () => {
    expect(newlyWaiting(null, { minori: 'awaiting-president' })).toEqual([]);
  });

  it('finds a member whose waiting bubble is new', () => {
    expect(newlyWaiting({}, { minori: 'awaiting-president' })).toEqual([
      { id: 'minori', kind: 'awaiting-president' },
    ]);
  });

  it('finds nobody while the same wait goes on', () => {
    const bubbles: Bubbles = { minori: 'awaiting-president', kaname: 'awaiting-permission' };
    expect(newlyWaiting(bubbles, { ...bubbles })).toEqual([]);
  });

  it('finds a member who now waits on someone else (another bubble)', () => {
    expect(newlyWaiting({ hibiki: 'awaiting-kaname' }, { hibiki: 'awaiting-president' })).toEqual([
      { id: 'hibiki', kind: 'awaiting-president' },
    ]);
  });

  it('finds nobody for a wait that ends', () => {
    expect(newlyWaiting({ sasae: 'awaiting-kaname' }, {})).toEqual([]);
  });

  it('lists several at once in the order of the party window', () => {
    const next: Bubbles = {
      sasae: 'awaiting-permission',
      kaname: 'awaiting-permission',
      hirame: 'awaiting-kaname',
    };
    expect(newlyWaiting({}, next).map((change) => change.id)).toEqual([
      'kaname',
      'hirame',
      'sasae',
    ]);
  });
});

describe('remarkTurns: now and then', () => {
  const change = [{ id: 'minori', kind: 'awaiting-president' }] as const;

  it(`speaks when the draw is under LINES.remarkChance (${String(LINES.remarkChance)})`, () => {
    expect(LINES.remarkChance).toBeGreaterThan(0);
    expect(LINES.remarkChance).toBeLessThan(1);
    const under = LINES.remarkChance - 1e-9;
    expect(remarkTurns(change, 5, everyoneFree, () => under)).toEqual([
      { actor: 'minori', scene: 'awaitPresident', at: 5 },
    ]);
    expect(remarkTurns(change, 5, everyoneFree, () => 0)).toHaveLength(1);
  });

  it('says nothing for a draw at LINES.remarkChance or over', () => {
    expect(remarkTurns(change, 5, everyoneFree, () => LINES.remarkChance)).toEqual([]);
    expect(remarkTurns(change, 5, everyoneFree, () => 0.99)).toEqual([]);
  });

  it('takes the moment of each wait', () => {
    const changes = [
      { id: 'kaname', kind: 'awaiting-permission' },
      { id: 'hibiki', kind: 'awaiting-kaname' },
      { id: 'sasae', kind: 'awaiting-president' },
    ] as const;
    expect(remarkTurns(changes, 0, everyoneFree, () => 0).map((turn) => turn.scene)).toEqual([
      'awaitPermission',
      'awaitKaname',
      'awaitPresident',
    ]);
  });

  it('draws for each free member on its own, and nothing for one who is not free', () => {
    const changes = [
      { id: 'minori', kind: 'awaiting-kaname' },
      { id: 'hibiki', kind: 'awaiting-kaname' },
      { id: 'hirame', kind: 'awaiting-kaname' },
    ] as const;
    let drawn = 0;
    const random = () => [0.99, 0][drawn++] ?? 0;
    const turns = remarkTurns(changes, 0, (id) => id !== 'minori', random);
    expect(drawn).toBe(2);
    expect(turns.map((turn) => turn.actor)).toEqual(['hirame']);
  });
});

describe('receiveParty', () => {
  it('says nothing for the first party and remembers it', () => {
    const next = receiveParty(NO_REMARKS, party({ minori: 'awaiting-president' }), moment());
    expect(next).toEqual({ previous: { minori: 'awaiting-president' }, said: [] });
  });

  it('keeps nothing to compare with before the first snapshot (its party is empty)', () => {
    const before = receiveParty(NO_REMARKS, party({}, { known: false }), moment());
    expect(before.previous).toBeNull();
    const first = receiveParty(before, party({ minori: 'awaiting-president' }), moment());
    expect(first.said).toEqual([]);
  });

  it('says a line of the new wait for LINES.remarkMs from now', () => {
    const next = receiveParty(seen({}), party({ minori: 'awaiting-president' }), moment());
    expect(next.said).toEqual([
      { actor: 'minori', line: 'ごしょうにんを', start: 1_000, end: 1_000 + LINES.remarkMs },
    ]);
    expect(LINES.remarkMs).toBe(2_000);
  });

  it('says nothing when the draw says no, and the bubble is still remembered', () => {
    const bubbles: Bubbles = { minori: 'awaiting-president' };
    const next = receiveParty(seen({}), party(bubbles), moment({ random: () => 0.99 }));
    expect(next).toEqual({ previous: bubbles, said: [] });
    // The same wait on the next fetch is not new: no second chance for it.
    expect(receiveParty(next, party({ ...bubbles }), moment()).said).toEqual([]);
  });

  it('says nothing while the same wait goes on', () => {
    const bubbles: Bubbles = { hibiki: 'awaiting-kaname' };
    expect(receiveParty(seen(bubbles), party({ ...bubbles }), moment()).said).toEqual([]);
  });

  it('says nothing for a member in a scene or away from the seat', () => {
    const next = receiveParty(
      seen({}),
      party({ minori: 'awaiting-president' }),
      moment({ free: () => false }),
    );
    expect(next.said).toEqual([]);
    expect(next.previous).toEqual({ minori: 'awaiting-president' });
  });
});

describe('receiveParty: halted, hidden, no picker', () => {
  it('drops everything when halted, and the first party after it only starts over', () => {
    const talking = receiveParty(seen({}), party({ minori: 'awaiting-president' }), moment());
    expect(talking.said).toHaveLength(1);
    const halted = receiveParty(talking, party({}, { halted: true }), moment());
    expect(halted).toEqual(NO_REMARKS);
    const back = receiveParty(halted, party({ hibiki: 'awaiting-kaname' }), moment());
    expect(back).toEqual({ previous: { hibiki: 'awaiting-kaname' }, said: [] });
  });

  it('says nothing while halted, even for a wait that is new then', () => {
    const halted = receiveParty(
      seen({}),
      party({ minori: 'awaiting-president' }, { halted: true }),
      moment(),
    );
    expect(halted.said).toEqual([]);
  });

  it('lets the moment pass unsaid while nothing is drawn, remembering the wait', () => {
    const bubbles: Bubbles = { minori: 'awaiting-president' };
    const quiet = receiveParty(seen({}), party(bubbles), moment({ quiet: true }));
    expect(quiet).toEqual({ previous: bubbles, said: [] });
    // Shown again, the same wait is not new.
    expect(receiveParty(quiet, party({ ...bubbles }), moment()).said).toEqual([]);
  });

  it('says nothing without a picker', () => {
    const next = receiveParty(
      seen({}),
      party({ minori: 'awaiting-president' }),
      moment({ pick: undefined }),
    );
    expect(next.said).toEqual([]);
  });
});

describe('receiveParty: several at once, and the lines', () => {
  it('lets several who start waiting together speak one after another', () => {
    const next = receiveParty(
      seen({}),
      party({ kaname: 'awaiting-permission', minori: 'awaiting-kaname' }),
      moment(),
    );
    expect(next.said.map(({ actor, start, end }) => ({ actor, start, end }))).toEqual([
      { actor: 'kaname', start: 1_000, end: 3_000 },
      { actor: 'minori', start: 3_000, end: 5_000 },
    ]);
  });

  it('lets only those whose draw says yes speak, without a gap for the others', () => {
    const next = receiveParty(
      seen({}),
      party({
        kaname: 'awaiting-permission',
        minori: 'awaiting-kaname',
        hibiki: 'awaiting-kaname',
      }),
      moment({ random: draws(0.99, 0, 0) }),
    );
    expect(next.said.map(({ actor, start }) => ({ actor, start }))).toEqual([
      { actor: 'minori', start: 1_000 },
      { actor: 'hibiki', start: 3_000 },
    ]);
  });

  it('starts after the remarks still to come, so two never show at once', () => {
    const talking = receiveParty(seen({}), party({ minori: 'awaiting-president' }), moment());
    const next = receiveParty(
      talking,
      party({ minori: 'awaiting-president', sasae: 'awaiting-kaname' }),
      moment({ t: 1_500 }),
    );
    expect(next.said.map(({ actor, start }) => ({ actor, start }))).toEqual([
      { actor: 'minori', start: 1_000 },
      { actor: 'sasae', start: 3_000 },
    ]);
  });

  it('never says the same line twice in a row (the picker of the scenes)', () => {
    const pick = createLinePicker(() => 0);
    let remarks: Remarks = seen({});
    const said: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const t = i * 10_000;
      const bubbles: Bubbles = i % 2 === 0 ? { minori: 'awaiting-president' } : {};
      remarks = receiveParty(remarks, party(bubbles), moment({ t, pick }));
      const line = remarksAt(remarks, t).minori;
      if (line !== undefined) said.push(line);
    }
    expect(said).toHaveLength(3);
    expect(new Set(said).size).toBe(3);
  });
});

describe('remarks over time', () => {
  const talking = receiveParty(seen({}), party({ minori: 'awaiting-president' }), moment());

  it('shows the line from its start to its end (exclusive)', () => {
    expect(remarksAt(talking, 999)).toEqual({});
    expect(remarksAt(talking, 1_000)).toEqual({ minori: 'ごしょうにんを' });
    expect(remarksAt(talking, 2_999)).toEqual({ minori: 'ごしょうにんを' });
    expect(remarksAt(talking, 3_000)).toEqual({});
  });

  it('is remarking until the last line is over', () => {
    expect(isRemarking(talking, 2_999)).toBe(true);
    expect(isRemarking(talking, 3_000)).toBe(false);
    expect(isRemarking(NO_REMARKS, 0)).toBe(false);
  });

  it('prunes the lines that are over, keeping the bubbles seen', () => {
    expect(pruneRemarks(talking, 2_999).said).toHaveLength(1);
    expect(pruneRemarks(talking, 3_000)).toEqual({
      previous: { minori: 'awaiting-president' },
      said: [],
    });
  });

  it('is silenced (the canvas is hidden) without forgetting the bubbles seen', () => {
    expect(silenced(talking)).toEqual({ previous: { minori: 'awaiting-president' }, said: [] });
  });
});

describe('isFree', () => {
  const seat = DEFAULT_SEATS.minori;
  const idleAt = (tile: { col: number; row: number }): IdlePose => ({
    feet: tileToPoint(tile),
    step: { from: tile, to: tile, progress: 0 },
    frame: 0,
    flip: false,
    offset: { x: 0, y: 0 },
    mark: null,
    withPet: false,
  });
  const scroll: GuildEvent = { id: 'o#1', kind: 'issue-opened', number: 1, department: '経理' };
  const scene = scheduleEvent(EMPTY_DIRECTOR, scroll, 0, {
    seats: DEFAULT_SEATS,
    random: () => 0.5,
    tossRandom: () => 0.99,
  });

  it('is free at the seat out of scenes, dozing or asleep there too', () => {
    expect(isFree(EMPTY_DIRECTOR, 0, 'minori', {})).toBe(true);
    expect(isFree(EMPTY_DIRECTOR, 0, 'minori', { minori: idleAt(seat) })).toBe(true);
  });

  it('is not free while out playing', () => {
    const away = { col: seat.col + 2, row: seat.row };
    expect(isFree(EMPTY_DIRECTOR, 0, 'minori', { minori: idleAt(away) })).toBe(false);
  });

  it('is not free in a scene, even when it stays at the seat, and is free again after it', () => {
    const end = scene.busyUntil.minori ?? 0;
    expect(end).toBeGreaterThan(0);
    expect(isFree(scene, end - 1, 'minori', {})).toBe(false);
    expect(isFree(scene, end, 'minori', {})).toBe(true);
    // Not in this scene: the others are free.
    const others: readonly MemberId[] = ['hibiki', 'hirame', 'sasae'];
    for (const id of others) expect(isFree(scene, end - 1, id, {})).toBe(true);
  });

  it('is not free while walking back from play', () => {
    const away = { col: seat.col + 2, row: seat.row };
    const walk = walkSegment([away, seat], 0);
    const home = sendHome(EMPTY_DIRECTOR, 'minori', walk);
    expect(isFree(home, 1, 'minori', { minori: idleAt(away) })).toBe(false);
  });
});
