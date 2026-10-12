import type { DecorName } from '../../../../assets/decor/decor';
import type { MemberId, TilePos } from '../guild.config';
import { DECOR_PLACEMENTS } from './decor';
import { isWalkable, MAP_OBJECTS, type TileRect } from './map';
import { findPath, type TilePath } from './path';
import { DEFAULT_SEATS } from './scenes';

/**
 * Where members go to play after a long idle spell (idle.ts, Issue #23), worked out once from the
 * map: beside the mugs for tea, in front of the pet, under the nearer window, and beside the seat
 * of the neighbouring department for a chat. Only walkable tiles (never under an HTML window) that
 * can be reached from the member's seat are kept. The king never leaves the throne.
 */

/** The pet by the throne. Its picture may change; the play spot follows this one name. */
export const PET_DECOR: DecorName = 'sleeping-cat';
/** The things that mark the tea spot. */
export const TEA_DECOR: DecorName = 'mugs';

export type PlayKind = 'tea' | 'pet' | 'window' | 'chat';

export interface PlaySpot {
  readonly kind: PlayKind;
  /** Where the member stands. */
  readonly tile: TilePos;
  /** From the seat to the tile (both included); walked back in reverse. */
  readonly path: TilePath;
  /** Who the member chats with (chat only), to turn toward them. */
  readonly partner: MemberId | null;
}

/** Who chats with whom: the department across the counter on the same row. */
const CHAT_PARTNER: Readonly<Partial<Record<MemberId, MemberId>>> = {
  minori: 'hibiki',
  hibiki: 'minori',
  hirame: 'sasae',
  sasae: 'hirame',
};

const at = (base: TilePos, col: number, row: number): TilePos => ({
  col: base.col + col,
  row: base.row + row,
});

function decorAt(name: DecorName): TileRect | null {
  return DECOR_PLACEMENTS.find((item) => item.name === name) ?? null;
}

/** The first walkable tile of `tiles`, or null. */
function firstWalkable(tiles: readonly TilePos[]): TilePos | null {
  return tiles.find(isWalkable) ?? null;
}

/** In front of the pet (below it), else beside it. */
export function petTile(): TilePos | null {
  const pet = decorAt(PET_DECOR);
  if (pet === null) return null;
  return firstWalkable([at(pet, 0, pet.h), at(pet, -1, 0), at(pet, pet.w, 0)]);
}

/** Next to the mugs: behind the desk they stand on, at its left or right, else in front. */
export function teaTile(): TilePos | null {
  const mugs = decorAt(TEA_DECOR);
  if (mugs === null) return null;
  return firstWalkable([at(mugs, -1, -1), at(mugs, mugs.w, -1), at(mugs, 0, -1), at(mugs, 0, 1)]);
}

/** Right under each window (the row below it), the first walkable tile along it. */
export function windowTiles(): TilePos[] {
  return MAP_OBJECTS.filter((object) => object.tile === 'window').flatMap((window) => {
    const below = Array.from({ length: window.w }, (_, i) => at(window, i, window.h));
    const tile = firstWalkable(below);
    return tile === null ? [] : [tile];
  });
}

/** Beside the partner's seat, on the side the member comes from. */
export function chatTile(id: MemberId): TilePos | null {
  const partner = CHAT_PARTNER[id];
  if (partner === undefined) return null;
  const seat = DEFAULT_SEATS[partner];
  const side = DEFAULT_SEATS[id].col < seat.col ? -1 : 1;
  return firstWalkable([at(seat, side, 0), at(seat, -side, 0)]);
}

function spot(id: MemberId, kind: PlayKind, tile: TilePos | null): PlaySpot[] {
  if (tile === null) return [];
  const path = findPath(DEFAULT_SEATS[id], tile);
  if (path === null || path.length < 2) return [];
  return [{ kind, tile, path, partner: kind === 'chat' ? (CHAT_PARTNER[id] ?? null) : null }];
}

/** The window with the shortest walk from the member's seat. */
function nearestWindow(id: MemberId): PlaySpot[] {
  const spots = windowTiles()
    .flatMap((tile) => spot(id, 'window', tile))
    .sort((a, b) => a.path.length - b.path.length);
  return spots.slice(0, 1);
}

function spotsOf(id: MemberId): readonly PlaySpot[] {
  if (id === 'yukihiro') return [];
  return [
    ...spot(id, 'tea', teaTile()),
    ...spot(id, 'pet', petTile()),
    ...nearestWindow(id),
    ...spot(id, 'chat', chatTile(id)),
  ];
}

export const PLAY_SPOTS: Readonly<Record<MemberId, readonly PlaySpot[]>> = {
  kaname: spotsOf('kaname'),
  minori: spotsOf('minori'),
  hibiki: spotsOf('hibiki'),
  hirame: spotsOf('hirame'),
  sasae: spotsOf('sasae'),
  yukihiro: spotsOf('yukihiro'),
};
