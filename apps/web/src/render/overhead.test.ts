import { describe, expect, it } from 'vitest';
import type { IdleMark } from './idle';
import { BUBBLE_RISE, DETAIL_SCALE, HOLD, LINES, OVERHEAD_OFFSET } from './metrics';
import { carry, raise } from './motion';
import { raisedItemPoint } from './toss';
import { overheadLift, overheadOf, type Overhead, type OverheadSources } from './overhead';

const MARK: IdleMark = { kind: 'bubble', glyph: '♪' };

const ALL: OverheadSources = {
  speeches: { minori: 'はっ！' },
  lines: { minori: 'おまかせを' },
  bubbles: { minori: 'awaiting-president' },
};

function drop(...keys: ('speeches' | 'lines' | 'bubbles')[]): OverheadSources {
  return { ...ALL, ...Object.fromEntries(keys.map((key) => [key, {}])) };
}

const seated = { id: 'minori', inScene: false, mark: MARK } as const;

describe('overheadOf: one thing over a head, the first that is there', () => {
  it.each<[string, OverheadSources, Overhead | null]>([
    ['the words of the king’s call first', ALL, { kind: 'speech', words: 'はっ！' }],
    ['then a line of a scene', drop('speeches'), { kind: 'line', words: 'おまかせを' }],
    [
      'then the waiting bubble',
      drop('speeches', 'lines'),
      { kind: 'bubble', bubble: 'awaiting-president' },
    ],
    [
      'then the sign of an idle spell',
      drop('speeches', 'lines', 'bubbles'),
      { kind: 'mark', mark: MARK },
    ],
  ])('%s', (_name, sources, expected) => {
    expect(overheadOf(seated, sources)).toEqual(expected);
  });

  it('shows nothing when there is nothing', () => {
    expect(overheadOf({ ...seated, mark: null }, drop('speeches', 'lines', 'bubbles'))).toBeNull();
  });

  it('shows a line of a scene while the member is in it (the waiting bubble hides there)', () => {
    const inScene = { id: 'minori', inScene: true, mark: null } as const;
    expect(overheadOf(inScene, drop('speeches'))).toEqual({ kind: 'line', words: 'おまかせを' });
    expect(overheadOf(inScene, drop('speeches', 'lines'))).toBeNull();
  });

  it('looks only at the member’s own entries', () => {
    const others: OverheadSources = {
      speeches: { yukihiro: '！' },
      lines: { kaname: 'それっ！' },
      bubbles: { hibiki: 'awaiting-permission' },
    };
    expect(overheadOf({ ...seated, mark: null }, others)).toBeNull();
  });
});

describe('overheadLift', () => {
  it('lifts what is over the head only while an item is held up over it', () => {
    expect(overheadLift({ held: raise('scroll') })).toBe(LINES.raisedLiftPx);
    expect(overheadLift({ held: raise('chest') })).toBe(LINES.raisedLiftPx);
    expect(overheadLift({ held: carry('chest') })).toBe(0);
    expect(overheadLift({ held: null })).toBe(0);
  });
});

describe('overheadLift: clear of the raised item', () => {
  /** The bottom of a bubble's tail (draw.ts: box 9 detail px from the top, tail 2 more) over the feet. */
  const TAIL_PX = OVERHEAD_OFFSET + BUBBLE_RISE * DETAIL_SCALE - 11 * DETAIL_SCALE;

  it.each(['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'] as const)(
    '%s: the lifted bubble ends above the top of a raised scroll or chest',
    (id) => {
      const feet = { x: 0, y: 500 };
      for (const prop of ['scroll', 'chest'] as const) {
        for (const holdFrames of [true, false]) {
          const item = raisedItemPoint(id, feet, prop, holdFrames);
          const itemTop = item.y - HOLD.raisedItemHalfPx;
          const tail = feet.y - TAIL_PX - overheadLift({ held: raise(prop) });
          expect(tail).toBeLessThanOrEqual(itemTop);
        }
      }
    },
  );
});
