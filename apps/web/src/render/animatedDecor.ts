import { DECOR_MOTION, type DecorMotion } from './ambient';
import { DECOR_PLACEMENTS, isFloorPatch, type DecorPlacement } from './decor';
import { AMBIENT } from './metrics';
import { triggerOf, type DecorTrigger } from './trinkets';

/**
 * The decor of decor.ts split by whether it moves (DECOR_MOTION in ambient.ts). Kept apart from
 * decor.ts, whose placements map.ts reads, so the map does not depend on the motion modules.
 */

/** Drawn once after the furniture, lower ones last so they overlap the ones behind them. */
export const STILL_DECOR: readonly DecorPlacement[] = DECOR_PLACEMENTS.filter(
  (item) => !isFloorPatch(item) && DECOR_MOTION[item.name] === undefined,
).toSorted((a, b) => a.row + a.h - (b.row + b.h));

export interface AnimatedDecor {
  readonly placement: DecorPlacement;
  readonly motion: DecorMotion;
  /** Shifts this one's flicker or breath against the others. */
  readonly phaseMs: number;
  /** When it moves (trinkets.ts); null when it always does (the lamps and the pet). */
  readonly trigger: DecorTrigger | null;
}

/** Drawn every frame (the lamps, the pet and the things that move at times), under the members. */
export const ANIMATED_DECOR: readonly AnimatedDecor[] = DECOR_PLACEMENTS.flatMap((placement) => {
  const motion = DECOR_MOTION[placement.name];
  return motion === undefined ? [] : [{ placement, motion }];
}).map(({ placement, motion }, index) => ({
  placement,
  motion,
  phaseMs: index * AMBIENT.decorPhaseStepMs,
  trigger: triggerOf(placement),
}));
