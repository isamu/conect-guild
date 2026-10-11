import { describe, expect, it } from 'vitest';
import { nextDraw } from './loop';

describe('nextDraw', () => {
  it('draws every frame while a scene plays', () => {
    expect(nextDraw({ hidden: false, animating: true, ambient: true })).toBe('frame');
    expect(nextDraw({ hidden: false, animating: true, ambient: false })).toBe('frame');
  });

  it('waits for the next ambient move between scenes', () => {
    expect(nextDraw({ hidden: false, animating: false, ambient: true })).toBe('ambient');
  });

  it('sleeps when nothing moves', () => {
    expect(nextDraw({ hidden: false, animating: false, ambient: false })).toBe('sleep');
  });

  it('sleeps while the page is hidden, even during a scene', () => {
    expect(nextDraw({ hidden: true, animating: true, ambient: true })).toBe('sleep');
    expect(nextDraw({ hidden: true, animating: false, ambient: true })).toBe('sleep');
  });
});
