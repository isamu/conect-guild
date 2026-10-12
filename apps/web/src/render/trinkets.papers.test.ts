import { describe, expect, it } from 'vitest';
import { TILE_SIZE, TRINKETS } from './metrics';
import { FILE_TOP, floatingSheet, hashStep, papersAt } from './trinkets';

/** ささえ's papers (trinkets.ts): the top sheet and the one floating up off the stack. */

const PICTURE = TILE_SIZE;

describe('papersAt', () => {
  const quarter = TRINKETS.shuffleMs / 4;
  const turns = Array.from({ length: 200 }, (_, turn) => turn);
  const floating = turns.filter((turn) => hashStep(turn) < TRINKETS.floatShare);
  const resting = turns.filter((turn) => hashStep(turn) >= TRINKETS.floatShare);

  it('lays the top sheet flat, slides it, lifts its corner, then lays it back each turn', () => {
    const look = (t: number) => {
      const { slide, curl } = papersAt(0, t);
      return { slide, curl };
    };
    expect(look(0)).toEqual({ slide: 0, curl: false });
    expect(look(quarter - 1)).toEqual({ slide: 0, curl: false });
    expect(look(quarter)).toEqual({ slide: TRINKETS.shuffleSlidePx, curl: false });
    expect(look(2 * quarter - 1)).toEqual({ slide: TRINKETS.shuffleSlidePx, curl: false });
    expect(look(2 * quarter)).toEqual({ slide: TRINKETS.shuffleSlidePx, curl: true });
    expect(look(3 * quarter - 1)).toEqual({ slide: TRINKETS.shuffleSlidePx, curl: true });
    expect(look(3 * quarter)).toEqual({ slide: 0, curl: false });
    expect(look(TRINKETS.shuffleMs)).toEqual({ slide: 0, curl: false });
    expect(papersAt(quarter, 0)).toEqual(papersAt(0, quarter));
  });

  it('floats a sheet up off the stack on some turns only, for floatMs from the turn’s start', () => {
    expect(floating.length / turns.length).toBeGreaterThan(TRINKETS.floatShare - 0.15);
    expect(floating.length / turns.length).toBeLessThan(TRINKETS.floatShare + 0.15);
    for (const turn of floating) {
      const start = turn * TRINKETS.shuffleMs;
      expect(papersAt(0, start).float).toEqual({ x: 0, y: 0 });
      expect(papersAt(0, start + TRINKETS.floatMs / 2).float).toEqual({
        x: TRINKETS.floatDriftPx,
        y: -TRINKETS.floatRisePx,
      });
      expect(papersAt(0, start + TRINKETS.floatMs - 1).float).toEqual({ x: 0, y: 0 });
      expect(papersAt(0, start + TRINKETS.floatMs).float).toBeNull();
    }
    for (const turn of resting) {
      const start = turn * TRINKETS.shuffleMs;
      for (let t = start; t < start + TRINKETS.shuffleMs; t += 70) {
        expect(papersAt(0, t).float).toBeNull();
      }
    }
  });

  it('rises the floating sheet, then settles it back on the stack, within its reach', () => {
    // The test above finds floating turns among the first 200.
    const start = (floating[0] ?? 0) * TRINKETS.shuffleMs;
    let previous = 0;
    for (let t = 0; t < TRINKETS.floatMs; t += 20) {
      const float = papersAt(0, start + t).float;
      expect(float).not.toBeNull();
      const y = float?.y ?? 0;
      if (t <= TRINKETS.floatMs / 2) expect(y).toBeLessThanOrEqual(previous);
      else expect(y).toBeGreaterThanOrEqual(previous);
      expect(y).toBeGreaterThanOrEqual(-TRINKETS.floatRisePx);
      expect(y).toBeLessThanOrEqual(0);
      expect(float?.x).toBeGreaterThanOrEqual(0);
      expect(float?.x).toBeLessThanOrEqual(TRINKETS.floatDriftPx);
      previous = y;
    }
    expect(previous).toBeGreaterThan(-2);
  });
});

describe('FILE_TOP', () => {
  it('keeps the top sheet on the stack’s picture as it slides', () => {
    expect(FILE_TOP.x).toBeGreaterThanOrEqual(0);
    expect(FILE_TOP.y).toBeGreaterThanOrEqual(0);
    expect(FILE_TOP.x + FILE_TOP.w + TRINKETS.shuffleSlidePx).toBeLessThanOrEqual(PICTURE);
    expect(FILE_TOP.y + FILE_TOP.h).toBeLessThanOrEqual(PICTURE);
  });
});

describe('floatingSheet', () => {
  it('lays the floating sheet on the top sheet when it has not risen, so it lands on the stack', () => {
    const sheet = floatingSheet({ x: 0, y: 0 });
    expect(sheet.x).toBeGreaterThanOrEqual(FILE_TOP.x);
    expect(sheet.x + sheet.w).toBeLessThanOrEqual(FILE_TOP.x + FILE_TOP.w);
    expect(sheet.y).toBeGreaterThanOrEqual(FILE_TOP.y);
    expect(sheet.y + sheet.h).toBeLessThanOrEqual(FILE_TOP.y + FILE_TOP.h);
  });

  it('moves the sheet by the float, up and aside', () => {
    const rest = floatingSheet({ x: 0, y: 0 });
    const top = floatingSheet({ x: TRINKETS.floatDriftPx, y: -TRINKETS.floatRisePx });
    expect(top).toEqual({
      ...rest,
      x: rest.x + TRINKETS.floatDriftPx,
      y: rest.y - TRINKETS.floatRisePx,
    });
  });
});
