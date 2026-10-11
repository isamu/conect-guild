import type { TilePos } from '../guild.config';
import { tileToPoint, type Point, type TilePath } from './path';

/**
 * Timed movement of one member, as pure data: a segment either walks a tile path or stays on one
 * tile. All times are milliseconds on the clock the caller injects.
 */

/** What a member holds up over their head. */
export type Prop = 'scroll' | 'chest';

/** Sprite frame: 0 front, 1 side standing, 2 and 3 side walking (contract with the sprite art). */
export type SpriteFrame = 0 | 1 | 2 | 3;

export const MS_PER_TILE = 250;
export const STEP_FRAME_MS = 160;

export interface Segment {
  readonly start: number;
  /** Exclusive. */
  readonly end: number;
  /** One tile for a stay, two or more for a walk. */
  readonly path: TilePath;
  readonly prop: Prop | null;
}

export interface Pose {
  /** Feet, in logical pixels. */
  readonly point: Point;
  readonly frame: SpriteFrame;
  /** True when facing left (the art draws the right-facing frame mirrored). */
  readonly flip: boolean;
  readonly prop: Prop | null;
}

export function staySegment(
  at: TilePos,
  start: number,
  durationMs: number,
  prop: Prop | null = null,
): Segment {
  return { start, end: start + durationMs, path: [at], prop };
}

/** Walks the path at MS_PER_TILE per step. A one-tile path takes no time. */
export function walkSegment(path: TilePath, start: number, prop: Prop | null = null): Segment {
  return {
    start,
    end: start + (path.length - 1) * MS_PER_TILE,
    path,
    prop,
  };
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Facing of the last sideways step at or before `step`; right when there was none. */
function facesLeft(path: readonly TilePos[], step: number): boolean {
  for (let i = step; i >= 0; i -= 1) {
    const from = path[i];
    const to = path[i + 1];
    if (from === undefined || to === undefined || from.col === to.col) continue;
    return to.col < from.col;
  }
  return false;
}

/** Pose on a segment at time `t` (clamped to the segment). */
export function poseOnSegment(segment: Segment, t: number): Pose {
  const base = { prop: segment.prop };
  const first = segment.path[0];
  if (segment.path.length < 2) return { ...base, point: tileToPoint(first), frame: 0, flip: false };
  const elapsed = Math.min(Math.max(t - segment.start, 0), segment.end - segment.start);
  const progress = elapsed / MS_PER_TILE;
  const step = Math.min(Math.floor(progress), segment.path.length - 2);
  const from = segment.path[step] ?? first;
  const to = segment.path[step + 1] ?? from;
  const frame: SpriteFrame = Math.floor(elapsed / STEP_FRAME_MS) % 2 === 0 ? 2 : 3;
  return {
    ...base,
    point: lerp(tileToPoint(from), tileToPoint(to), progress - step),
    frame,
    flip: facesLeft(segment.path, step),
  };
}

/** The member standing still on a tile (at their seat when nothing is happening). */
export function standingPose(at: TilePos): Pose {
  return { point: tileToPoint(at), frame: 0, flip: false, prop: null };
}
