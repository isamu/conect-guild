import { describe, expect, it } from 'vitest';
import { DECOR } from '../../../../assets/decor/decor';
import { decorDraw, PROP_DECOR, propPlacement } from './decorArt';

describe('decorDraw', () => {
  it('cuts a one-cell thing from its 32 px cell', () => {
    expect(decorDraw('abacus')).toEqual({ sx: 5 * 32, sy: 6 * 32, w: 32, h: 32 });
  });

  it('cuts a larger thing at its full size', () => {
    expect(decorDraw('map-table')).toEqual({ sx: 0, sy: 4 * 32, w: 96, h: 64 });
  });
});

describe('held items', () => {
  it('uses the scroll pile and the chest for the held items', () => {
    expect(PROP_DECOR).toEqual({ scroll: 'scroll-pile', chest: 'chest' });
    expect(DECOR['scroll-pile']).toBeDefined();
  });

  it('centres the picture on the given point', () => {
    expect(propPlacement('chest', { x: 100, y: 50 })).toEqual({ name: 'chest', x: 84, y: 34 });
    expect(propPlacement('scroll', { x: 0, y: 0 })).toEqual({
      name: 'scroll-pile',
      x: -16,
      y: -16,
    });
  });
});
