import { describe, expect, it } from 'vitest';
import { TILES, TILE_SIZE as SHEET_TILE_SIZE } from '../../../../assets/tiles/tiles';
import { MAP_OBJECTS, TILE_NAMES } from './map';
import { TILE_SIZE } from './metrics';
import { tileDraws } from './tileArt';

describe('tile art contract', () => {
  it('has a piece for every tile kind the map uses, at the same tile size', () => {
    expect(Object.keys(TILES).toSorted((a, b) => a.localeCompare(b))).toEqual(
      TILE_NAMES.toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it('cuts the sheet on the same grid as the map', () => {
    expect(SHEET_TILE_SIZE).toBe(TILE_SIZE);
  });

  it('sizes every piece of furniture in whole pieces, so none is cut off', () => {
    for (const object of MAP_OBJECTS) {
      const piece = TILES[object.tile];
      expect(object.w % piece.w).toBe(0);
      expect(object.h % piece.h).toBe(0);
    }
  });
});

describe('tileDraws', () => {
  it('draws a one-cell piece once, at the cell', () => {
    expect(tileDraws('floor', { col: 2, row: 3, w: 1, h: 1 })).toEqual([
      { sx: 0, sy: 0, sw: 32, sh: 32, dx: 64, dy: 96, dw: 32, dh: 32 },
    ]);
  });

  it('repeats a piece along a longer area', () => {
    const draws = tileDraws('counter-mid', { col: 14, row: 8, w: 5, h: 2 });
    expect(draws.map((d) => d.dx)).toEqual([14, 15, 16, 17, 18].map((c) => c * TILE_SIZE));
    for (const d of draws) {
      expect([d.sx, d.sy, d.sw, d.sh]).toEqual([8 * 32, 3 * 32, 32, 64]);
    }
  });

  it('cuts the last copy where the area ends', () => {
    const draws = tileDraws('desk', { col: 0, row: 0, w: 5, h: 2 });
    expect(draws.map((d) => d.dw)).toEqual([128, 32]);
    expect(draws.map((d) => d.sw)).toEqual([128, 32]);
  });

  it('draws a multi-cell piece whole', () => {
    expect(tileDraws('throne', { col: 15, row: 2, w: 3, h: 3 })).toEqual([
      { sx: 0, sy: 96, sw: 96, sh: 96, dx: 480, dy: 64, dw: 96, dh: 96 },
    ]);
  });

  it('draws nothing for an empty area', () => {
    expect(tileDraws('floor', { col: 0, row: 0, w: 0, h: 0 })).toEqual([]);
  });
});
