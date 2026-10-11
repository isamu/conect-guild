import { describe, expect, it } from 'vitest';
import { DETAIL_SCALE, OVERHEAD_OFFSET, SPRITE_SIZE, TILE_SIZE } from './metrics';

describe('metrics', () => {
  it('uses 32 px tiles and 80 px sprite frames (two and a half tiles tall)', () => {
    expect(TILE_SIZE).toBe(32);
    expect(SPRITE_SIZE).toBe(80);
  });

  it('scales the 16 px-grid details by 2', () => {
    expect(DETAIL_SCALE).toBe(2);
  });

  it('centres held items and confetti just above a full sprite', () => {
    expect(OVERHEAD_OFFSET).toBeGreaterThan(SPRITE_SIZE);
    expect(OVERHEAD_OFFSET).toBeLessThan(SPRITE_SIZE + TILE_SIZE / 2);
  });
});
