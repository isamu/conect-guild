import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import { DECOR_PLACEMENTS } from './decor';
import {
  chatTile,
  PET_DECOR,
  petTile,
  PLAY_SPOTS,
  teaTile,
  TEA_DECOR,
  windowTiles,
} from './idleSpots';
import { contains, isUnderWindow, isWalkable, MAP_OBJECTS } from './map';
import { DEFAULT_SEATS } from './scenes';

const IDS: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'];
const SEAT_KEYS = new Set(
  Object.values(DEFAULT_SEATS).map((s) => `${String(s.col)},${String(s.row)}`),
);
const touches = (a: { col: number; row: number }, b: { col: number; row: number }) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;

describe('PLAY_SPOTS', () => {
  it('stands every member on a walkable tile, never under a window and never on a seat', () => {
    for (const id of IDS) {
      for (const spot of PLAY_SPOTS[id]) {
        expect(isWalkable(spot.tile)).toBe(true);
        expect(isUnderWindow(spot.tile)).toBe(false);
        expect(SEAT_KEYS.has(`${String(spot.tile.col)},${String(spot.tile.row)}`)).toBe(false);
      }
    }
  });

  it('walks there from the seat along the walkable tiles only, one step at a time', () => {
    for (const id of IDS) {
      for (const { path, tile } of PLAY_SPOTS[id]) {
        expect(path[0]).toEqual(DEFAULT_SEATS[id]);
        expect(path.at(-1)).toEqual(tile);
        path.slice(1).forEach((step, i) => {
          expect(isWalkable(step)).toBe(true);
          expect(touches(step, path[i] ?? step)).toBe(true);
        });
      }
    }
  });

  it('keeps the king on the throne and gives the others tea, the pet and a window', () => {
    expect(PLAY_SPOTS.yukihiro).toEqual([]);
    for (const id of ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'] as const) {
      const kinds = PLAY_SPOTS[id].map((spot) => spot.kind);
      expect(kinds).toEqual(expect.arrayContaining(['tea', 'pet', 'window']));
    }
  });

  it('lets the departments chat with the one across the counter, and かなめ not', () => {
    expect(PLAY_SPOTS.kaname.some((spot) => spot.kind === 'chat')).toBe(false);
    const pairs = [
      ['minori', 'hibiki'],
      ['hibiki', 'minori'],
      ['hirame', 'sasae'],
      ['sasae', 'hirame'],
    ] as const;
    for (const [id, partner] of pairs) {
      const chat = PLAY_SPOTS[id].find((spot) => spot.kind === 'chat');
      expect(chat?.partner).toBe(partner);
      expect(chat && touches(chat.tile, DEFAULT_SEATS[partner])).toBe(true);
    }
  });
});

describe('the places', () => {
  it('finds the pet by its one name, in front of it', () => {
    const pet = DECOR_PLACEMENTS.find((item) => item.name === PET_DECOR);
    const tile = petTile();
    expect(pet).toBeDefined();
    expect(tile).toEqual({ col: pet?.col, row: (pet?.row ?? 0) + (pet?.h ?? 0) });
  });

  it('stands next to the mugs for tea', () => {
    const mugs = DECOR_PLACEMENTS.find((item) => item.name === TEA_DECOR);
    const tile = teaTile();
    expect(mugs).toBeDefined();
    expect(tile).not.toBeNull();
    if (mugs === undefined || tile === null) return;
    expect(Math.abs(tile.col - mugs.col)).toBeLessThanOrEqual(1);
    expect(Math.abs(tile.row - mugs.row)).toBeLessThanOrEqual(1);
  });

  it('stands right under each window', () => {
    const windows = MAP_OBJECTS.filter((object) => object.tile === 'window');
    const tiles = windowTiles();
    expect(tiles).toHaveLength(windows.length);
    tiles.forEach((tile, i) => {
      const window = windows[i];
      expect(window && contains({ ...window, row: window.row + window.h, h: 1 }, tile)).toBe(true);
    });
  });

  it('has no chat place for かなめ and the king', () => {
    expect(chatTile('kaname')).toBeNull();
    expect(chatTile('yukihiro')).toBeNull();
  });
});
