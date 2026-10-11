import type { GuildEvent } from '../domain/events';
import { createAmbientSeeds, type AmbientMoods } from './ambient';
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
import { AMBIENT } from './metrics';
import { DEFAULT_SEATS } from './scenes';

/**
 * The requestAnimationFrame loop. It runs every frame while a scene plays; between scenes it
 * redraws only every AMBIENT.frameMs for the members' small moves (or sleeps when there are none)
 * until the bubbles change, a scene starts or the canvas is resized. While the page is hidden it
 * does not run at all.
 */

/** Whether the page is shown, and a way to hear when that changes. */
export interface PageVisibility {
  isHidden(): boolean;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

const documentVisibility: PageVisibility = {
  isHidden: () => document.visibilityState === 'hidden',
  subscribe(listener) {
    document.addEventListener('visibilitychange', listener);
    return () => {
      document.removeEventListener('visibilitychange', listener);
    };
  },
};

/** What to do after a frame: draw the next one, wait for the next ambient move, or sleep. */
export type NextDraw = 'frame' | 'ambient' | 'sleep';

export function nextDraw(state: {
  readonly hidden: boolean;
  readonly animating: boolean;
  readonly ambient: boolean;
}): NextDraw {
  if (state.hidden) return 'sleep';
  if (state.animating) return 'frame';
  return state.ambient ? 'ambient' : 'sleep';
}

export interface RenderLoopOptions {
  readonly canvas: HTMLCanvasElement;
  readonly art: GuildArt;
  readonly now?: () => number;
  readonly random?: Random;
  readonly visibility?: PageVisibility;
}

export interface RenderLoop {
  /** Starts the scene for an event now (or when its cast is free). */
  play(event: GuildEvent): void;
  setBubbles(bubbles: Bubbles): void;
  /** The members' ambient moves (from the party state). */
  setMoods(moods: AmbientMoods): void;
  /** Matches the backing store to the displayed width (CSS px) and the device pixel ratio. */
  resize(cssWidth: number, pixelRatio: number): void;
  /** Cancels the pending frame and stops listening; the loop does nothing after this. */
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

interface Scheduler {
  /** Draws on the next animation frame (sooner than any ambient wait). */
  now(): void;
  /** Draws after AMBIENT.frameMs unless a draw is already on the way. */
  later(): void;
  isHidden(): boolean;
  stop(): void;
}

/** One pending draw at most; nothing runs while the page is hidden or after stop(). */
function createScheduler(draw: () => void, visibility: PageVisibility): Scheduler {
  let pending: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function cancel(): void {
    if (pending !== null) cancelAnimationFrame(pending);
    if (timer !== null) clearTimeout(timer);
    pending = null;
    timer = null;
  }

  function now(): void {
    if (stopped || visibility.isHidden() || pending !== null) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = requestAnimationFrame(() => {
      pending = null;
      draw();
    });
  }

  function later(): void {
    if (stopped || pending !== null || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      now();
    }, AMBIENT.frameMs);
  }

  const unsubscribe = visibility.subscribe(() => {
    if (visibility.isHidden()) cancel();
    else now();
  });

  return {
    now,
    later,
    isHidden: () => visibility.isHidden(),
    stop() {
      stopped = true;
      cancel();
      unsubscribe();
    },
  };
}

export function startRenderLoop(options: RenderLoopOptions): RenderLoop {
  const { canvas, art } = options;
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const ctx = context2d(canvas);
  const background = staticLayer(art);
  const seeds = createAmbientSeeds(random);
  let director: Director = EMPTY_DIRECTOR;
  let bubbles: Bubbles = {};
  let moods: AmbientMoods = {};
  let scale = 1;

  function draw(): void {
    const t = now();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(background, 0, 0);
    drawActors(ctx, frameAt(director, t, DEFAULT_SEATS, { moods, seeds }), bubbles, art);
    director = prune(director, t);
    const next = nextDraw({
      hidden: schedule.isHidden(),
      animating: isAnimating(director, t),
      ambient: Object.keys(moods).length > 0,
    });
    if (next === 'frame') schedule.now();
    if (next === 'ambient') schedule.later();
  }

  const schedule = createScheduler(draw, options.visibility ?? documentVisibility);
  schedule.now();
  return {
    play(event) {
      director = scheduleEvent(director, event, now(), { seats: DEFAULT_SEATS, random });
      schedule.now();
    },
    setBubbles(next) {
      bubbles = next;
      schedule.now();
    },
    setMoods(next) {
      moods = next;
      schedule.now();
    },
    resize(cssWidth, pixelRatio) {
      const width = Math.max(Math.round(cssWidth * pixelRatio), 1);
      if (canvas.width === width) return;
      canvas.width = width;
      canvas.height = Math.round((width * LOGICAL_HEIGHT) / LOGICAL_WIDTH);
      scale = width / LOGICAL_WIDTH;
      schedule.now();
    },
    stop() {
      schedule.stop();
    },
  };
}
