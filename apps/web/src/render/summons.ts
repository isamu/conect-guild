import type { MemberId, TilePos } from '../guild.config';
import type { MemberPose, StageFrame } from './director';
import { SUMMONS } from './metrics';
import type { MoveFrame } from './motion';

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

/** Who says what at `now`. */
export function speechesAt(list: readonly Summons[], now: number): Speeches {
  const summons = playing(list, now);
  if (summons === undefined) return {};
  const reply = replyStart(summons);
  if (now >= reply) {
    return Object.fromEntries(summons.members.map((id) => [id, 'はっ！'] as const));
  }
  return { [KING]: now < summons.start + SUMMONS.callMs ? '！' : 'ゴニョゴニョ' };
}

/** Which way a member at `seat` faces the throne: sideways towards it, or front when right below. */
export function faceThrone(seat: TilePos, throne: TilePos): { frame: MoveFrame; flip: boolean } {
  if (seat.col === throne.col) return { frame: 0, flip: false };
  return { frame: 1, flip: seat.col > throne.col };
}

/**
 * A member at their seat in a still frame, `lift` px up from where they are drawn now (an ambient
 * offset or the sink of a doze stays, so nothing jumps when the call starts or ends). What they
 * handle at the desk is put down and the idle sign goes.
 */
function sitting(
  member: MemberPose,
  look: { frame: MoveFrame; flip: boolean; lift: number },
): MemberPose {
  const at = member.pose.point;
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
): MemberPose {
  if (!member.atSeat || member.inScene) return member;
  const face = faceThrone(seats[member.id], seats[KING]);
  const hop = face.frame === 0 && since < SUMMONS.hopMs ? SUMMONS.hopPx : 0;
  return sitting(member, { ...face, lift: hop });
}

/**
 * The frame with the order playing at `now` applied: the king sitting up while he speaks, the
 * members turned to the throne while they answer. The depth order stays (nobody changes tile).
 */
export function withSummons(
  frame: StageFrame,
  list: readonly Summons[],
  now: number,
  seats: Readonly<Record<MemberId, TilePos>>,
): StageFrame {
  const summons = playing(list, now);
  if (summons === undefined) return frame;
  const reply = replyStart(summons);
  const members = frame.members.map((member) => {
    if (now < reply) {
      if (member.id !== KING) return member;
      const lift = now < summons.start + SUMMONS.callMs ? SUMMONS.kingRisePx : 0;
      return sitting(member, { frame: 0, flip: false, lift });
    }
    return summons.members.includes(member.id) ? answering(member, seats, now - reply) : member;
  });
  return { ...frame, members };
}
