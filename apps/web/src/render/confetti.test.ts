import { describe, expect, it } from 'vitest';
import {
  burstOrigin,
  confettiAt,
  CONFETTI_COUNT,
  CONFETTI_MS,
  createConfetti,
  type Random,
} from './confetti';
import { DETAIL_SCALE, OVERHEAD_OFFSET } from './metrics';

/** Deterministic random numbers in [0, 1). */
function seeded(seed: number): Random {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe('createConfetti', () => {
  it('makes the default number of particles', () => {
    expect(createConfetti(seeded(1))).toHaveLength(CONFETTI_COUNT);
    expect(createConfetti(seeded(1), 3)).toHaveLength(3);
    expect(createConfetti(seeded(1), 0)).toEqual([]);
  });

  it('is the same for the same random numbers', () => {
    expect(createConfetti(seeded(7))).toEqual(createConfetti(seeded(7)));
    expect(createConfetti(seeded(7))).not.toEqual(createConfetti(seeded(8)));
  });

  it('always throws upwards, within a fan', () => {
    for (const value of [0, 0.5, 0.999]) {
      const [p] = createConfetti(() => value, 1);
      expect(p).toBeDefined();
      if (p === undefined) continue;
      expect(p.vy).toBeLessThan(0);
      expect(Math.abs(p.vx)).toBeLessThanOrEqual(60 * DETAIL_SCALE);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
      expect([DETAIL_SCALE, 2 * DETAIL_SCALE]).toContain(p.size);
    }
  });
});

describe('confettiAt', () => {
  const particles = [{ vx: 10, vy: -100, color: '#ffffff', size: 1 } as const];

  it('starts at the origin', () => {
    expect(confettiAt(particles, 0)).toEqual([{ x: 0, y: 0, color: '#ffffff', size: 1 }]);
  });

  it('rises first, then falls back under gravity', () => {
    const [up] = confettiAt(particles, 200);
    const [down] = confettiAt(particles, 1_500);
    expect(up?.y).toBeLessThan(0);
    expect(down?.y).toBeGreaterThan(up?.y ?? 0);
    expect(down?.x).toBeCloseTo(15);
  });

  it('shows nothing before the burst or once it is over', () => {
    expect(confettiAt(particles, -1)).toEqual([]);
    expect(confettiAt(particles, CONFETTI_MS)).toEqual([]);
    expect(confettiAt(particles, CONFETTI_MS - 1)).toHaveLength(1);
    expect(confettiAt(particles, 100, 50)).toEqual([]);
  });
});

describe('burstOrigin', () => {
  it('centres over the head', () => {
    expect(burstOrigin({ x: 100, y: 200 })).toEqual({ x: 100, y: 200 - OVERHEAD_OFFSET });
  });
});
