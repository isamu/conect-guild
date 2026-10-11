import { describe, expect, it } from 'vitest';
import { SPRITE_SIZE } from './metrics';
import { spriteDraw } from './spriteArt';

describe('spriteDraw', () => {
  it('takes frame n from the n-th 64 px column of the sheet', () => {
    expect(([0, 1, 2, 3] as const).map((f) => spriteDraw(f, { x: 0, y: 0 }).sx)).toEqual([
      0, 64, 128, 192,
    ]);
  });

  it('puts the bottom centre of the frame on the feet', () => {
    const draw = spriteDraw(0, { x: 528, y: 256 });
    expect(draw.dx + SPRITE_SIZE / 2).toBe(528);
    expect(draw.dy + SPRITE_SIZE).toBe(256);
  });

  it('snaps to whole pixels while walking between tiles', () => {
    const draw = spriteDraw(2, { x: 100.4, y: 200.6 });
    expect([draw.dx, draw.dy]).toEqual([100 - 32, 201 - 64]);
  });
});
