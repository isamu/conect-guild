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
