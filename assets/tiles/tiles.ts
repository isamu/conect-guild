// Tile positions in tileset.png, in 16px tile units.
// w/h are how many tiles the piece covers; keep in sync with build_tileset.py.
export const TILE_SIZE = 16;

export const TILES = {
  floor: { col: 0, row: 0, w: 1, h: 1 },
  'floor-carpet': { col: 1, row: 0, w: 1, h: 1 },
  wall: { col: 2, row: 0, w: 1, h: 1 },
  'wall-top': { col: 3, row: 0, w: 1, h: 1 },
  'rug-red': { col: 4, row: 0, w: 1, h: 1 },
  window: { col: 5, row: 0, w: 1, h: 1 },
  plant: { col: 6, row: 0, w: 1, h: 1 },
  chair: { col: 7, row: 0, w: 1, h: 1 },
  crate: { col: 0, row: 1, w: 1, h: 1 },
  desk: { col: 1, row: 1, w: 2, h: 1 },
  board: { col: 3, row: 1, w: 2, h: 1 },
  counter: { col: 5, row: 1, w: 3, h: 1 },
  door: { col: 0, row: 2, w: 1, h: 2 },
  shelf: { col: 1, row: 2, w: 1, h: 2 },
  throne: { col: 2, row: 2, w: 2, h: 2 },
} as const;

export type TileName = keyof typeof TILES;
