import { CONFETTI, OVERHEAD_OFFSET } from './metrics';
import type { Point } from './path';

/** Confetti over a member's head when a quest is cleared. Random numbers are injected. */

export const CONFETTI_MS = CONFETTI.durationMs;
export const CONFETTI_COUNT = CONFETTI.count;
const COLORS = ['#ffd84a', '#ff5f7e', '#4fd1ff', '#7ee07e', '#ffffff'] as const;

/** Returns a number in [0, 1), like Math.random. */
export type Random = () => number;

export interface Particle {
  /** Initial velocity, logical px / s. */
  readonly vx: number;
  readonly vy: number;
  readonly color: string;
  /** Side of the square, logical px. */
  readonly size: number;
}

export interface PlacedParticle {
  /** Offset from the burst origin, logical px. */
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly size: number;
}

function pick<T>(items: readonly [T, ...T[]], random: Random): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

/** Particles fly up and out in a fan, then fall. */
export function createConfetti(random: Random, count: number = CONFETTI_COUNT): Particle[] {
  return Array.from({ length: count }, () => ({
    vx: (random() - 0.5) * CONFETTI.spreadPx,
    vy: -(CONFETTI.riseMinPx + random() * (CONFETTI.riseMaxPx - CONFETTI.riseMinPx)),
    color: pick(COLORS, random),
    size: random() < CONFETTI.largeShare ? CONFETTI.largePx : CONFETTI.smallPx,
  }));
}

/** Particle offsets `elapsedMs` after the burst; empty before it starts and after it ends. */
export function confettiAt(
  particles: readonly Particle[],
  elapsedMs: number,
  durationMs: number = CONFETTI_MS,
): PlacedParticle[] {
  if (elapsedMs < 0 || elapsedMs >= durationMs) return [];
  const s = elapsedMs / 1000;
  return particles.map((p) => ({
    x: p.vx * s,
    y: p.vy * s + (CONFETTI.gravityPx * s * s) / 2,
    color: p.color,
    size: p.size,
  }));
}

/** Where a burst centres: a little above the head of a member standing at `feet`. */
export function burstOrigin(feet: Point): Point {
  return { x: feet.x, y: feet.y - OVERHEAD_OFFSET };
}
