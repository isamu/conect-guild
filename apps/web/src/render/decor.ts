import { DECOR, type DecorName } from '../../../../assets/decor/decor';
import { DECOR_MOTION, type DecorMotion } from './ambient';
import type { TileRect } from './map';
import { AMBIENT } from './metrics';
import { triggerOf, type DecorTrigger } from './trinkets';

/**
 * The small things that make the office busy (assets/decor/decor.ts): on the walls, on the desks
 * and the counter, and on the floor. Pure data. Each department's corner has its own things
 * (経理: abacus, ledgers, coins, safe; 広報: posters, megaphone, flyers, easel; 企画: map table,
 * blueprints, globe, model; 総務: files, key board, toolbox); the rest is shared.
 * Floor things block the way (members walk around them); things on desks, the counter and the
 * walls sit on cells nobody walks on anyway. A light patch is a flat floor patch, drawn every
 * frame as it drifts with the sun (daylight.ts).
 */

export interface DecorPlacement extends TileRect {
  readonly name: DecorName;
  /** True when members cannot walk on its cells. */
  readonly solid: boolean;
}

/** Flat floor patches: drawn with the ground, under the furniture, and walked on. */
const FLOOR_PATCHES: ReadonlySet<DecorName> = new Set<DecorName>(['light-patch']);

function place(name: DecorName, col: number, row: number): DecorPlacement {
  const { w, h } = DECOR[name];
  return { name, col, row, w, h, solid: !FLOOR_PATCHES.has(name) };
}

function isFloorPatch(placement: DecorPlacement): boolean {
  return FLOOR_PATCHES.has(placement.name);
}

export const DECOR_PLACEMENTS: readonly DecorPlacement[] = [
  // Back wall around the throne (the corners are under the HTML windows)
  place('sconce', 15, 1),
  place('sconce', 17, 1),
  place('banner', 18, 1),
  place('poster-cat', 19, 1),
  place('poster-stripes', 19, 2),
  place('plant-hanging', 20, 1),
  // Side walls below the windows
  place('sconce', 0, 11),
  place('banner', 0, 14),
  place('key-board', 31, 12),
  place('lantern', 31, 13),
  // 経理 (upper left)
  place('safe', 10, 3),
  place('candlestick', 10, 5),
  place('abacus', 11, 5),
  place('ledger-stack', 12, 5),
  place('coin-pile', 13, 5),
  place('plant-small', 14, 3),
  // 広報 (upper right)
  place('easel', 22, 3),
  place('megaphone', 19, 5),
  place('open-book', 20, 5),
  place('flyers', 21, 5),
  place('mugs', 22, 5),
  place('sleeping-cat', 18, 3),
  // かなめ's counter and the hall
  place('jar', 14, 8),
  place('flower-vase', 18, 8),
  place('pillar-lamp', 11, 7),
  place('pillar-lamp', 21, 7),
  place('plant-tall', 10, 7),
  place('book-pile-tall', 10, 9),
  place('plant-large', 22, 8),
  place('sacks', 22, 10),
  // 企画 (lower left)
  place('map-table', 3, 11),
  place('stool', 6, 12),
  place('globe', 9, 11),
  place('model', 10, 11),
  place('blueprint-rolls', 11, 11),
  place('lantern', 12, 11),
  // 総務 (lower right)
  place('inkwell', 20, 11),
  place('file-stack', 21, 11),
  place('hourglass', 22, 11),
  place('toolbox', 23, 11),
  place('file-cabinet', 26, 11),
  place('crate-stack', 28, 11),
  place('barrel', 30, 11),
  // Light on the floor of the bottom corridor
  place('light-patch', 14, 13),
  place('light-patch', 24, 13),
  // Corners beside the message window
  place('barrel-pair', 1, 14),
  place('sacks', 2, 15),
  place('barrel-small', 2, 16),
  place('barrel-small', 29, 14),
  place('plant-large', 29, 15),
];

/** Drawn every frame over the cached ground, before the members (they drift with the sun). */
export const FLOOR_PATCH_DECOR: readonly DecorPlacement[] = DECOR_PLACEMENTS.filter(isFloorPatch);

/** Drawn once after the furniture, lower ones last so they overlap the ones behind them. */
export const STILL_DECOR: readonly DecorPlacement[] = DECOR_PLACEMENTS.filter(
  (item) => !isFloorPatch(item) && DECOR_MOTION[item.name] === undefined,
).sort((a, b) => a.row + a.h - (b.row + b.h));

export interface AnimatedDecor {
  readonly placement: DecorPlacement;
  readonly motion: DecorMotion;
  /** Shifts this one's flicker or breath against the others. */
  readonly phaseMs: number;
  /** When it moves (trinkets.ts); null when it always does (the lamps and the cat). */
  readonly trigger: DecorTrigger | null;
}

/** Drawn every frame (the lamps, the cat and the things that move at times), under the members. */
export const ANIMATED_DECOR: readonly AnimatedDecor[] = DECOR_PLACEMENTS.flatMap((placement) => {
  const motion = DECOR_MOTION[placement.name];
  return motion === undefined ? [] : [{ placement, motion, phaseMs: 0 }];
}).map((item, index) => ({
  ...item,
  phaseMs: index * AMBIENT.decorPhaseStepMs,
  trigger: triggerOf(item.placement),
}));
