import { describe, expect, it } from 'vitest';
import { MEMBERS, type MemberId } from '../guild.config';
import { isWalkable, PLACES } from './map';
import { SEATING, TILE_SIZE } from './metrics';
import { tileToPoint } from './path';
import { SEAT_SINK, seatedPoint, sinkAt } from './seating';

const DEPARTMENT_MEMBERS: readonly MemberId[] = ['minori', 'hibiki', 'hirame', 'sasae'];
const at = (col: number, row: number) => sinkAt(tileToPoint({ col, row }));

describe('seating: who sinks how far', () => {
  it.each(DEPARTMENT_MEMBERS)('sinks %s into the chair behind the desk', (id) => {
    const { col, row } = MEMBERS[id].seat;
    expect(at(col, row)).toBe(SEATING.chairPx);
  });

  it('sinks かなめ behind the counter, and the king into the throne', () => {
    expect(at(MEMBERS.kaname.seat.col, MEMBERS.kaname.seat.row)).toBe(SEATING.counterPx);
    expect(at(MEMBERS.yukihiro.seat.col, MEMBERS.yukihiro.seat.row)).toBe(SEATING.thronePx);
  });

  it('keeps かなめ low all along behind the counter, and up beside it', () => {
    const row = MEMBERS.kaname.seat.row;
    for (const col of [13, 14, 15, 17, 18, 19]) expect(at(col, row)).toBe(SEATING.counterPx);
    expect(at(12, row)).toBe(0);
    expect(at(20, row)).toBe(0);
  });

  it('does not sink anyone standing anywhere else', () => {
    expect(at(PLACES.counterFront.col, PLACES.counterFront.row)).toBe(0);
    // Beside みのり (where かなめ hands her the scroll) and on the chair's upper cell.
    expect(at(13, 4)).toBe(0);
    expect(at(11, 4)).toBe(0);
    expect(at(12, 3)).toBe(0);
    expect(SEAT_SINK.size).toBe(4 + 7 + 1);
  });

  it('sinks only cells members can be on (walkable seats, and the king’s throne)', () => {
    for (const key of SEAT_SINK.keys()) {
      const [col, row] = key.split(',').map(Number);
      if (col === undefined || row === undefined) continue;
      const isKing = col === MEMBERS.yukihiro.seat.col && row === MEMBERS.yukihiro.seat.row;
      expect(isKing || isWalkable({ col, row })).toBe(true);
    }
  });
});

describe('seating: sitting down and standing up', () => {
  const seat = tileToPoint(MEMBERS.minori.seat);

  it('blends the sink while stepping off the seat, sideways or down', () => {
    expect(sinkAt({ x: seat.x + TILE_SIZE / 2, y: seat.y })).toBeCloseTo(SEATING.chairPx / 2);
    expect(sinkAt({ x: seat.x + TILE_SIZE / 4, y: seat.y })).toBeCloseTo((SEATING.chairPx * 3) / 4);
    expect(sinkAt({ x: seat.x, y: seat.y - TILE_SIZE / 2 })).toBeCloseTo(SEATING.chairPx / 2);
    expect(sinkAt({ x: seat.x + TILE_SIZE, y: seat.y })).toBe(0);
  });

  it('never sinks below the seat or rises above the floor', () => {
    for (let dx = -TILE_SIZE; dx <= TILE_SIZE; dx += 4) {
      for (let dy = -TILE_SIZE; dy <= TILE_SIZE; dy += 4) {
        const sink = sinkAt({ x: seat.x + dx, y: seat.y + dy });
        expect(sink).toBeGreaterThanOrEqual(0);
        expect(sink).toBeLessThanOrEqual(SEATING.chairPx);
      }
    }
  });

  it('moves the point straight down by the sink', () => {
    expect(seatedPoint(seat)).toEqual({ x: seat.x, y: seat.y + SEATING.chairPx });
    const floor = tileToPoint(PLACES.counterFront);
    expect(seatedPoint(floor)).toEqual(floor);
  });
});
