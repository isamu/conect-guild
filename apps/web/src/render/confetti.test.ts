import { describe, expect, it } from 'vitest';
import {
  burstOrigin,
  confettiAt,
  CONFETTI_COUNT,
  CONFETTI_MS,
  createConfetti,
  type Random,
} from './confetti';
import { LOGICAL_WIDTH, WINDOW_EXTENTS } from './map';
import { CONFETTI, DETAIL_SCALE, OVERHEAD_OFFSET } from './metrics';
import { standingPose } from './motion';
import { DEFAULT_SEATS } from './scenes';
import { seatedPoint } from './seating';

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
      expect(Math.abs(p.vx)).toBeLessThanOrEqual(CONFETTI.spreadPx / 2);
      expect(-p.vy).toBeGreaterThanOrEqual(CONFETTI.riseMinPx);
      expect(-p.vy).toBeLessThanOrEqual(CONFETTI.riseMaxPx);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
      expect([CONFETTI.smallPx, CONFETTI.largePx]).toContain(p.size);
    }
  });

  it('makes the squares at least 2 detail px, about 40 % of them 3', () => {
    const sizes = createConfetti(seeded(3), 1_000).map((p) => p.size);
    expect(Math.min(...sizes)).toBe(2 * DETAIL_SCALE);
    const large = sizes.filter((size) => size === 3 * DETAIL_SCALE).length;
    expect(large).toBeGreaterThan(300);
    expect(large).toBeLessThan(500);
  });

  it('throws more and lasts longer than the first version (24 squares, 1.8 s)', () => {
    expect(CONFETTI_COUNT).toBeGreaterThan(24);
    expect(CONFETTI_MS).toBeGreaterThan(1_800);
  });
});

describe('confettiAt', () => {
  const particles = [{ vx: 10, vy: -100, color: '#ffffff', size: 1 } as const];

  it('starts at the origin', () => {
    expect(confettiAt(particles, 0)).toEqual([{ x: 0, y: 0, color: '#ffffff', size: 1 }]);
  });

  it('rises first, then falls back under gravity', () => {
    const [up] = confettiAt(particles, 200);
    const [down] = confettiAt(particles, 2_500);
    expect(up?.y).toBeLessThan(0);
    expect(down?.y).toBeGreaterThan(up?.y ?? 0);
    expect(down?.x).toBeCloseTo(25);
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

describe('confetti over every seat', () => {
  const seats = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'] as const;
  const times = Array.from({ length: CONFETTI_MS / 50 }, (_, i) => i * 50).concat(CONFETTI_MS - 1);
  /** Every square thrown with the slowest, middle and fastest numbers, at every time. */
  const flights = [0, 0.5, 0.999].flatMap((value) =>
    times.flatMap((t) =>
      confettiAt(
        createConfetti(() => value, 1),
        t,
      ),
    ),
  );

  it('stays on screen and above the message window until it ends, rising or falling', () => {
    const top = WINDOW_EXTENTS.message.top;
    for (const id of seats) {
      const origin = burstOrigin(seatedPoint(standingPose(DEFAULT_SEATS[id]).point));
      for (const p of flights) {
        const x = origin.x + p.x;
        const y = origin.y + p.y;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x + p.size).toBeLessThanOrEqual(LOGICAL_WIDTH);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y + p.size).toBeLessThanOrEqual(top);
      }
    }
  });
});
