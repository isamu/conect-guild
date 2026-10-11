import { describe, expect, it } from 'vitest';
import { MEMBERS, type MemberId } from '../guild.config';
import {
  contains,
  GROUND,
  groundAt,
  isUnderWindow,
  overlaps,
  spriteRect,
  isInsideMap,
  isWalkable,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAP_COLS,
  MAP_OBJECTS,
  MAP_ROWS,
  PLACES,
  TILE_NAMES,
  WINDOW_EXTENTS,
} from './map';
import { AMBIENT, OVERHEAD_TOP, SPRITE_SIZE } from './metrics';
import { findPath } from './path';

const WALKERS: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'];
const DEPARTMENT_MEMBERS: readonly MemberId[] = ['minori', 'hibiki', 'hirame', 'sasae'];

describe('map: size and contents', () => {
  it('is 32 x 18 tiles of 32 px (1024 x 576)', () => {
    expect([MAP_COLS, MAP_ROWS, LOGICAL_WIDTH, LOGICAL_HEIGHT]).toEqual([32, 18, 1024, 576]);
    expect(GROUND).toHaveLength(MAP_ROWS);
    for (const row of GROUND) expect(row).toHaveLength(MAP_COLS);
  });

  it('uses every tile kind of the art contract, and only those', () => {
    const used = new Set([...GROUND.flat(), ...MAP_OBJECTS.map((o) => o.tile)]);
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect([...used].sort(byName)).toEqual([...TILE_NAMES].sort(byName));
  });

  it('keeps every piece of furniture inside the map', () => {
    for (const object of MAP_OBJECTS) {
      expect(isInsideMap(object)).toBe(true);
      expect(isInsideMap({ col: object.col + object.w - 1, row: object.row + object.h - 1 })).toBe(
        true,
      );
    }
  });

  it('walls in the room and puts the door in the bottom wall', () => {
    expect(groundAt({ col: 0, row: 5 })).toBe('wall');
    expect(groundAt({ col: 31, row: 5 })).toBe('wall');
    expect(groundAt({ col: 5, row: 0 })).toBe('wall-top');
    // A doorway (floor) in the bottom wall, with the door drawn over it.
    expect(groundAt(PLACES.door)).toBe('floor');
    expect(groundAt({ col: PLACES.door.col - 1, row: PLACES.door.row })).toBe('wall');
    expect(PLACES.door.row).toBe(MAP_ROWS - 1);
    const door = MAP_OBJECTS.find((o) => o.tile === 'door');
    expect(door !== undefined && contains(door, PLACES.door) && !door.solid).toBe(true);
  });

  it('draws windows and the door over the wall, not in place of it (they are see-through)', () => {
    for (const tile of ['window', 'door'] as const) {
      expect(GROUND.flat().includes(tile)).toBe(false);
      expect(MAP_OBJECTS.some((o) => o.tile === tile)).toBe(true);
    }
    for (const window of MAP_OBJECTS.filter((o) => o.tile === 'window')) {
      expect(groundAt(window)).toBe('wall');
    }
  });

  it('has nothing outside the map', () => {
    expect(groundAt({ col: -1, row: 0 })).toBeNull();
    expect(groundAt({ col: 0, row: MAP_ROWS })).toBeNull();
    expect(isInsideMap({ col: MAP_COLS, row: 0 })).toBe(false);
  });
});

describe('map: places and seats', () => {
  it('puts the throne at the back centre with the king on it', () => {
    const throne = MAP_OBJECTS.find((o) => o.tile === 'throne');
    expect(throne).toBeDefined();
    if (throne === undefined) return;
    expect(contains(throne, MEMBERS.yukihiro.seat)).toBe(true);
    expect(throne.row).toBeLessThanOrEqual(3);
    // Centred on it: the throne's middle is the king's feet.
    expect(MEMBERS.yukihiro.seat.col + 0.5).toBe(throne.col + throne.w / 2);
  });

  it('puts かなめ right behind the counter, facing the counter front', () => {
    const counter = MAP_OBJECTS.find((o) => o.tile === 'counter');
    expect(counter).toBeDefined();
    if (counter === undefined) return;
    expect(contains(counter, { col: MEMBERS.kaname.seat.col, row: counter.row })).toBe(true);
    expect(MEMBERS.kaname.seat.row).toBe(counter.row - 1);
    expect(PLACES.counterFront).toEqual({ col: MEMBERS.kaname.seat.col, row: counter.row + 1 });
  });

  it.each(WALKERS)('seats %s where they can walk and are not under a window', (id) => {
    const seat = MEMBERS[id].seat;
    expect(isWalkable(seat)).toBe(true);
    // The whole sprite, head included, must be visible.
    expect(isUnderWindow(seat)).toBe(false);
  });

  it('keeps the king visible', () => {
    const seat = MEMBERS.yukihiro.seat;
    expect(isUnderWindow(seat)).toBe(false);
  });

  it('gives every member a different seat', () => {
    const keys = Object.values(MEMBERS).map((m) => `${String(m.seat.col)},${String(m.seat.row)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(DEPARTMENT_MEMBERS)('lets %s walk seat → counter → door → seat', (id) => {
    const seat = MEMBERS[id].seat;
    expect(findPath(seat, PLACES.counterFront)).not.toBeNull();
    expect(findPath(PLACES.counterFront, PLACES.door)).not.toBeNull();
    expect(findPath(PLACES.door, seat)).not.toBeNull();
  });

  it('places one desk in each wing, one per department member', () => {
    const desks = MAP_OBJECTS.filter((o) => o.tile === 'desk');
    expect(desks).toHaveLength(4);
    for (const id of DEPARTMENT_MEMBERS) {
      const seat = MEMBERS[id].seat;
      expect(desks.some((d) => contains(d, { col: seat.col, row: seat.row + 1 }))).toBe(true);
    }
  });
});

describe('map: walkable grid', () => {
  it('blocks walls, solid furniture and the outside', () => {
    expect(isWalkable({ col: 0, row: 10 })).toBe(false);
    expect(isWalkable({ col: 16, row: 8 })).toBe(false); // counter
    expect(isWalkable({ col: -1, row: 10 })).toBe(false);
  });

  it('lets members cross rugs, carpet, chairs and the door', () => {
    expect(isWalkable({ col: 16, row: 10 })).toBe(true); // rug-red
    expect(isWalkable({ col: 12, row: 3 })).toBe(true); // floor-carpet
    expect(isWalkable(MEMBERS.minori.seat)).toBe(true); // chair
    expect(isWalkable(PLACES.door)).toBe(true);
  });

  it('keeps everyone out from under the windows', () => {
    expect(isWalkable({ col: 2, row: 3 })).toBe(false); // board
    expect(isWalkable({ col: 26, row: 3 })).toBe(false); // party
    expect(isWalkable({ col: 20, row: 15 })).toBe(false); // message
  });

  it('keeps heads out from under the windows too (sprites are two tiles tall)', () => {
    // Feet on row 11 below the party window (bottom 340 px): the head (from 320 px) is under it.
    expect(isWalkable({ col: 24, row: 11 })).toBe(false);
    expect(isWalkable({ col: 24, row: 12 })).toBe(true);
    // Feet just above the message window: the head is above the feet, so this is fine.
    expect(isWalkable({ col: 6, row: 13 })).toBe(true);
  });

  it('keeps the sides of the sprite out too (64 px wide, half a tile beyond its own)', () => {
    // Column 10 is right of the board (ends at 309 px), but the sprite reaches back to 304 px.
    expect(isWalkable({ col: 10, row: 3 })).toBe(false);
    expect(isWalkable({ col: 11, row: 3 })).toBe(true);
    // Column 2 is left of the message window (from 100 px), but the sprite reaches to 112 px.
    expect(isUnderWindow({ col: 2, row: 15 })).toBe(true);
    expect(isUnderWindow({ col: 1, row: 15 })).toBe(false);
  });
});

describe('map: windows over the canvas (App.vue)', () => {
  it('converts App.vue’s % and cqw to logical px', () => {
    const { board, party, message } = WINDOW_EXTENTS;
    // 1.6% of 576 down, then max-height 31cqw = 31 x 10.24.
    expect(board.top).toBeCloseTo(9.216);
    expect(board.bottom).toBeCloseTo(9.216 + 317.44);
    expect(board.right).toBeCloseTo(30.2 * 10.24);
    expect(party.left).toBeCloseTo(74.3 * 10.24);
    expect(party.right).toBeCloseTo(98.9 * 10.24);
    expect(message.top).toBeCloseTo(80.7 * 5.76);
    expect(message.bottom).toBeCloseTo(98.1 * 5.76);
  });

  it('places the sprite frame with the feet at the bottom centre of the tile', () => {
    expect(spriteRect({ col: 4, row: 12 })).toEqual({
      left: 112,
      top: 352,
      right: 176,
      bottom: 416,
    });
  });

  it('counts overlap only when areas share some area', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(overlaps(a, { left: 9, top: 9, right: 20, bottom: 20 })).toBe(true);
    expect(overlaps(a, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false);
    expect(overlaps(a, { left: 0, top: 10, right: 10, bottom: 20 })).toBe(false);
  });

  it('keeps feet on row 11 under the tall board off the walking grid (head under it)', () => {
    expect(isWalkable({ col: 2, row: 11 })).toBe(false);
    expect(isWalkable({ col: 2, row: 12 })).toBe(true);
  });

  it.each(WALKERS)('keeps the whole sprite of %s clear of the windows, even mid-stretch', (id) => {
    const frame = spriteRect(MEMBERS[id].seat);
    const stretched = { ...frame, top: frame.top - AMBIENT.stretchPx };
    for (const area of Object.values(WINDOW_EXTENTS)) expect(overlaps(stretched, area)).toBe(false);
  });

  // The party window is left out: its rare tallest state may cover ささえ's bubble (reported).
  it.each(WALKERS)('keeps the waiting bubble of %s clear of the board and message', (id) => {
    const frame = spriteRect(MEMBERS[id].seat);
    const withBubble = { ...frame, top: frame.bottom - OVERHEAD_TOP - AMBIENT.stretchPx };
    for (const area of [WINDOW_EXTENTS.board, WINDOW_EXTENTS.message]) {
      expect(overlaps(withBubble, area)).toBe(false);
    }
  });

  it('puts the bubble top over the sprite top', () => {
    expect(OVERHEAD_TOP).toBeGreaterThan(SPRITE_SIZE);
  });
});
