import { describe, expect, it } from 'vitest';
import { MEMBERS, type MemberId } from '../guild.config';
import {
  contains,
  GROUND,
  groundAt,
  coveredTiles,
  HIDDEN_AREAS,
  isHidden,
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
import { AMBIENT, SPRITE_SIZE } from './metrics';
import { findPath, tileToPoint } from './path';

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
    expect(groundAt(PLACES.door)).toBe('door');
    expect(PLACES.door.row).toBe(MAP_ROWS - 1);
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
    // The sprite is two tiles tall: the head must be visible too.
    expect(isHidden({ col: seat.col, row: seat.row - 1 })).toBe(false);
  });

  it('keeps the king visible', () => {
    const seat = MEMBERS.yukihiro.seat;
    expect(isHidden(seat)).toBe(false);
    expect(isHidden({ col: seat.col, row: seat.row - 1 })).toBe(false);
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
    for (const area of Object.values(HIDDEN_AREAS)) {
      expect(isWalkable({ col: area.col + 1, row: area.row + 1 })).toBe(false);
    }
    expect(isWalkable({ col: 20, row: 15 })).toBe(false);
  });

  it('keeps heads out from under the windows too (sprites are two tiles tall)', () => {
    const { party, message } = HIDDEN_AREAS;
    // Feet just below the party window: the head would be under it.
    expect(isWalkable({ col: party.col + 1, row: party.row + party.h })).toBe(false);
    expect(isWalkable({ col: party.col + 1, row: party.row + party.h + 1 })).toBe(true);
    // Feet just above the message window: the head is above the feet, so this is fine.
    expect(isWalkable({ col: message.col + 3, row: message.row - 1 })).toBe(true);
  });

  it('decides hidden cells by the edges of each area', () => {
    const { message } = HIDDEN_AREAS;
    expect(isHidden({ col: message.col, row: message.row })).toBe(true);
    expect(isHidden({ col: message.col - 1, row: message.row })).toBe(false);
    expect(isHidden({ col: message.col + message.w, row: message.row })).toBe(false);
    expect(isHidden({ col: message.col, row: message.row - 1 })).toBe(false);
  });
});

describe('map: windows over the canvas (App.vue)', () => {
  it('converts App.vue’s % and cqw to logical px', () => {
    const { board, party, message } = WINDOW_EXTENTS;
    // 1.6% of 576 down, then max-height 33cqw = 33 x 10.24.
    expect(board.top).toBeCloseTo(9.216);
    expect(board.bottom).toBeCloseTo(9.216 + 337.92);
    expect(board.right).toBeCloseTo(30.2 * 10.24);
    expect(party.left).toBeCloseTo(74.3 * 10.24);
    expect(party.right).toBeCloseTo(98.9 * 10.24);
    expect(message.top).toBeCloseTo(80.7 * 5.76);
    expect(message.bottom).toBeCloseTo(98.1 * 5.76);
  });

  it('hides every tile a window touches', () => {
    expect(HIDDEN_AREAS).toEqual({
      // The board reaches 347 px: row 10 (320-352) is under it.
      board: { col: 0, row: 0, w: 10, h: 11 },
      party: { col: 23, row: 0, w: 9, h: 11 },
      message: { col: 3, row: 14, w: 26, h: 4 },
    });
  });

  it('rounds outwards, and an edge on a tile line takes no extra tile', () => {
    expect(coveredTiles({ left: 31.9, top: 0.1, right: 32.1, bottom: 64 })).toEqual({
      col: 0,
      row: 0,
      w: 2,
      h: 2,
    });
  });

  it('keeps feet on row 11 under the tall board off the walking grid (head under it)', () => {
    expect(isWalkable({ col: 2, row: 11 })).toBe(false);
    expect(isWalkable({ col: 2, row: 12 })).toBe(true);
  });

  it.each(WALKERS)('keeps the whole sprite of %s clear of the windows, even mid-stretch', (id) => {
    const feet = tileToPoint(MEMBERS[id].seat);
    const sprite = {
      left: feet.x - SPRITE_SIZE / 2,
      right: feet.x + SPRITE_SIZE / 2,
      top: feet.y - SPRITE_SIZE - AMBIENT.stretchPx,
      bottom: feet.y,
    };
    for (const area of Object.values(WINDOW_EXTENTS)) {
      const overlaps =
        sprite.left < area.right &&
        area.left < sprite.right &&
        sprite.top < area.bottom &&
        area.top < sprite.bottom;
      expect(overlaps).toBe(false);
    }
  });
});
