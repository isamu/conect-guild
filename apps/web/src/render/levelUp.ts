import type { TilePos } from '../guild.config';
import { CONFETTI_MS } from './confetti';
import { OVERHEAD_TOP } from './metrics';
import { staySegment, type Segment } from './motion';
import type { Point } from './path';

/**
 * The level-up on the stage (docs/DESIGN.md 4.6, Issue #19): the member hops twice at their seat
 * (かなめ at the reception), with confetti and the words "LEVEL UP" over it. No new pictures: the
 * standing frame moves up and down, and the words are fillText of a fixed string. Pure.
 */

export const LEVEL_UP = {
  /** The words over the seat: fixed, never outside text. */
  text: 'LEVEL UP',
  hops: 2,
  /** One hop, up and down. */
  hopMs: 420,
  /** How high the feet go at the top of a hop, logical px. */
  hopPx: 12,
  /** The words show as long as the confetti flies. */
  bannerMs: CONFETTI_MS,
  /** The words rise this far while they show, logical px ... */
  bannerRisePx: 12,
  /** ... and fade out over the last part of their time. */
  bannerFadeMs: 600,
  /** Room left between the words and a speech bubble under them, logical px. */
  bannerGapPx: 2,
} as const;

/** The hops at the seat, one stay segment each (motion.poseOnSegment lifts the feet). */
export function hopSegments(seat: TilePos, start: number): Segment[] {
  return Array.from({ length: LEVEL_UP.hops }, (_, i) => ({
    ...staySegment(seat, start + i * LEVEL_UP.hopMs, LEVEL_UP.hopMs),
    hopPx: LEVEL_UP.hopPx,
  }));
}

/** How the words "LEVEL UP" look `elapsedMs` after the level-up began; null outside their time. */
export interface BannerView {
  /** How far over the confetti's origin, logical px. */
  readonly rise: number;
  /** 0 to 1. */
  readonly alpha: number;
}

export function bannerAt(elapsedMs: number): BannerView | null {
  const { bannerMs, bannerRisePx, bannerFadeMs } = LEVEL_UP;
  if (elapsedMs < 0 || elapsedMs >= bannerMs) return null;
  return {
    rise: (bannerRisePx * elapsedMs) / bannerMs,
    alpha: Math.min(1, (bannerMs - elapsedMs) / bannerFadeMs),
  };
}

/**
 * Where the words "LEVEL UP" stand (the bottom centre of the text): over the confetti's origin,
 * risen by `banner.rise`. While the member answers the king's call (summons.ts, a bubble over the
 * head drawn at `speakerFeet`), the words go up over the top of that bubble, so neither hides the
 * other.
 */
export function bannerPoint(origin: Point, banner: BannerView, speakerFeet: Point | null): Point {
  const over =
    speakerFeet === null
      ? origin.y
      : Math.min(origin.y, speakerFeet.y - OVERHEAD_TOP - LEVEL_UP.bannerGapPx);
  return { x: origin.x, y: over - banner.rise };
}
