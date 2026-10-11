import type { GuildEvent } from '../domain/events';
import { DEPARTMENT_MEMBER, MEMBERS, type MemberId, type TilePos } from '../guild.config';
import { createConfetti, type Particle, type Random } from './confetti';
import { PLACES } from './map';
import { staySegment, walkSegment, type Prop, type Segment } from './motion';
import { findPath, type TilePath } from './path';

/**
 * Event → scene script (docs/DESIGN.md 4.4 and chapter 6 M2). Pure: the start time and the random
 * source are passed in, and the result is plain data the director plays back.
 *
 * - issue-opened: かなめ holds out the scroll; the member walks to the counter, takes it, walks
 *   out of the door, stays away a while and walks back to the seat
 * - pr-merged: the member steps out of the door and comes back carrying a treasure chest
 * - issue-closed: confetti over the member's head
 * - no department: かなめ only takes the scroll / chest at the reception (confetti stays the same)
 */

export const HANDOVER_MS = 1_200;
export const AWAY_MS = 4_000;
export const FETCH_MS = 1_500;
export const SHOW_MS = 2_000;
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
  return event.kind === 'issue-opened' && actor !== 'kaname' ? [actor, 'kaname'] : [actor];
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

  stay(ms: number, options: { prop?: Prop | null; visible?: boolean } = {}): this {
    return this.push(staySegment(this.at, this.cursor, ms, options), this.at);
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

function questOut(actor: MemberId, start: number, seats: SceneContext['seats']): Track[] {
  const member = new TrackBuilder(actor, start, seats[actor]).walk(PLACES.counterFront);
  const handover = member.time + HANDOVER_MS / 2;
  member
    .stay(HANDOVER_MS / 2)
    .stay(HANDOVER_MS / 2, { prop: 'scroll' })
    .walk(PLACES.door, 'scroll')
    .stay(AWAY_MS, { visible: false })
    .walk(seats[actor]);
  const kaname = new TrackBuilder('kaname', start, seats.kaname).stay(handover - start, {
    prop: 'scroll',
  });
  return [member.build(), kaname.build()];
}

function treasureBack(actor: MemberId, start: number, seats: SceneContext['seats']): Track {
  return new TrackBuilder(actor, start, seats[actor])
    .walk(PLACES.door)
    .stay(FETCH_MS, { visible: false })
    .walk(seats[actor], 'chest')
    .stay(SHOW_MS, { prop: 'chest' })
    .build();
}

function reception(start: number, seats: SceneContext['seats'], prop: Prop): Track {
  return new TrackBuilder('kaname', start, seats.kaname).stay(RECEPTION_MS, { prop }).build();
}

export function planScene(event: GuildEvent, start: number, context: SceneContext): Scene {
  const actor = actorOf(event);
  const { seats } = context;
  switch (event.kind) {
    case 'issue-closed':
      return {
        tracks: [],
        bursts: [{ actor, start, particles: createConfetti(context.random) }],
      };
    case 'issue-opened':
      return {
        tracks:
          actor === 'kaname' ? [reception(start, seats, 'scroll')] : questOut(actor, start, seats),
        bursts: [],
      };
    case 'pr-merged':
      return {
        tracks: [
          actor === 'kaname' ? reception(start, seats, 'chest') : treasureBack(actor, start, seats),
        ],
        bursts: [],
      };
  }
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
