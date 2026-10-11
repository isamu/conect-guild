import type { GuildEvent } from '../domain/events';
import type { GuildArt } from './art';
import type { Bubbles } from './bubbles';
import type { Random } from './confetti';
import {
  EMPTY_DIRECTOR,
  frameAt,
  isAnimating,
  prune,
  scheduleEvent,
  type Director,
} from './director';
import { drawActors, drawStatic } from './draw';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import { DEFAULT_SEATS } from './scenes';

/**
 * The requestAnimationFrame loop. It only runs while something moves; otherwise it sleeps until
 * the bubbles change, a scene starts or the canvas is resized, so an idle stage costs no CPU.
 */

export interface RenderLoopOptions {
  readonly canvas: HTMLCanvasElement;
  readonly art: GuildArt;
  readonly now?: () => number;
  readonly random?: Random;
}

export interface RenderLoop {
  /** Starts the scene for an event now (or when its cast is free). */
  play(event: GuildEvent): void;
  setBubbles(bubbles: Bubbles): void;
  /** Matches the backing store to the displayed width (CSS px) and the device pixel ratio. */
  resize(cssWidth: number, pixelRatio: number): void;
  /** Cancels the pending frame; the loop does nothing after this. */
  stop(): void;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D canvas is not available');
  return ctx;
}

function staticLayer(art: GuildArt): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = LOGICAL_WIDTH;
  layer.height = LOGICAL_HEIGHT;
  drawStatic(context2d(layer), art);
  return layer;
}

export function startRenderLoop(options: RenderLoopOptions): RenderLoop {
  const { canvas, art } = options;
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const ctx = context2d(canvas);
  const background = staticLayer(art);
  let director: Director = EMPTY_DIRECTOR;
  let bubbles: Bubbles = {};
  let scale = 1;
  let pending: number | null = null;
  let stopped = false;

  function draw(): void {
    pending = null;
    const t = now();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(background, 0, 0);
    drawActors(ctx, frameAt(director, t, DEFAULT_SEATS), bubbles, art);
    director = prune(director, t);
    if (isAnimating(director, t)) invalidate();
  }

  function invalidate(): void {
    if (stopped || pending !== null) return;
    pending = requestAnimationFrame(draw);
  }

  invalidate();
  return {
    play(event) {
      director = scheduleEvent(director, event, now(), { seats: DEFAULT_SEATS, random });
      invalidate();
    },
    setBubbles(next) {
      bubbles = next;
      invalidate();
    },
    resize(cssWidth, pixelRatio) {
      const width = Math.max(Math.round(cssWidth * pixelRatio), 1);
      if (canvas.width === width) return;
      canvas.width = width;
      canvas.height = Math.round((width * LOGICAL_HEIGHT) / LOGICAL_WIDTH);
      scale = width / LOGICAL_WIDTH;
      invalidate();
    },
    stop() {
      stopped = true;
      if (pending !== null) cancelAnimationFrame(pending);
      pending = null;
    },
  };
}
