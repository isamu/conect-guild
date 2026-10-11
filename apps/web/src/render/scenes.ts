import type { GuildEvent } from '../domain/events';
import { DEPARTMENT_MEMBER, MEMBERS, type MemberId, type TilePos } from '../guild.config';
import { createConfetti, type Particle, type Random } from './confetti';
import { isWalkable, PLACES } from './map';
import { staySegment, walkSegment, type Prop, type Segment } from './motion';
import { findPath, type TilePath } from './path';

/**
 * Event → scene script (docs/DESIGN.md 4.4 and chapter 6 M2). Pure: the start time and the random
 * source are passed in, and the result is plain data the director plays back. Nobody leaves the
 * room: かなめ goes between the members and the reception (decided by the president, 2026-10-12).
 *
 * - issue-opened: かなめ takes up a scroll, walks out from behind the counter to the member's seat
 *   and hands it over; the member holds it up a while at the seat, かなめ walks back
 * - pr-merged: the member takes up a chest, walks to the counter front and hands it over across the
 *   counter; かなめ holds it up a while, the member walks back to the seat
 * - issue-closed: confetti over the member's seat
 * - no department: かなめ only takes the scroll / chest at the reception (confetti stays the same)
 *
 * A handover takes about 10–14 s in all (scenes.test.ts checks every department).
 */

/** The giver holds the item up at the start before setting off. */
export const PICK_UP_MS = 2_000;
/** Giver and receiver side by side; the item changes hands halfway. */
export const HANDOVER_MS = 3_000;
/** The receiver holds the item up after taking it. */
export const HOLD_UP_MS = 5_500;
export const RECEPTION_MS = 2_500;

/** One member's part in a scene: back-to-back segments. */
export interface Track {
  readonly actor: MemberId;
  readonly segments: readonly Segment[];
}

/** Confetti over a member; it follows the member while it lasts. */
export interface Burst {
  readonly actor: MemberId;
  readonly start: number;
  readonly particles: readonly Particle[];
}

export interface Scene {
  readonly tracks: readonly Track[];
  readonly bursts: readonly Burst[];
}

export interface SceneContext {
  readonly seats: Readonly<Record<MemberId, TilePos>>;
  readonly random: Random;
}

/** The member who acts for an event; かなめ for the reception. */
export function actorOf(event: Pick<GuildEvent, 'department'>): MemberId {
  return event.department === null ? 'kaname' : DEPARTMENT_MEMBER[event.department];
}

/** Members whose movement a scene takes over (they must not be in two scenes at once). */
export function castOf(event: Pick<GuildEvent, 'kind' | 'department'>): MemberId[] {
  if (event.kind === 'issue-closed') return [];
  const actor = actorOf(event);
  return actor === 'kaname' ? [actor] : [actor, 'kaname'];
}

/** Path between two tiles, or just the start tile when there is no way (the member stays). */
function route(from: TilePos, to: TilePos): TilePath {
  return findPath(from, to) ?? [from];
}

/** Appends segments one after another, each starting where the previous ended. */
class TrackBuilder {
  private readonly actor: MemberId;
  private readonly segments: Segment[] = [];
  private cursor: number;
  private at: TilePos;

  constructor(actor: MemberId, start: number, from: TilePos) {
    this.actor = actor;
    this.cursor = start;
    this.at = from;
  }

  walk(to: TilePos, prop: Prop | null = null): this {
    return this.push(walkSegment(route(this.at, to), this.cursor, prop), to);
  }

  stay(ms: number, prop: Prop | null = null): this {
    return this.push(staySegment(this.at, this.cursor, ms, prop), this.at);
  }

  /** The time the next segment would start. */
  get time(): number {
    return this.cursor;
  }

  build(): Track {
    return { actor: this.actor, segments: this.segments };
  }

  private push(segment: Segment, to: TilePos): this {
    this.segments.push(segment);
    this.cursor = segment.end;
    // A walk with no way leaves the member where they were.
    this.at = segment.path.length > 1 ? to : this.at;
    return this;
  }
}

/**
 * Where a visitor from `from` stands to hand something to the member on `seat`: beside the seat
 * (left or right, so neither hides the other), else in front of or behind it; the nearest one that
 * can be reached. `from` itself when none can.
 */
function besideSeat(from: TilePos, seat: TilePos): TilePos {
  const at = (col: number, row: number): TilePos => ({ col: seat.col + col, row: seat.row + row });
  for (const group of [
    [at(-1, 0), at(1, 0)],
    [at(0, 1), at(0, -1)],
  ]) {
    const ways = group
      .filter(isWalkable)
      .map((tile) => findPath(from, tile))
      .filter((path) => path !== null)
      .sort((a, b) => a.length - b.length);
    const nearest = ways[0]?.at(-1);
    if (nearest !== undefined) return nearest;
  }
  return from;
}

/** Who brings what to where in a handover. */
interface Delivery {
  readonly giver: MemberId;
  readonly receiver: MemberId;
  /** Where the giver stands to hand the item over. */
  readonly to: TilePos;
  readonly prop: Prop;
}

/**
 * The giver takes up the item at their seat, walks to `to`, hands it over halfway through the stop
 * and walks back; the receiver waits at their seat, then holds the item up a while.
 */
function deliver(item: Delivery, start: number, seats: SceneContext['seats']): Track[] {
  const { giver, receiver, to, prop } = item;
  const giving = new TrackBuilder(giver, start, seats[giver]).stay(PICK_UP_MS, prop).walk(to, prop);
  const handover = giving.time + HANDOVER_MS / 2;
  giving
    .stay(HANDOVER_MS / 2, prop)
    .stay(HANDOVER_MS / 2)
    .walk(seats[giver]);
  const receiving = new TrackBuilder(receiver, start, seats[receiver])
    .stay(handover - start)
    .stay(HOLD_UP_MS, prop);
  return [giving.build(), receiving.build()];
}

function reception(start: number, seats: SceneContext['seats'], prop: Prop): Track {
  return new TrackBuilder('kaname', start, seats.kaname).stay(RECEPTION_MS, prop).build();
}

/** かなめ brings the scroll to the member's seat; the member brings the chest to the counter. */
function deliveryOf(
  kind: 'issue-opened' | 'pr-merged',
  actor: MemberId,
  seats: SceneContext['seats'],
): Delivery {
  return kind === 'issue-opened'
    ? {
        giver: 'kaname',
        receiver: actor,
        to: besideSeat(seats.kaname, seats[actor]),
        prop: 'scroll',
      }
    : { giver: actor, receiver: 'kaname', to: PLACES.counterFront, prop: 'chest' };
}

/** The handover, or かなめ alone at the reception when there is no department or no way to meet. */
function handoverTracks(
  kind: 'issue-opened' | 'pr-merged',
  actor: MemberId,
  start: number,
  seats: SceneContext['seats'],
): Track[] {
  const prop = kind === 'issue-opened' ? 'scroll' : 'chest';
  if (actor === 'kaname') return [reception(start, seats, prop)];
  const item = deliveryOf(kind, actor, seats);
  const way = findPath(seats[item.giver], item.to);
  // An item never changes hands between members who cannot meet.
  return way === null || way.length < 2
    ? [reception(start, seats, prop)]
    : deliver(item, start, seats);
}

export function planScene(event: GuildEvent, start: number, context: SceneContext): Scene {
  const actor = actorOf(event);
  if (event.kind === 'issue-closed') {
    return { tracks: [], bursts: [{ actor, start, particles: createConfetti(context.random) }] };
  }
  return { tracks: handoverTracks(event.kind, actor, start, context.seats), bursts: [] };
}

/** Seats from the guild config. */
export const DEFAULT_SEATS: Readonly<Record<MemberId, TilePos>> = {
  kaname: MEMBERS.kaname.seat,
  minori: MEMBERS.minori.seat,
  hibiki: MEMBERS.hibiki.seat,
  hirame: MEMBERS.hirame.seat,
  sasae: MEMBERS.sasae.seat,
  yukihiro: MEMBERS.yukihiro.seat,
};
