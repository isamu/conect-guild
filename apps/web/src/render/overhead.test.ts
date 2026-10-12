import { describe, expect, it } from 'vitest';
import type { IdleMark } from './idle';
import type { LevelTag } from './levelTags';
import { BUBBLE_RISE, DETAIL_SCALE, HOLD, LINES, OVERHEAD_OFFSET } from './metrics';
import { carry, raise } from './motion';
import { raisedItemPoint } from './toss';
import {
  overheadLift,
  overheadOf,
  tagBox,
  wordsBox,
  wordsOf,
  type Overhead,
  type OverheadSources,
} from './overhead';

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

const FEET = { x: 0, y: 500 };

describe('overheadLift', () => {
  it('lifts what is over the head only while an item is held up over it', () => {
    for (const words of [null, 'はい、どうぞ']) {
      expect(overheadLift({ point: FEET, held: raise('scroll') }, words, [])).toBe(
        LINES.raisedLiftPx,
      );
      expect(overheadLift({ point: FEET, held: raise('chest') }, words, [])).toBe(
        LINES.raisedLiftPx,
      );
      expect(overheadLift({ point: FEET, held: carry('chest') }, words, [])).toBe(0);
      expect(overheadLift({ point: FEET, held: null }, words, [])).toBe(0);
    }
  });
});

describe('overheadLift: clear of the level tags', () => {
  const seated = { point: FEET, held: null };
  const box = wordsBox(FEET, 6, 0);
  /** A tag centred on the bubble's right end, half way down the bubble. */
  const under: LevelTag = { text: 'Lv 9', x: box.right - 4, y: box.bottom - 4 };

  it('measures the words as drawBubble draws them', () => {
    expect(box).toEqual({ left: 6, right: 6 + 48 * DETAIL_SCALE, top: 404, bottom: 426 });
  });

  it('lifts words that would meet a tag until they are tagGapPx over it', () => {
    const lift = overheadLift(seated, 'はい、どうぞ', [under]);
    expect(lift).toBe(box.bottom - tagBox(under).top + LINES.tagGapPx);
    const lifted = wordsBox(FEET, 6, lift);
    expect(tagBox(under).top - lifted.bottom).toBe(LINES.tagGapPx);
  });

  it('lifts over the tag from where a raised item put the words', () => {
    const raised = { point: FEET, held: raise('chest') };
    const high = wordsBox(FEET, 6, LINES.raisedLiftPx);
    const tag: LevelTag = { text: 'Lv 9', x: high.right - 4, y: high.bottom - 4 };
    expect(overheadLift(raised, 'はい、どうぞ', [tag])).toBe(
      LINES.raisedLiftPx + high.bottom - tagBox(tag).top + LINES.tagGapPx,
    );
  });

  it('leaves words that end before the tag where they are (the width counts)', () => {
    expect(overheadLift(seated, 'はい', [under])).toBe(0);
  });

  it('leaves a tag just under the bubble alone (edges that touch do not meet)', () => {
    const below: LevelTag = { text: 'Lv 9', x: box.left + 20, y: box.bottom + 7 };
    expect(tagBox(below).top).toBe(box.bottom);
    expect(overheadLift(seated, 'はい、どうぞ', [below])).toBe(0);
  });

  it('never lifts a sign with no words for a tag', () => {
    expect(overheadLift(seated, null, [under])).toBe(0);
  });

  it('goes over the highest of two tags it meets', () => {
    const higher: LevelTag = { ...under, x: box.left + 20, y: box.top + 2 };
    expect(overheadLift(seated, 'はい、どうぞ', [under, higher])).toBe(
      box.bottom - tagBox(higher).top + LINES.tagGapPx,
    );
  });
});

describe('wordsOf', () => {
  it('gives the words of the summons and of a line, and nothing for a bubble or a sign', () => {
    expect(wordsOf({ kind: 'speech', words: 'はっ！' })).toBe('はっ！');
    expect(wordsOf({ kind: 'line', words: 'おまかせを' })).toBe('おまかせを');
    expect(wordsOf({ kind: 'bubble', bubble: 'awaiting-kaname' })).toBeNull();
    expect(wordsOf({ kind: 'mark', mark: MARK })).toBeNull();
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
          const tail =
            feet.y - TAIL_PX - overheadLift({ point: feet, held: raise(prop) }, null, []);
          expect(tail).toBeLessThanOrEqual(itemTop);
        }
      }
    },
  );
});
