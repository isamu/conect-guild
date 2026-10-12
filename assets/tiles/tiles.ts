// Tile positions in tileset.png, in 32px tile units.
// w/h are how many tiles the piece covers; keep in sync with SHEET in build_tileset.py.
// A counter of any width is counter-left + counter-mid * n + counter-right.
export const TILE_SIZE = 32;

export const TILES = {
  floor: { col: 0, row: 0, w: 1, h: 1 },
  'floor-carpet': { col: 1, row: 0, w: 1, h: 1 },
  wall: { col: 2, row: 0, w: 1, h: 1 },
  'wall-top': { col: 3, row: 0, w: 1, h: 1 },
  'rug-red': { col: 4, row: 0, w: 1, h: 1 },
  plant: { col: 5, row: 0, w: 1, h: 1 },
  crate: { col: 6, row: 0, w: 1, h: 1 },
  desk: { col: 0, row: 1, w: 4, h: 2 },
  board: { col: 4, row: 1, w: 3, h: 2 },
  chair: { col: 7, row: 1, w: 1, h: 2 },
  window: { col: 8, row: 1, w: 2, h: 2 },
  throne: { col: 0, row: 3, w: 3, h: 3 },
  shelf: { col: 3, row: 3, w: 2, h: 3 },
  door: { col: 5, row: 3, w: 2, h: 3 },
  'counter-left': { col: 7, row: 3, w: 1, h: 2 },
  'counter-mid': { col: 8, row: 3, w: 1, h: 2 },
  'counter-right': { col: 9, row: 3, w: 1, h: 2 },
} as const;

export type TileName = keyof typeof TILES;
