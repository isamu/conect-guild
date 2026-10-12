/**
 * Every size of the drawing in one place (contract with assets/tiles and assets/sprites):
 * 32 x 18 tiles of 32 px (logical 1024 x 576), members drawn from 80 x 80 frames.
 */

export const TILE_SIZE = 32;
/** One sprite frame (square); the feet are at the bottom centre. */
export const SPRITE_SIZE = 80;
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
  /**
   * Desk work: typing (the front frame and the arms-in-front frame in turn, or an up-and-down bob
   * on a sheet without the holding frames), and a short turn to the side for papers.
   */
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
  handHeightPx: 28,
  /** The king with PRs to approve: a small sway on the throne. */
  fidgetBurstMs: 3_360,
  fidgetStepMs: 420,
  fidgetPx: 2,
  /** Lamps and candles: the flame brightens by up to this much (added light), changing every step. */
  flameGlow: 0.22,
  flameStepMs: 280,
  /** The sleeping cat rises 1 px for half of each breath. */
  breathMs: 2_520,
  breathPx: 1,
  /** Shifts each lamp's flicker and each cat's breath against the others. */
  decorPhaseStepMs: 377,
} as const;

/**
 * How far a member at a seat is drawn below the feet of their tile (logical px), so the furniture
 * in front hides the lower body (seating.ts). Measured on the tiles: a desk's back edge is 12 px
 * below its top, the counter's 3 px, the throne's seat cushion 62 px.
 */
export const SEATING = {
  /** On a chair behind a desk: the desk hides everything below the chest. */
  chairPx: 36,
  /** かなめ right behind the counter top: it hides her from the waist down. */
  counterPx: 30,
  /** The king deep in the throne: its seat and arms hide his legs. */
  thronePx: 26,
} as const;

/** Where a carried item is centred (motion.heldItemPoint), logical px from the feet. */
export const HOLD = {
  /** Up from the feet: between the chest and the waist. */
  carryHeightPx: 30,
  /** Forward of the middle when facing sideways: at the hands, a little out from the body. */
  carryForwardPx: 14,
  /** Up on every other step while walking in the carrying frame (it has no stepping legs). */
  walkBobPx: 2,
  /** Half the height of a raised item's picture (chest 31 px, scroll bundle 32 px): it sits on the hands. */
  raisedItemHalfPx: 16,
} as const;
