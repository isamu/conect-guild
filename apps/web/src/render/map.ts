import type { TilePos } from '../guild.config';

/**
 * The office as a tile map: 32 x 18 tiles of 16 px (logical 512 x 288). Pure data plus the
 * walkable grid derived from it. The layout follows assets/concept/rpg-company-ui.png:
 * the throne at the back centre, かなめ's counter in the middle, a desk in each wing and the door
 * at the bottom right. Nothing that matters is placed under the HTML windows (HIDDEN_AREAS).
 */

export const TILE_SIZE = 16;
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

/** Where the HTML windows sit over the canvas (App.vue), in tiles, rounded outwards. */
export const HIDDEN_AREAS: Readonly<Record<'board' | 'party' | 'message', TileRect>> = {
  // left 1.2%, width 29%, up to about a third of the height (more with many quests)
  board: { col: 0, row: 0, w: 10, h: 10 },
  // right 1.1%, width 24.6%, down to about 45% of the height
  party: { col: 23, row: 0, w: 9, h: 9 },
  // 9.8% to 90.2% across, bottom 19%
  message: { col: 3, row: 14, w: 26, h: 4 },
};

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
  { tile: 'window', ...rect(13, 1, 1, 1) },
  { tile: 'window', ...rect(19, 1, 1, 1) },
  { tile: 'window', ...rect(4, 1, 1, 1) },
  { tile: 'window', ...rect(26, 1, 1, 1) },
  { tile: 'door', ...PLACES.door, w: 1, h: 1 },
];

const solid = (tile: TileName, area: TileRect): MapObject => ({ tile, solid: true, ...area });
const flat = (tile: TileName, area: TileRect): MapObject => ({ tile, solid: false, ...area });

/** Furniture. Chairs under the seats are not solid so the members can walk off them. */
export const MAP_OBJECTS: readonly MapObject[] = [
  solid('throne', rect(15, 2, 3, 2)),
  solid('counter', rect(13, 8, 7, 1)),
  // 経理 (upper left wing)
  solid('desk', rect(10, 5, 3, 1)),
  flat('chair', rect(11, 4, 1, 1)),
  solid('shelf', rect(9, 2, 2, 1)),
  solid('plant', rect(12, 2, 1, 1)),
  // 広報 (upper right wing)
  solid('desk', rect(20, 5, 3, 1)),
  flat('chair', rect(21, 4, 1, 1)),
  solid('board', rect(21, 1, 2, 1)),
  solid('plant', rect(19, 2, 1, 1)),
  // 企画 (lower left)
  solid('desk', rect(3, 13, 3, 1)),
  flat('chair', rect(4, 12, 1, 1)),
  solid('shelf', rect(1, 10, 2, 1)),
  solid('plant', rect(8, 11, 1, 1)),
  // 総務 (lower right, by the door)
  solid('desk', rect(25, 13, 3, 1)),
  flat('chair', rect(26, 12, 1, 1)),
  solid('shelf', rect(27, 10, 2, 1)),
  solid('crate', rect(29, 15, 1, 1)),
  solid('plant', rect(22, 12, 1, 1)),
];

const WALKABLE_GROUND: ReadonlySet<TileName> = new Set<TileName>([
  'floor',
  'floor-carpet',
  'rug-red',
  'door',
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

export function isHidden(pos: TilePos): boolean {
  return Object.values(HIDDEN_AREAS).some((area) => contains(area, pos));
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
 * True where a member may walk: walkable ground, no solid furniture, and not under a window
 * (so nobody vanishes behind the message window on the way to the door).
 */
export function isWalkable(pos: TilePos): boolean {
  const ground = groundAt(pos);
  if (ground === null || !WALKABLE_GROUND.has(ground)) return false;
  if (MAP_OBJECTS.some((object) => object.solid && contains(object, pos))) return false;
  return !isHidden(pos);
}
