import { describe, expect, it } from 'vitest';
import type { TilePos } from '../guild.config';
import { MAP_COLS, MAP_ROWS } from './map';
import { findPath, pointToTile, tileToPoint } from './path';

const open = () => true;

function isConnected(path: readonly TilePos[]): boolean {
  return path.every((tile, i) => {
    const next = path[i + 1];
    if (next === undefined) return true;
    return Math.abs(tile.col - next.col) + Math.abs(tile.row - next.row) === 1;
  });
}

describe('tile ↔ logical point', () => {
  it('stands a member on the bottom centre of the tile', () => {
    expect(tileToPoint({ col: 0, row: 0 })).toEqual({ x: 16, y: 32 });
    expect(tileToPoint({ col: 16, row: 7 })).toEqual({ x: 528, y: 256 });
  });

  it('maps a feet point back to its own tile', () => {
    for (const tile of [
      { col: 0, row: 0 },
      { col: 31, row: 17 },
      { col: 16, row: 9 },
    ]) {
      expect(pointToTile(tileToPoint(tile))).toEqual(tile);
    }
  });

  it('maps points inside a tile to that tile', () => {
    expect(pointToTile({ x: 0.5, y: 0.5 })).toEqual({ col: 0, row: 0 });
    expect(pointToTile({ x: 31.9, y: 32 })).toEqual({ col: 0, row: 0 });
    expect(pointToTile({ x: 32, y: 32.1 })).toEqual({ col: 1, row: 1 });
  });
});

describe('findPath', () => {
  it('returns the single tile when start and goal are the same', () => {
    expect(findPath({ col: 3, row: 3 }, { col: 3, row: 3 }, open)).toEqual([{ col: 3, row: 3 }]);
  });

  it('finds a shortest connected path on an open floor', () => {
    const path = findPath({ col: 1, row: 1 }, { col: 4, row: 3 }, open);
    expect(path).not.toBeNull();
    if (path === null) return;
    expect(path).toHaveLength(6);
    expect(path[0]).toEqual({ col: 1, row: 1 });
    expect(path.at(-1)).toEqual({ col: 4, row: 3 });
    expect(isConnected(path)).toBe(true);
  });

  it('walks around a wall', () => {
    // A wall at col 2, rows 0..3; the way round is under it (row 4).
    const walkable = (p: TilePos) => !(p.col === 2 && p.row <= 3);
    const path = findPath({ col: 1, row: 0 }, { col: 3, row: 0 }, walkable);
    expect(path).not.toBeNull();
    if (path === null) return;
    expect(path).toHaveLength(11);
    expect(path.some((p) => p.row === 4)).toBe(true);
    expect(path.every((p) => walkable(p))).toBe(true);
    expect(isConnected(path)).toBe(true);
  });

  it('returns null when the goal is walled off', () => {
    const walkable = (p: TilePos) => p.col !== 5;
    expect(findPath({ col: 1, row: 1 }, { col: 8, row: 1 }, walkable)).toBeNull();
  });

  it('may start and end on unwalkable tiles (a seat behind a desk)', () => {
    const blocked = new Set(['0,0', '3,0']);
    const walkable = (p: TilePos) => !blocked.has(`${String(p.col)},${String(p.row)}`);
    const path = findPath({ col: 0, row: 0 }, { col: 3, row: 0 }, walkable);
    expect(path).toHaveLength(4);
  });

  it('never leaves the map, even when everything is walkable', () => {
    const path = findPath({ col: 0, row: 0 }, { col: MAP_COLS, row: 0 }, open);
    expect(path).toBeNull();
    const inside = findPath({ col: 0, row: 0 }, { col: MAP_COLS - 1, row: MAP_ROWS - 1 }, open);
    expect(inside).toHaveLength(MAP_COLS + MAP_ROWS - 1);
  });

  it('returns null when either end is outside the map', () => {
    expect(findPath({ col: -1, row: 0 }, { col: 3, row: 0 }, open)).toBeNull();
    expect(findPath({ col: 0, row: MAP_ROWS }, { col: 0, row: 0 }, open)).toBeNull();
    expect(findPath({ col: -1, row: 0 }, { col: -1, row: 0 }, open)).toBeNull();
  });

  it('uses the office grid by default', () => {
    const path = findPath({ col: 11, row: 4 }, { col: 16, row: 9 });
    expect(path).not.toBeNull();
    expect(path?.slice(1, -1).some((p) => p.row === 8 && p.col >= 13 && p.col <= 19)).toBe(false);
  });
});
