import { describe, expect, it } from 'vitest';
import type { Bubbles } from './bubbles';
import { linesOf } from './lineBook';
import type { PickLine } from './lines';
import {
  receiveParty,
  remarksAt,
  stillWaiting,
  type RemarkMoment,
  type RemarkParty,
  type Remarks,
} from './remarks';

/** Remarks dropped when the wait they speak of ends or changes (Issue #47, integration review). */

/** The first line of the moment, every time. */
const first: PickLine = (actor, scene) => linesOf(actor, scene)[0] ?? null;

function moment(over: Partial<RemarkMoment> = {}): RemarkMoment {
  return { t: 1_000, quiet: false, free: () => true, random: () => 0, pick: first, ...over };
}

function party(bubbles: Bubbles): RemarkParty {
  return { bubbles, known: true, halted: false };
}

const NOTHING_SEEN: Remarks = { previous: {}, said: [] };

describe('receiveParty: a wait that ends or changes before its remark is over', () => {
  /** かなめ then みのり, both new: みのり's remark waits until 3_000. */
  const queued = receiveParty(
    NOTHING_SEEN,
    party({ kaname: 'awaiting-permission', minori: 'awaiting-kaname' }),
    moment(),
  );

  it('queues the second remark after the first', () => {
    expect(queued.said.map(({ actor, start }) => ({ actor, start }))).toEqual([
      { actor: 'kaname', start: 1_000 },
      { actor: 'minori', start: 3_000 },
    ]);
  });

  it('drops a remark to come when the wait ends before it starts, keeping the others', () => {
    const next = receiveParty(
      queued,
      party({ kaname: 'awaiting-permission' }),
      moment({ t: 1_500 }),
    );
    expect(next.said.map((said) => said.actor)).toEqual(['kaname']);
    expect(remarksAt(next, 3_500)).toEqual({});
  });

  it('drops a remark showing when its wait ends', () => {
    const next = receiveParty(queued, party({ minori: 'awaiting-kaname' }), moment({ t: 1_500 }));
    expect(remarksAt(next, 1_500)).toEqual({});
    // みのり's still comes at its time: her wait goes on.
    expect(remarksAt(next, 3_000)).toEqual({ minori: 'みてください' });
  });

  it('drops a remark when the wait becomes another, and the new wait may speak', () => {
    const next = receiveParty(
      queued,
      party({ kaname: 'awaiting-permission', minori: 'awaiting-president' }),
      moment({ t: 1_500 }),
    );
    const minori = next.said.filter((said) => said.actor === 'minori');
    expect(minori.map((said) => said.line)).toEqual(['ごしょうにんを']);
    expect(minori[0]?.start).toBe(3_000);
  });

  it('keeps every remark while the waits stay the same', () => {
    const same = party({ kaname: 'awaiting-permission', minori: 'awaiting-kaname' });
    expect(receiveParty(queued, same, moment({ t: 1_500 })).said).toEqual(queued.said);
    expect(receiveParty(queued, same, moment({ t: 1_500, quiet: true })).said).toEqual(queued.said);
  });

  it('drops them while nothing is drawn too (quiet)', () => {
    const next = receiveParty(queued, party({}), moment({ t: 1_500, quiet: true }));
    expect(next.said).toEqual([]);
  });

  it('tells the wait of each remark by its line (stillWaiting)', () => {
    expect(
      stillWaiting(queued.said, { kaname: 'awaiting-kaname', minori: 'awaiting-kaname' }),
    ).toEqual(queued.said.filter((said) => said.actor === 'minori'));
  });
});
