import type { GuildEvent } from '../domain/events';
import type { MemberId, TilePos } from '../guild.config';
import { ambientPose, type AmbientMoods, type AmbientSeeds, type HandProp } from './ambient';
import { burstOrigin, confettiAt, CONFETTI_MS, type PlacedParticle } from './confetti';
import type { IdleMark, IdlePose, IdlePoses } from './idle';
import { poseOnSegment, standingPose, type Pose, type Segment, type SpriteFrame } from './motion';
import { tileToPoint, type Point } from './path';
import { seatedPoint } from './seating';
import { castOf, planScene, type Burst, type SceneContext, type Track } from './scenes';

/**
 * Plays scenes back: which scenes are running, where every member is at a given time, and when
 * the stage goes quiet. Immutable and pure (time is passed in), so the render loop only draws.
 * A member is in one scene at a time: a scene that needs a busy member waits until they are back.
 */

export interface Director {
  readonly tracks: readonly Track[];
  readonly bursts: readonly Burst[];
  /** When each member's last scheduled track ends. */
  readonly busyUntil: Readonly<Partial<Record<MemberId, number>>>;
}

const MEMBER_IDS: readonly MemberId[] = [
  'kaname',
  'minori',
  'hibiki',
  'hirame',
  'sasae',
  'yukihiro',
];

export const EMPTY_DIRECTOR: Director = { tracks: [], bursts: [], busyUntil: {} };

/** A member at their seat with an ambient move: may type with a holding frame, holds nothing. */
export interface SeatPose {
  readonly point: Point;
  readonly frame: SpriteFrame;
  readonly flip: boolean;
  readonly held: null;
}

export interface MemberPose {
  readonly id: MemberId;
  /** Drawn here: on a seat the point is sunk into it (seating.ts). */
  readonly pose: Pose | SeatPose;
  /**
   * The y of the feet on the tile, before sinking and ambient offsets: members and the furniture in
   * front of them (layers.ts) are drawn back to front by it.
   */
  readonly depth: number;
  /** An item the member handles at their seat (ambient), placed from the feet; null otherwise. */
  readonly hand: HandProp | null;
  /** True while the member is in a scene (inScene): no ambient move and no waiting bubble. */
  readonly inScene: boolean;
  /** A sign over the head in a long idle spell ("Z", "…", "♪"); null otherwise. */
  readonly mark: IdleMark | null;
  /** True while the member's feet are on their seat (isAtSeat). */
  readonly atSeat: boolean;
}

/** The small moves while members are out of scenes (ambient.ts). */
export interface AmbientContext {
  readonly moods: AmbientMoods;
  readonly seeds: AmbientSeeds;
  /** True when the member's sheet has the holding frames (art.SpriteArt.hasHoldFrames). */
  readonly hasHoldFrames: (id: MemberId) => boolean;
  /** Members in a long idle spell (idle.ts): these replace the ambient move out of scenes. */
  readonly idle?: IdlePoses;
}

export interface ConfettiView {
  readonly origin: Point;
  readonly particles: readonly PlacedParticle[];
}

export interface StageFrame {
  /** Every member, back to front (by `depth`). */
  readonly members: readonly MemberPose[];
  readonly confetti: readonly ConfettiView[];
}

export function trackEnd(track: Track): number {
  return track.segments.at(-1)?.end ?? Number.NEGATIVE_INFINITY;
}

/** When the cast of an event's scene is free: `now`, or when the last of them is back. */
export function castFreeAt(director: Director, event: GuildEvent, now: number): number {
  return Math.max(now, ...castOf(event).map((id) => director.busyUntil[id] ?? now));
}

/**
 * Adds the scene for an event, starting at `now` or when its cast is free, whichever is later.
 * The message queue (app/messageQueue.ts) shows a message only once its cast is free, so the scene
 * starts with the message. The wait stays for when they part (the ▼ button skips ahead, or cues
 * that arrived while the pictures loaded play together): members never teleport.
 */
export function scheduleEvent(
  director: Director,
  event: GuildEvent,
  now: number,
  context: SceneContext,
): Director {
  const start = castFreeAt(director, event, now);
  const scene = planScene(event, start, context);
  const busyUntil = { ...director.busyUntil };
  for (const track of scene.tracks) busyUntil[track.actor] = trackEnd(track);
  return {
    tracks: [...director.tracks, ...scene.tracks],
    bursts: [...director.bursts, ...scene.bursts],
    busyUntil,
  };
}

/**
 * A member out playing (idle.ts) walks back to their seat along `walk` (idle.homeWalk). As a track
 * it makes scenes for them wait until they are back.
 */
export function sendHome(director: Director, id: MemberId, walk: Segment): Director {
  return {
    ...director,
    tracks: [...director.tracks, { actor: id, segments: [walk] }],
    busyUntil: {
      ...director.busyUntil,
      [id]: Math.max(walk.end, director.busyUntil[id] ?? walk.end),
    },
  };
}

/** Where a member is at `now`: on a running track, otherwise standing at their seat. */
export function poseAt(director: Director, id: MemberId, now: number, seat: TilePos): Pose {
  for (const track of director.tracks) {
    if (track.actor !== id) continue;
    const segment = track.segments.find((s) => s.start <= now && now < s.end);
    if (segment !== undefined) return poseOnSegment(segment, now);
  }
  return standingPose(seat);
}

/** True while a member walks, stays or holds something in a scene, or has confetti over them. */
export function inScene(director: Director, id: MemberId, now: number): boolean {
  return (
    director.tracks.some(
      (track) => track.actor === id && track.segments.some((s) => s.start <= now && now < s.end),
    ) ||
    director.bursts.some(
      (burst) => burst.actor === id && burst.start <= now && now < burst.start + CONFETTI_MS,
    )
  );
}

/**
 * True while the member's feet are on their seat at `now`: false while they walk or stand away in a
 * scene (a handover), are out playing in a long idle spell (`idle`, idle.ts) or walk back from it
 * (director.sendHome). Picking up or holding up an item at the seat, confetti over it, dozing and
 * sleeping keep them at the seat. Ambient moves are not counted: they never leave the seat.
 */
export function isAtSeat(
  director: Director,
  now: number,
  member: { readonly id: MemberId; readonly seat: TilePos; readonly idle: IdlePose | undefined },
): boolean {
  const { id, seat, idle } = member;
  const feet =
    idle !== undefined && !inScene(director, id, now)
      ? idle.feet
      : poseAt(director, id, now, seat).point;
  const home = tileToPoint(seat);
  return feet.x === home.x && feet.y === home.y;
}

/** The member as their long idle spell shows them: dozing, asleep or out playing. */
function idleMember(id: MemberId, idle: IdlePose, atSeat: boolean): MemberPose {
  const sunk = seatedPoint(idle.feet);
  return {
    id,
    pose: {
      point: { x: sunk.x + idle.offset.x, y: sunk.y + idle.offset.y },
      frame: idle.frame,
      flip: idle.flip,
      held: null,
    },
    depth: idle.feet.y,
    hand: null,
    inScene: false,
    mark: idle.mark,
    atSeat,
  };
}

/** Applies the member's ambient move to the pose at their seat; scenes are left as they are. */
function withAmbient(
  member: MemberPose,
  now: number,
  ambient: AmbientContext | undefined,
): MemberPose {
  const mood = ambient?.moods[member.id];
  if (ambient === undefined || mood === undefined || member.inScene) {
    return member;
  }
  if (ambient.idle?.[member.id] !== undefined) return member;
  const move = ambientPose(mood, ambient.seeds[member.id], now, ambient.hasHoldFrames(member.id));
  const { point } = member.pose;
  return {
    ...member,
    pose: {
      point: { x: point.x + move.offset.x, y: point.y + move.offset.y },
      frame: move.frame,
      flip: move.flip,
      held: null,
    },
    hand: move.hand,
  };
}

export function frameAt(
  director: Director,
  now: number,
  seats: Readonly<Record<MemberId, TilePos>>,
  ambient?: AmbientContext,
): StageFrame {
  // Ordered by the tile before sinking and the ambient offsets, so a bob never swaps who is in front.
  const members = MEMBER_IDS.map((id): MemberPose => {
    const scene = inScene(director, id, now);
    const idle = ambient?.idle?.[id];
    const atSeat = isAtSeat(director, now, { id, seat: seats[id], idle });
    if (!scene && idle !== undefined) return idleMember(id, idle, atSeat);
    const pose = poseAt(director, id, now, seats[id]);
    return {
      id,
      pose: { ...pose, point: seatedPoint(pose.point) },
      depth: pose.point.y,
      hand: null,
      inScene: scene,
      mark: null,
      atSeat,
    };
  })
    .sort((a, b) => a.depth - b.depth)
    .map((member) => withAmbient(member, now, ambient));
  // Over the seat, even while the member walks to the counter and back.
  const confetti = director.bursts
    .map((burst): ConfettiView => ({
      origin: burstOrigin(seatedPoint(standingPose(seats[burst.actor]).point)),
      particles: confettiAt(burst.particles, now - burst.start),
    }))
    .filter((view) => view.particles.length > 0);
  return { members, confetti };
}

/** True while anything is moving or still to come (the loop may sleep otherwise). */
export function isAnimating(director: Director, now: number): boolean {
  return (
    director.tracks.some((track) => trackEnd(track) > now) ||
    director.bursts.some((burst) => burst.start + CONFETTI_MS > now)
  );
}

/** Drops finished tracks and bursts so the director does not grow forever. */
export function prune(director: Director, now: number): Director {
  const busyUntil: Partial<Record<MemberId, number>> = {};
  for (const id of MEMBER_IDS) {
    const until = director.busyUntil[id];
    if (until !== undefined && until > now) busyUntil[id] = until;
  }
  return {
    tracks: director.tracks.filter((track) => trackEnd(track) > now),
    bursts: director.bursts.filter((burst) => burst.start + CONFETTI_MS > now),
    busyUntil,
  };
}
