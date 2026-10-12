import type { MemberId, TilePos } from '../guild.config';
import type { Random } from './confetti';
import { heldLook } from './hands';
import { TOSS } from './metrics';
import { carry, raise, staySegment, type Prop, type Segment } from './motion';
import type { Point } from './path';

/**
 * The tossed scroll (Issue #12): instead of walking it over, かなめ now and then tosses the scroll
 * from the counter to a near desk. Pure: the random source and the times are passed in.
 *
 * Nobody moves: かなめ takes up the scroll at her seat, raises it, lets it go and watches it land;
 * the member waits at the seat and catches it with both hands up (the existing raised pose), then
 * holds it up as after a handover. The scroll flies from where her raised scroll was drawn to where
 * the member's raised scroll is drawn, so it never jumps.
 */

/** The item in the air between two members, from `start` (let go) to `end` (caught, exclusive). */
export interface Flight {
  readonly prop: Prop;
  readonly from: MemberId;
  readonly to: MemberId;
  readonly start: number;
  readonly end: number;
}

/** A flight at a moment: `progress` 0 when let go, toward 1 when caught. */
export interface FlightView {
  readonly prop: Prop;
  readonly from: MemberId;
  readonly to: MemberId;
  readonly progress: number;
}

/** Straight-line distance between two tiles, in tiles. */
export function tileDistance(a: TilePos, b: TilePos): number {
  return Math.hypot(a.col - b.col, a.row - b.row);
}

/**
 * True when かなめ on `from` tosses the scroll to the seat `to`: near enough (TOSS.maxTiles), and
 * then with chance TOSS.share. A far seat draws no random number, so the other users of the same
 * source (confetti, the idle spells) see the same numbers as before.
 */
export function shouldToss(from: TilePos, to: TilePos, random: Random): boolean {
  return tileDistance(from, to) <= TOSS.maxTiles && random() < TOSS.share;
}

/** The beats of a handover the toss keeps (scenes.ts). */
export interface TossBeats {
  /** The thrower takes up the item in their arms first. */
  readonly pickUpMs: number;
  /** The catcher holds it up over their head afterwards. */
  readonly holdUpMs: number;
}

export interface TossPlan {
  /** At the thrower's seat: take up, raise, let go and watch. */
  readonly thrower: readonly Segment[];
  /** At the catcher's seat: wait, then catch with both hands up and hold it up. */
  readonly catcher: readonly Segment[];
  readonly flight: Flight;
}

export function planToss(
  cast: { readonly from: MemberId; readonly to: MemberId; readonly prop: Prop },
  start: number,
  seats: Readonly<Record<MemberId, TilePos>>,
  beats: TossBeats,
): TossPlan {
  const { from, to, prop } = cast;
  const windUp = start + beats.pickUpMs;
  const letGo = windUp + TOSS.windUpMs;
  const caught = letGo + TOSS.flightMs;
  return {
    thrower: [
      staySegment(seats[from], start, beats.pickUpMs, carry(prop)),
      staySegment(seats[from], windUp, TOSS.windUpMs, raise(prop)),
      staySegment(seats[from], letGo, TOSS.flightMs + TOSS.watchMs),
    ],
    catcher: [
      staySegment(seats[to], start, caught - start),
      staySegment(seats[to], caught, beats.holdUpMs, raise(prop)),
    ],
    flight: { prop, from, to, start: letGo, end: caught },
  };
}

/** The flight at `now`, or null before it is let go and from the moment it is caught. */
export function flightAt(flight: Flight, now: number): FlightView | null {
  if (now < flight.start || now >= flight.end) return null;
  const { prop, from, to } = flight;
  return { prop, from, to, progress: (now - flight.start) / (flight.end - flight.start) };
}

/**
 * On the arc from `a` to `b`: a parabola whose middle is `arcPx` over the higher of the two, so the
 * item rises out of the hands and comes down into the other ones whichever is higher.
 */
export function arcPoint(a: Point, b: Point, progress: number, arcPx: number = TOSS.arcPx): Point {
  const lift = 4 * (arcPx + Math.abs(a.y - b.y) / 2) * progress * (1 - progress);
  return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress - lift };
}

/** Where a member standing with their feet on `feet` holds a raised item (as hands.ts draws it). */
export function raisedItemPoint(
  id: MemberId,
  feet: Point,
  prop: Prop,
  withHoldFrames: boolean,
): Point {
  return heldLook(
    id,
    { point: feet, frame: 0, flip: false, held: null },
    raise(prop),
    withHoldFrames,
  ).item;
}

/**
 * Where the flying item is drawn: on the arc between the thrower's and the catcher's raised hands.
 * `feetOf` gives each member's drawn feet (sunk into the seat); null when one is not on stage.
 */
export function flyingItemPoint(
  view: FlightView,
  feetOf: (id: MemberId) => Point | undefined,
  hasHoldFrames: (id: MemberId) => boolean,
): Point | null {
  const fromFeet = feetOf(view.from);
  const toFeet = feetOf(view.to);
  if (fromFeet === undefined || toFeet === undefined) return null;
  const a = raisedItemPoint(view.from, fromFeet, view.prop, hasHoldFrames(view.from));
  const b = raisedItemPoint(view.to, toFeet, view.prop, hasHoldFrames(view.to));
  return arcPoint(a, b, view.progress);
}
