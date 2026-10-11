import type { TilePos } from '../guild.config';
import { isInsideMap, isWalkable, TILE_SIZE } from './map';

/** A point in logical pixels (512 x 288 space). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Feet of a member standing on a tile: the bottom centre of the cell. */
export function tileToPoint(pos: TilePos): Point {
  return { x: pos.col * TILE_SIZE + TILE_SIZE / 2, y: (pos.row + 1) * TILE_SIZE };
}

/** The tile a logical point falls in (a feet point maps back to its own tile). */
export function pointToTile(point: Point): TilePos {
  return {
    col: Math.floor(point.x / TILE_SIZE),
    row: Math.ceil(point.y / TILE_SIZE) - 1,
  };
}

/** A tile path with at least one tile. */
export type TilePath = readonly [TilePos, ...TilePos[]];

const STEPS: readonly TilePos[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
];

const keyOf = (pos: TilePos): string => `${String(pos.col)},${String(pos.row)}`;

function rebuild(parents: ReadonlyMap<string, TilePos>, goal: TilePos): TilePath {
  const path: [TilePos, ...TilePos[]] = [goal];
  let parent = parents.get(keyOf(goal));
  while (parent !== undefined) {
    path.unshift(parent);
    parent = parents.get(keyOf(parent));
  }
  return path;
}

/**
 * Shortest 4-way path on the walkable grid, both ends included. The ends themselves may be
 * unwalkable (a seat behind a desk is fine). Stays inside the map. Returns null when there is no way.
 */
export function findPath(
  from: TilePos,
  to: TilePos,
  walkable: (pos: TilePos) => boolean = isWalkable,
): TilePath | null {
  const goal = keyOf(to);
  const parents = new Map<string, TilePos>();
  const seen = new Set([keyOf(from)]);
  const queue: TilePos[] = [from];
  for (let head = queue.shift(); head !== undefined; head = queue.shift()) {
    if (keyOf(head) === goal) return rebuild(parents, head);
    for (const step of STEPS) {
      const next = { col: head.col + step.col, row: head.row + step.row };
      const key = keyOf(next);
      if (seen.has(key) || !isInsideMap(next)) continue;
      if (key !== goal && !walkable(next)) continue;
      seen.add(key);
      parents.set(key, head);
      queue.push(next);
    }
  }
  return null;
}
