import type { TilePos } from '../guild.config';
import { SPRITE_SIZE, TILE_SIZE } from './metrics';

/**
 * The office as a tile map: 32 x 18 tiles (render/metrics.ts sets the pixel sizes). Pure data plus the
 * walkable grid derived from it. The layout follows assets/concept/rpg-company-ui.png:
 * the throne at the back centre, かなめ's counter in the middle, a desk in each wing and the door
 * at the bottom right. Nothing that matters is placed under the HTML windows (WINDOW_EXTENTS).
 */

export { TILE_SIZE } from './metrics';
export const MAP_COLS = 32;
export const MAP_ROWS = 18;
export const LOGICAL_WIDTH = MAP_COLS * TILE_SIZE;
export const LOGICAL_HEIGHT = MAP_ROWS * TILE_SIZE;

/** Tile kinds shared with the tile art (assets/tiles/tiles.ts). */
export const TILE_NAMES = [
  'floor',
  'floor-carpet',
  'wall',
  'wall-top',
  'window',
  'door',
  'counter',
  'desk',
  'chair',
  'shelf',
  'plant',
  'throne',
  'rug-red',
  'board',
  'crate',
] as const;
export type TileName = (typeof TILE_NAMES)[number];

/** A rectangle in tile units. */
export interface TileRect {
  readonly col: number;
  readonly row: number;
  readonly w: number;
  readonly h: number;
}

/** A piece of furniture drawn over the ground. Solid ones cannot be walked through. */
export interface MapObject extends TileRect {
  readonly tile: TileName;
  readonly solid: boolean;
}

/** A rectangle in logical px (edges, not size). */
export interface PxRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * App.vue places the windows in % of the stage (left / right / width of its width, top / bottom /
 * height of its height) and cqw (1 % of the stage width). The stage is the canvas, 1024 x 576
 * logical px, so 1 % across = 10.24 px, 1 % down = 5.76 px and 1cqw = 10.24 px.
 */
const PCT_X = LOGICAL_WIDTH / 100;
const PCT_Y = LOGICAL_HEIGHT / 100;
const CQW = LOGICAL_WIDTH / 100;

/** The most each window covers (logical px), from the numbers in App.vue's styles. */
export const WINDOW_EXTENTS: Readonly<Record<'board' | 'party' | 'message', PxRect>> = {
  // .stage__board: left 1.2%, top 1.6%, width 29%, max-height 31cqw (it scrolls beyond that)
  board: {
    left: 1.2 * PCT_X,
    top: 1.6 * PCT_Y,
    right: (1.2 + 29) * PCT_X,
    bottom: 1.6 * PCT_Y + 31 * CQW,
  },
  // .stage__side: right 1.1%, top 1.6%, width 24.6%. Its height is its content (party window and
  // fetch status): measured 324 px, 340 px with a failure line (Chrome, 2026-10-12). Rare extra
  // notes (localStorage unavailable) reach 355-373 px and may cover ささえ's head and bubble;
  // left for the president to decide (seat layout or the fetch window), see the M2 report.
  party: {
    left: (100 - 1.1 - 24.6) * PCT_X,
    top: 1.6 * PCT_Y,
    right: (100 - 1.1) * PCT_X,
    bottom: 340,
  },
  // .stage__message: left 9.8%, width 80.4%, bottom 1.9%, height 17.4%
  message: {
    left: 9.8 * PCT_X,
    top: (100 - 1.9 - 17.4) * PCT_Y,
    right: (9.8 + 80.4) * PCT_X,
    bottom: (100 - 1.9) * PCT_Y,
  },
};

/** The 64 x 64 frame of a member whose feet are on `pos` (bottom centre, as path.tileToPoint). */
export function spriteRect(pos: TilePos): PxRect {
  const x = pos.col * TILE_SIZE + TILE_SIZE / 2;
  const y = (pos.row + 1) * TILE_SIZE;
  return { left: x - SPRITE_SIZE / 2, top: y - SPRITE_SIZE, right: x + SPRITE_SIZE / 2, bottom: y };
}

/** True when the rectangles share some area (touching edges do not count). */
export function overlaps(a: PxRect, b: PxRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** True when any part of a member standing on `pos` would be under a window. */
export function isUnderWindow(pos: TilePos): boolean {
  const sprite = spriteRect(pos);
  return Object.values(WINDOW_EXTENTS).some((area) => overlaps(sprite, area));
}

/** Fixed places the scenes walk between. */
export const PLACES = {
  /** Where a visitor stands in front of かなめ's counter. */
  counterFront: { col: 16, row: 9 },
  /** The exit; a member who reaches it leaves the screen. */
  door: { col: 30, row: 17 },
} as const satisfies Record<string, TilePos>;

interface GroundFill extends TileRect {
  readonly tile: TileName;
}

const rect = (col: number, row: number, w: number, h: number): TileRect => ({ col, row, w, h });

/** Ground layer, painted in order (later fills win). */
const GROUND_FILLS: readonly GroundFill[] = [
  { tile: 'floor', ...rect(0, 0, MAP_COLS, MAP_ROWS) },
  { tile: 'floor-carpet', ...rect(9, 2, 5, 5) },
  { tile: 'floor-carpet', ...rect(19, 2, 5, 5) },
  { tile: 'floor-carpet', ...rect(1, 10, 8, 4) },
  { tile: 'floor-carpet', ...rect(23, 10, 6, 4) },
  { tile: 'rug-red', ...rect(15, 4, 3, 4) },
  { tile: 'rug-red', ...rect(14, 9, 5, 3) },
  { tile: 'wall', ...rect(0, 1, MAP_COLS, 1) },
  { tile: 'wall', ...rect(0, 1, 1, MAP_ROWS - 1) },
  { tile: 'wall', ...rect(MAP_COLS - 1, 1, 1, MAP_ROWS - 1) },
  { tile: 'wall', ...rect(0, MAP_ROWS - 1, MAP_COLS, 1) },
  { tile: 'wall-top', ...rect(0, 0, MAP_COLS, 1) },
  // The doorway in the bottom wall; the door itself is drawn over it (MAP_OBJECTS).
  { tile: 'floor', ...PLACES.door, w: 1, h: 1 },
];

const solid = (tile: TileName, area: TileRect): MapObject => ({ tile, solid: true, ...area });
const flat = (tile: TileName, area: TileRect): MapObject => ({ tile, solid: false, ...area });

/**
 * Furniture, sized to the pieces of assets/tiles/tiles.ts (a longer piece repeats: the counter is
 * three counter pieces). Chairs under the seats and the door are not solid, so members walk on them.
 * Windows and the door have see-through parts, so they go over the wall and floor, not instead.
 */
export const MAP_OBJECTS: readonly MapObject[] = [
  flat('window', rect(4, 1, 1, 1)),
  flat('window', rect(14, 1, 1, 1)),
  flat('window', rect(18, 1, 1, 1)),
  flat('window', rect(26, 1, 1, 1)),
  solid('throne', rect(15, 2, 2, 2)),
  solid('counter', rect(12, 8, 9, 1)),
  flat('door', rect(PLACES.door.col, PLACES.door.row - 1, 1, 2)),
  // 経理 (upper left wing)
  solid('desk', rect(10, 5, 2, 1)),
  flat('chair', rect(11, 4, 1, 1)),
  solid('shelf', rect(13, 2, 1, 2)),
  solid('plant', rect(12, 2, 1, 1)),
  // 広報 (upper right wing)
  solid('desk', rect(20, 5, 2, 1)),
  flat('chair', rect(21, 4, 1, 1)),
  solid('board', rect(21, 1, 2, 1)),
  solid('plant', rect(19, 2, 1, 1)),
  // 企画 (lower left)
  solid('desk', rect(3, 13, 2, 1)),
  flat('chair', rect(4, 12, 1, 1)),
  solid('shelf', rect(1, 10, 1, 2)),
  solid('plant', rect(8, 11, 1, 1)),
  // 総務 (lower right, by the door)
  solid('desk', rect(25, 13, 2, 1)),
  flat('chair', rect(26, 12, 1, 1)),
  solid('shelf', rect(28, 10, 1, 2)),
  solid('crate', rect(29, 15, 1, 1)),
  solid('plant', rect(22, 12, 1, 1)),
];

const WALKABLE_GROUND: ReadonlySet<TileName> = new Set<TileName>([
  'floor',
  'floor-carpet',
  'rug-red',
]);

export function contains(area: TileRect, pos: TilePos): boolean {
  return (
    pos.col >= area.col &&
    pos.col < area.col + area.w &&
    pos.row >= area.row &&
    pos.row < area.row + area.h
  );
}

export function isInsideMap(pos: TilePos): boolean {
  return contains(rect(0, 0, MAP_COLS, MAP_ROWS), pos);
}

/** Ground tile of every cell, row by row. */
export function buildGround(): TileName[][] {
  const ground = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): TileName => 'floor'),
  );
  for (const fill of GROUND_FILLS) {
    for (let row = fill.row; row < fill.row + fill.h; row += 1) {
      ground[row]?.fill(fill.tile, fill.col, fill.col + fill.w);
    }
  }
  return ground;
}

export const GROUND: readonly (readonly TileName[])[] = buildGround();

export function groundAt(pos: TilePos): TileName | null {
  return GROUND[pos.row]?.[pos.col] ?? null;
}

/**
 * True where a member may walk: walkable ground, no solid furniture, and no part of the sprite
 * (64 px wide and tall, so it reaches into the tiles beside and above) under a window, so nobody
 * vanishes behind one on the way.
 */
export function isWalkable(pos: TilePos): boolean {
  const ground = groundAt(pos);
  if (ground === null || !WALKABLE_GROUND.has(ground)) return false;
  if (MAP_OBJECTS.some((object) => object.solid && contains(object, pos))) return false;
  return !isUnderWindow(pos);
}
