import type { MemberId, TilePos } from '../guild.config';
import type { MemberPose, StageFrame } from './director';
import { SUMMONS } from './metrics';
import type { MoveFrame } from './motion';
import type { Point } from './path';

/**
 * The king speaks to whom the president gave an order (Issue #28). Pure: stage time is passed in.
 * The king says "！" (rising a little on the throne), then "ゴニョゴニョ"; then each member called
 * turns to the throne and answers "はっ！". Nobody walks: the summons only changes poses at the
 * seats and puts words over heads, so it never moves anyone out of a scene or a walk.
 *
 * - The king never leaves the throne. While he speaks he sits up awake (out of a doze or sleep).
 * - A member at their seat and out of a scene turns to the throne (out of desk work, a doze or
 *   sleep). One right below it (かなめ) has no frame facing back, so she hops facing front.
 * - A member away from the seat (in a handover, walking back from play) answers where they are,
 *   without turning: their scene or walk goes on.
 */

export type SpeechLine = '！' | 'ゴニョゴニョ' | 'はっ！';

export type Speeches = Readonly<Partial<Record<MemberId, SpeechLine>>>;

/** One order: when it starts on the stage clock and who was given it. */
export interface Summons {
  readonly start: number;
  readonly members: readonly MemberId[];
}

const KING: MemberId = 'yukihiro';

/** When the members answer: after the king's "！" and "ゴニョゴニョ". */
export function replyStart(summons: Summons): number {
  return summons.start + SUMMONS.callMs + SUMMONS.murmurMs;
}

export function summonsEnd(summons: Summons): number {
  return replyStart(summons) + SUMMONS.replyMs;
}

/**
 * Adds an order at `now`, or right after the last one still playing, so two never talk over each
 * other. No members: nothing to add.
 */
export function addSummons(
  list: readonly Summons[],
  members: readonly MemberId[],
  now: number,
): Summons[] {
  if (members.length === 0) return [...list];
  const start = Math.max(now, ...list.map(summonsEnd));
  return [...list, { start, members }];
}

/** True while an order plays or is still to come. */
export function isSummoning(list: readonly Summons[], now: number): boolean {
  return list.some((summons) => summonsEnd(summons) > now);
}

/** Drops the finished orders. */
export function pruneSummons(list: readonly Summons[], now: number): Summons[] {
  return list.filter((summons) => summonsEnd(summons) > now);
}

/** The orders over by `now` (those pruneSummons drops). */
export function endedSummons(list: readonly Summons[], now: number): Summons[] {
  return list.filter((summons) => summonsEnd(summons) <= now);
}

/**
 * The start of the order playing at `now` when it is not `announced` (the start already reported):
 * the moment its "！" and its sound begin. Null otherwise. Starts are unique (addSummons).
 */
export function newCallStart(
  list: readonly Summons[],
  now: number,
  announced: number | null,
): number | null {
  const start = playing(list, now)?.start;
  return start === undefined || start === announced ? null : start;
}

/** The order playing at `now`, if any (they never overlap: addSummons). */
function playing(list: readonly Summons[], now: number): Summons | undefined {
  return list.find((summons) => summons.start <= now && now < summonsEnd(summons));
}

/** Who says what at `now`; those in `done` have stopped answering (holdsAt). */
export function speechesAt(
  list: readonly Summons[],
  now: number,
  done: readonly MemberId[] = [],
): Speeches {
  const summons = playing(list, now);
  if (summons === undefined) return {};
  const reply = replyStart(summons);
  if (now >= reply) {
    const answers: Partial<Record<MemberId, SpeechLine>> = {};
    for (const id of summons.members) if (!done.includes(id)) answers[id] = 'はっ！';
    return answers;
  }
  return { [KING]: now < summons.start + SUMMONS.callMs ? '！' : 'ゴニョゴニョ' };
}

/** Which way a member at `seat` faces the throne: sideways towards it, or front when right below. */
export function faceThrone(seat: TilePos, throne: TilePos): { frame: MoveFrame; flip: boolean } {
  if (seat.col === throne.col) return { frame: 0, flip: false };
  return { frame: 1, flip: seat.col > throne.col };
}

/**
 * Where the call playing holds those who take part at their seat: the point each one was drawn at
 * when their part began (the king from the start of the call to its end, a member at the seat from
 * the reply), so a nod, a doze turning to sleep or a typing bob does not move them in the call.
 */
export interface Holds {
  /** The start of the call they belong to; null when none plays. */
  readonly start: number | null;
  readonly points: Readonly<Partial<Record<MemberId, Point>>>;
  /**
   * Members whose answer at the seat a scene cut short (a scroll or a chest): they stop answering
   * there and the scene takes them as it would from the seat, like the waiting bubbles.
   */
  readonly done: readonly MemberId[];
}

export const NO_HOLDS: Holds = { start: null, points: {}, done: [] };

/** True while `member` takes part at the seat at `now`: the king all along, a member answering. */
function heldAt(summons: Summons, member: MemberPose, now: number): boolean {
  if (member.id === KING) return true;
  return (
    now >= replyStart(summons) &&
    summons.members.includes(member.id) &&
    member.atSeat &&
    !member.inScene
  );
}

/**
 * What a call starts with from `holds`: all of it for the same call; for the next call of a row
 * (it starts right as the held one ends) only the king, where he was; nothing otherwise.
 */
function carriedOver(holds: Holds, summons: Summons): Omit<Holds, 'start'> {
  if (summons.start === holds.start) return holds;
  const king = holds.points[KING];
  const follows =
    holds.start !== null && summonsEnd({ start: holds.start, members: [] }) === summons.start;
  return follows && king !== undefined ? { points: { [KING]: king }, done: [] } : NO_HOLDS;
}

/** The holds at `now`: those of `holds` for the same call, plus anyone whose part begins now. */
export function holdsAt(
  holds: Holds,
  frame: StageFrame,
  list: readonly Summons[],
  now: number,
): Holds {
  const summons = playing(list, now);
  if (summons === undefined) return NO_HOLDS;
  const before = carriedOver(holds, summons);
  const points: Partial<Record<MemberId, Point>> = {};
  const done = [...before.done];
  for (const member of frame.members) {
    const at = before.points[member.id];
    if (at !== undefined && member.id !== KING && member.inScene) done.push(member.id);
    else if (at !== undefined) points[member.id] = at;
    else if (!done.includes(member.id) && heldAt(summons, member, now)) {
      points[member.id] = member.pose.point;
    }
  }
  return { start: summons.start, points, done };
}

/**
 * A member at their seat in a still frame, `lift` px up from where they are held (holdsAt; where
 * they are drawn now when not held), so nothing jumps when the call starts or ends. What they
 * handle at the desk is put down and the idle sign goes.
 */
function sitting(
  member: MemberPose,
  look: { frame: MoveFrame; flip: boolean; lift: number; at: Point | undefined },
): MemberPose {
  const at = look.at ?? member.pose.point;
  return {
    ...member,
    pose: {
      point: { x: at.x, y: at.y - look.lift },
      frame: look.frame,
      flip: look.flip,
      held: null,
    },
    hand: null,
    mark: null,
  };
}

function answering(
  member: MemberPose,
  seats: Readonly<Record<MemberId, TilePos>>,
  since: number,
  at: Point | undefined,
): MemberPose {
  if (!member.atSeat || member.inScene) return member;
  const face = faceThrone(seats[member.id], seats[KING]);
  const hop = face.frame === 0 && since < SUMMONS.hopMs ? SUMMONS.hopPx : 0;
  return sitting(member, { ...face, lift: hop, at });
}

/**
 * The frame with the order playing at `now` applied: the king sitting up, awake, through the call
 * (rising a little while he calls), the members turned to the throne while they answer, each held
 * where `holds` keeps them (holdsAt). The depth order stays (nobody changes tile).
 */
export function withSummons(
  frame: StageFrame,
  list: readonly Summons[],
  now: number,
  context: { readonly seats: Readonly<Record<MemberId, TilePos>>; readonly holds: Holds },
): StageFrame {
  const summons = playing(list, now);
  if (summons === undefined) return frame;
  const reply = replyStart(summons);
  const { seats, holds } = context;
  const members = frame.members.map((member) => {
    const at = holds.start === summons.start ? holds.points[member.id] : undefined;
    if (member.id === KING) {
      const lift = now < summons.start + SUMMONS.callMs ? SUMMONS.kingRisePx : 0;
      return sitting(member, { frame: 0, flip: false, lift, at });
    }
    if (now < reply || !summons.members.includes(member.id)) return member;
    if (holds.start === summons.start && holds.done.includes(member.id)) return member;
    return answering(member, seats, now - reply, at);
  });
  return { ...frame, members };
}
