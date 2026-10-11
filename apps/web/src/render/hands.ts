import type { MemberId } from '../guild.config';
import { HOLD, OVERHEAD_OFFSET, SPRITE_SIZE } from './metrics';
import {
  heldItemPoint,
  type Held,
  type Hold,
  type HoldFrame,
  type MoveFrame,
  type Pose,
  type SpriteFrame,
} from './motion';
import type { Point } from './path';

/**
 * Holding frames and where the hands are in them. A sheet of 7 frames adds 4 (both hands up,
 * front), 5 (both arms in front, front) and 6 (both arms in front, facing right; mirrored for
 * left). A sheet of the first 4 frames only falls back to the standing / walking frames with the
 * item placed by motion.heldItemPoint. Pure.
 */

/** Frames in a sheet that has the holding frames. */
export const FRAMES_WITH_HOLDS = 7;

/** True when a sheet `width` px wide has the holding frames. */
export function hasHoldFrames(width: number): boolean {
  return Math.floor(width / SPRITE_SIZE) >= FRAMES_WITH_HOLDS;
}

/** Where the held item is centred in a holding frame, px from the feet. */
export interface HandPosition {
  /** Up from the feet. */
  readonly up: number;
  /** Toward the facing side (frame 6; the front frames keep it 0). */
  readonly forward: number;
}

/**
 * 仮の値: the same for everyone, matching the fallback positions. Replace each member's numbers
 * with the ones measured on the holding frames once the sheets are drawn.
 */
const PROVISIONAL_HANDS: Readonly<Record<HoldFrame, HandPosition>> = {
  4: { up: OVERHEAD_OFFSET, forward: 0 },
  5: { up: HOLD.carryHeightPx, forward: 0 },
  6: { up: HOLD.carryHeightPx, forward: HOLD.carryForwardPx },
};

export const HANDS: Readonly<Record<MemberId, Readonly<Record<HoldFrame, HandPosition>>>> = {
  kaname: PROVISIONAL_HANDS,
  minori: PROVISIONAL_HANDS,
  hibiki: PROVISIONAL_HANDS,
  hirame: PROVISIONAL_HANDS,
  sasae: PROVISIONAL_HANDS,
  yukihiro: PROVISIONAL_HANDS,
};

/** Raised: hands up. Carried: arms in front, facing front when standing, sideways when walking. */
export function holdFrameOf(frame: MoveFrame, hold: Hold): HoldFrame {
  if (hold === 'raise') return 4;
  return frame === 0 ? 5 : 6;
}

/** How a member holding something is drawn: the frame, facing, feet and the item's centre. */
export interface HeldLook {
  readonly frame: SpriteFrame;
  readonly flip: boolean;
  readonly feet: Point;
  readonly item: Point;
}

export function heldLook(id: MemberId, pose: Pose, held: Held, withHoldFrames: boolean): HeldLook {
  if (!withHoldFrames) {
    return {
      frame: pose.frame,
      flip: pose.flip,
      feet: pose.point,
      item: heldItemPoint(pose, held.hold),
    };
  }
  const frame = holdFrameOf(pose.frame, held.hold);
  const flip = frame === 6 && pose.flip;
  // Frame 6 has no stepping legs: a small bob on every other step keeps it walking.
  const bob = pose.frame === 3 ? HOLD.walkBobPx : 0;
  const feet = { x: pose.point.x, y: pose.point.y - bob };
  const hand = HANDS[id][frame];
  return {
    frame,
    flip,
    feet,
    item: { x: feet.x + (flip ? -hand.forward : hand.forward), y: feet.y - hand.up },
  };
}
