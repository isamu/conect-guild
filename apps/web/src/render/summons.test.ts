import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import {
  EMPTY_DIRECTOR,
  frameAt,
  scheduleEvent,
  type MemberPose,
  type StageFrame,
} from './director';
import { SUMMONS } from './metrics';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import { seatedPoint } from './seating';
import {
  addSummons,
  faceThrone,
  isSummoning,
  pruneSummons,
  replyStart,
  speechesAt,
  summonsEnd,
  withSummons,
  type Summons,
} from './summons';

const CALL_END = SUMMONS.callMs;
const REPLY = SUMMONS.callMs + SUMMONS.murmurMs;
const END = REPLY + SUMMONS.replyMs;

const order = (members: readonly MemberId[], start = 0): Summons => ({ start, members });

const seatPoint = (id: MemberId) => seatedPoint(tileToPoint(DEFAULT_SEATS[id]));
/** How much deeper the sleepers of sleepyFrame are drawn. */
const SLEEP_SINK = 4;
const sunk = (id: MemberId) => ({ x: seatPoint(id).x, y: seatPoint(id).y + SLEEP_SINK });

function member(frame: StageFrame, id: MemberId): MemberPose {
  const found = frame.members.find((m) => m.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

/** Everybody at their seat, the king and みのり asleep (a "Z", sunk deeper). */
function sleepyFrame(): StageFrame {
  const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
  const asleep = (m: MemberPose): MemberPose => ({
    ...m,
    pose: { ...m.pose, point: { x: m.pose.point.x, y: m.pose.point.y + SLEEP_SINK } },
    mark: { kind: 'z', rise: 0.5 },
  });
  return {
    ...frame,
    members: frame.members.map((m) => (m.id === 'yukihiro' || m.id === 'minori' ? asleep(m) : m)),
  };
}

describe('summons timing', () => {
  it('lasts the call, the murmur and the reply', () => {
    expect(replyStart(order(['kaname'], 100))).toBe(100 + REPLY);
    expect(summonsEnd(order(['kaname'], 100))).toBe(100 + END);
  });

  it('starts an order now, or right after the one still playing', () => {
    const one = addSummons([], ['kaname'], 50);
    expect(one).toEqual([order(['kaname'], 50)]);
    const two = addSummons(one, ['minori'], 60);
    expect(two[1]).toEqual(order(['minori'], 50 + END));
    // Once the first is over, the next one starts at once.
    expect(addSummons(one, ['minori'], 50 + END + 1)[1]).toEqual(order(['minori'], 50 + END + 1));
  });

  it('adds nothing for no members', () => {
    expect(addSummons([], [], 0)).toEqual([]);
  });

  it('is playing until its end, and pruned at its end', () => {
    const list = [order(['kaname'])];
    expect(isSummoning(list, END - 1)).toBe(true);
    expect(isSummoning(list, END)).toBe(false);
    expect(pruneSummons(list, END - 1)).toEqual(list);
    expect(pruneSummons(list, END)).toEqual([]);
  });

  it('counts an order still to come as playing', () => {
    expect(isSummoning([order(['kaname'], 1_000)], 0)).toBe(true);
  });
});

describe('speechesAt', () => {
  const list = [order(['kaname', 'hibiki'])];

  it('has the king say "！", then "ゴニョゴニョ", then the members answer "はっ！"', () => {
    expect(speechesAt(list, 0)).toEqual({ yukihiro: '！' });
    expect(speechesAt(list, CALL_END - 1)).toEqual({ yukihiro: '！' });
    expect(speechesAt(list, CALL_END)).toEqual({ yukihiro: 'ゴニョゴニョ' });
    expect(speechesAt(list, REPLY - 1)).toEqual({ yukihiro: 'ゴニョゴニョ' });
    expect(speechesAt(list, REPLY)).toEqual({ kaname: 'はっ！', hibiki: 'はっ！' });
    expect(speechesAt(list, END - 1)).toEqual({ kaname: 'はっ！', hibiki: 'はっ！' });
  });

  it('says nothing before an order starts or after it ends', () => {
    expect(speechesAt([order(['kaname'], 10)], 9)).toEqual({});
    expect(speechesAt(list, END)).toEqual({});
    expect(speechesAt([], 0)).toEqual({});
  });

  it('plays queued orders one after the other', () => {
    const queued = addSummons(addSummons([], ['kaname'], 0), ['sasae'], 0);
    expect(speechesAt(queued, END - 1)).toEqual({ kaname: 'はっ！' });
    expect(speechesAt(queued, END)).toEqual({ yukihiro: '！' });
    expect(speechesAt(queued, END + REPLY)).toEqual({ sasae: 'はっ！' });
  });
});

describe('faceThrone', () => {
  const throne = DEFAULT_SEATS.yukihiro;

  it('turns those left of the throne to the right and those right of it to the left', () => {
    expect(faceThrone(DEFAULT_SEATS.minori, throne)).toEqual({ frame: 1, flip: false });
    expect(faceThrone(DEFAULT_SEATS.hirame, throne)).toEqual({ frame: 1, flip: false });
    expect(faceThrone(DEFAULT_SEATS.hibiki, throne)).toEqual({ frame: 1, flip: true });
    expect(faceThrone(DEFAULT_SEATS.sasae, throne)).toEqual({ frame: 1, flip: true });
  });

  it('keeps one right below the throne facing front (no frame faces back)', () => {
    expect(faceThrone(DEFAULT_SEATS.kaname, throne)).toEqual({ frame: 0, flip: false });
  });
});

describe('withSummons: the king', () => {
  it('wakes the king and lifts him while he calls, then sits him still while he murmurs', () => {
    const frame = sleepyFrame();
    const list = [order(['hibiki'])];
    const calling = member(withSummons(frame, list, 0, DEFAULT_SEATS), 'yukihiro');
    // Woken where he is drawn: nothing jumps when the call starts or ends.
    const at = sunk('yukihiro');
    expect(calling.pose).toEqual({
      point: { x: at.x, y: at.y - SUMMONS.kingRisePx },
      frame: 0,
      flip: false,
      held: null,
    });
    expect(calling.mark).toBeNull();
    const murmuring = member(withSummons(frame, list, CALL_END, DEFAULT_SEATS), 'yukihiro');
    expect(murmuring.pose.point).toEqual(at);
    expect(murmuring.mark).toBeNull();
  });

  it('leaves the members alone while the king speaks, and the frame as it was outside an order', () => {
    const frame = sleepyFrame();
    const list = [order(['minori'])];
    expect(member(withSummons(frame, list, CALL_END, DEFAULT_SEATS), 'minori')).toEqual(
      member(frame, 'minori'),
    );
    expect(withSummons(frame, list, END, DEFAULT_SEATS)).toBe(frame);
    expect(withSummons(frame, [], 0, DEFAULT_SEATS)).toBe(frame);
  });
});

describe('withSummons: the answer', () => {
  it('turns members at their seat to the throne, awake, holding nothing', () => {
    const frame = sleepyFrame();
    const next = withSummons(frame, [order(['minori', 'hibiki'])], REPLY, DEFAULT_SEATS);
    const minori = member(next, 'minori');
    expect(minori.pose).toEqual({ point: sunk('minori'), frame: 1, flip: false, held: null });
    expect(minori.mark).toBeNull();
    expect(minori.hand).toBeNull();
    expect(member(next, 'hibiki').pose).toMatchObject({ frame: 1, flip: true });
    // Those not called, and the king, are left as they were.
    expect(member(next, 'sasae')).toEqual(member(frame, 'sasae'));
    expect(member(next, 'yukihiro')).toEqual(member(frame, 'yukihiro'));
  });

  it('keeps an ambient offset where it is while turning (no jump)', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const shifted: StageFrame = {
      ...frame,
      members: frame.members.map((m) =>
        m.id === 'sasae'
          ? { ...m, pose: { ...m.pose, point: { x: m.pose.point.x + 2, y: m.pose.point.y - 2 } } }
          : m,
      ),
    };
    const next = withSummons(shifted, [order(['sasae'])], REPLY, DEFAULT_SEATS);
    expect(member(next, 'sasae').pose.point).toEqual(member(shifted, 'sasae').pose.point);
  });

  it('has かなめ hop facing front, then stand still', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const list = [order(['kaname'])];
    const at = seatPoint('kaname');
    const hop = member(withSummons(frame, list, REPLY, DEFAULT_SEATS), 'kaname');
    expect(hop.pose).toEqual({
      point: { x: at.x, y: at.y - SUMMONS.hopPx },
      frame: 0,
      flip: false,
      held: null,
    });
    const after = member(withSummons(frame, list, REPLY + SUMMONS.hopMs, DEFAULT_SEATS), 'kaname');
    expect(after.pose.point).toEqual(at);
  });
});

describe('withSummons: the answer away from the seat', () => {
  it('answers on the spot without turning while in a scene (nobody is moved)', () => {
    const context = { seats: DEFAULT_SEATS, random: () => 0.5 };
    const event = {
      id: 'issue-opened#1',
      kind: 'issue-opened',
      number: 1,
      department: '経理',
    } as const;
    const director = scheduleEvent(EMPTY_DIRECTOR, event, 0, context);
    // かなめ is on her way to みのり's desk with the scroll.
    const t = 3_000;
    const frame = frameAt(director, t, DEFAULT_SEATS);
    const list = [order(['kaname'], t - REPLY)];
    expect(member(frame, 'kaname').inScene).toBe(true);
    expect(member(withSummons(frame, list, t, DEFAULT_SEATS), 'kaname')).toEqual(
      member(frame, 'kaname'),
    );
    expect(speechesAt(list, t)).toEqual({ kaname: 'はっ！' });
  });

  it('answers on the spot without turning while away from the seat (out playing)', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const away: StageFrame = {
      ...frame,
      members: frame.members.map((m) =>
        m.id === 'hirame'
          ? { ...m, atSeat: false, pose: { ...m.pose, point: { x: 100, y: 300 } } }
          : m,
      ),
    };
    const next = withSummons(away, [order(['hirame'])], REPLY, DEFAULT_SEATS);
    expect(member(next, 'hirame')).toEqual(member(away, 'hirame'));
  });
});

describe('withSummons: the depth order', () => {
  it('keeps the back-to-front order', () => {
    const frame = sleepyFrame();
    const next = withSummons(frame, [order(['kaname', 'sasae'])], REPLY, DEFAULT_SEATS);
    expect(next.members.map((m) => m.id)).toEqual(frame.members.map((m) => m.id));
  });
});
