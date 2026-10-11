/**
 * Every size of the drawing in one place (contract with assets/tiles and assets/sprites):
 * 32 x 18 tiles of 32 px (logical 1024 x 576), members drawn from 64 x 64 frames.
 */

export const TILE_SIZE = 32;
/** One sprite frame (square); the feet are at the bottom centre. */
export const SPRITE_SIZE = 64;
/**
 * Logical px per detail pixel. Small hand-made shapes (bubbles, placeholder boxes, confetti) are
 * designed on a 16 px tile grid and scaled by this, so they keep their proportions.
 */
export const DETAIL_SCALE = TILE_SIZE / 16;
/** How far above the feet held items and confetti are centred: just over the head. */
export const OVERHEAD_OFFSET = SPRITE_SIZE + 2 * DETAIL_SCALE;
/** How far a waiting bubble's top sits over OVERHEAD_OFFSET, in detail px (draw.ts). */
export const BUBBLE_RISE = 6;
/** The highest point drawn over a member, above the feet: the top of a bubble. */
export const OVERHEAD_TOP = OVERHEAD_OFFSET + BUBBLE_RISE * DETAIL_SCALE;

/**
 * The small moves members make when nothing happens (ambient.ts), kept quiet on purpose.
 * Times are ms, distances logical px. Each member waits `minIntervalMs`–`maxIntervalMs` between
 * their moves (drawn once per member from the injected random source).
 */
export const AMBIENT = {
  /** Redraw interval while only ambient moves show (about 7 fps). */
  frameMs: 140,
  minIntervalMs: 5_000,
  maxIntervalMs: 14_000,
  /** Desk work: an up-and-down bob while typing, and a short turn to the side for papers. */
  typingMs: 280,
  typingBobPx: 2,
  pageTurnMs: 560,
  /** Idle: look right then left, or stretch up. */
  lookMs: 840,
  stretchMs: 1_120,
  stretchPx: 4,
  /** かなめ with nothing at the reception: fanning (front and side frames in turn). */
  fanBurstMs: 2_520,
  fanStrokeMs: 280,
  /** かなめ with quests at the reception: the scroll at hand, nudged left and right. */
  scrollBurstMs: 3_360,
  scrollStepMs: 420,
  scrollShakePx: 2,
  handHeightPx: 22,
  /** The king with PRs to approve: a small sway on the throne. */
  fidgetBurstMs: 3_360,
  fidgetStepMs: 420,
  fidgetPx: 2,
} as const;
