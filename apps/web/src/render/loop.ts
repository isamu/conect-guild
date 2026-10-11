import { documentVisibility, type PageVisibility } from '../adapters/visibility';
import type { GuildEvent } from '../domain/events';
import { createAmbientSeeds, type AmbientMoods } from './ambient';
import type { GuildArt } from './art';
import type { Bubbles } from './bubbles';
import { RUNNING_CLOCK, stageTime, withPaused, type StageClock } from './clock';
import type { Random } from './confetti';
import {
  EMPTY_DIRECTOR,
  frameAt,
  isAnimating,
  prune,
  scheduleEvent,
  type Director,
  type StageFrame,
} from './director';
import { ANIMATED_DECOR } from './decor';
import {
  drawActors,
  drawAnimatedDecor,
  drawFrontLayer,
  drawStatic,
  type CachedFrontLayer,
} from './draw';
import { FRONT_LAYERS } from './layers';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import { AMBIENT } from './metrics';
import { DEFAULT_SEATS } from './scenes';

/**
 * The requestAnimationFrame loop. It runs every frame while a scene plays; between scenes it
 * redraws only every AMBIENT.frameMs for the small moves (members, lamps, the cat), and sleeps
 * when there are none until the bubbles change, a scene starts or the canvas is resized. While the
 * page is hidden or
 * the canvas has no width (narrow screens hide it) it does not run at all, and the stage clock
 * (clock.ts) stands still, so a scene goes on from where it was once the canvas is shown again.
 */

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

function cachedLayer(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = LOGICAL_WIDTH;
  layer.height = LOGICAL_HEIGHT;
  draw(context2d(layer));
  return layer;
}

/** Everything that never moves, drawn once: the background and each front layer. */
function cachedScenery(art: GuildArt): {
  background: HTMLCanvasElement;
  front: CachedFrontLayer[];
} {
  const background = cachedLayer((ctx) => {
    drawStatic(ctx, art);
  });
  const front = FRONT_LAYERS.map((layer) => ({
    depth: layer.depth,
    layer,
    image: cachedLayer((ctx) => {
      drawFrontLayer(ctx, art, layer);
    }),
  }));
  return { background, front };
}

/** True while drawing would not be seen: the page is hidden or the canvas has no width. */
export function isPaused(pageHidden: boolean, cssWidth: number): boolean {
  return pageHidden || cssWidth <= 0;
}

export interface Scheduler {
  /** Draws on the next animation frame (sooner than any ambient wait). */
  now(): void;
  /** Draws after AMBIENT.frameMs unless a draw is already on the way. */
  later(): void;
  /** Cancels what is pending when paused, otherwise draws soon (after a pause ends). */
  refresh(): void;
  stop(): void;
}

/** One pending draw at most; nothing runs while `paused()` is true or after stop(). */
export function createScheduler(draw: () => void, paused: () => boolean): Scheduler {
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
    if (stopped || paused() || pending !== null) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = requestAnimationFrame(() => {
      pending = null;
      draw();
    });
  }

  function later(): void {
    if (stopped || paused() || pending !== null || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      now();
    }, AMBIENT.frameMs);
  }

  return {
    now,
    later,
    refresh() {
      if (paused()) cancel();
      else now();
    },
    stop() {
      stopped = true;
      cancel();
    },
  };
}

/**
 * Matches the backing store to the displayed width; returns the new scale, or null when nothing
 * changed or the canvas is not shown (width 0).
 */
function fitCanvas(canvas: HTMLCanvasElement, cssWidth: number, pixelRatio: number): number | null {
  if (cssWidth <= 0) return null;
  const width = Math.max(Math.round(cssWidth * pixelRatio), 1);
  if (canvas.width === width) return null;
  canvas.width = width;
  canvas.height = Math.round((width * LOGICAL_HEIGHT) / LOGICAL_WIDTH);
  return width / LOGICAL_WIDTH;
}

/**
 * One frame: the cached background, the lamps and the cat, then the members between the cached
 * front layers (desks, the counter, the throne's arms).
 */
function paint(
  ctx: CanvasRenderingContext2D,
  layer: {
    background: HTMLCanvasElement;
    front: readonly CachedFrontLayer[];
    art: GuildArt;
    scale: number;
  },
  t: number,
  actors: { frame: StageFrame; bubbles: Bubbles },
): void {
  ctx.setTransform(layer.scale, 0, 0, layer.scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer.background, 0, 0);
  drawAnimatedDecor(ctx, layer.art, t);
  drawActors(ctx, { ...actors, now: t }, layer.art, layer.front);
}

export function startRenderLoop(options: RenderLoopOptions): RenderLoop {
  const { canvas, art } = options;
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const ctx = context2d(canvas);
  const { background, front } = cachedScenery(art);
  const seeds = createAmbientSeeds(random);
  const visibility = options.visibility ?? documentVisibility;
  // Narrow screens hide the canvas (display: none): its width is 0 and nothing is drawn.
  let cssWidth = 1;
  let director: Director = EMPTY_DIRECTOR;
  let bubbles: Bubbles = {};
  let moods: AmbientMoods = {};
  let scale = 1;
  let clock: StageClock = RUNNING_CLOCK;
  const stageNow = () => stageTime(clock, now());

  function draw(): void {
    const t = stageNow();
    const frame = frameAt(director, t, DEFAULT_SEATS, { moods, seeds });
    paint(ctx, { background, front, art, scale }, t, { frame, bubbles });
    director = prune(director, t);
    const next = nextDraw({
      hidden: paused(),
      animating: isAnimating(director, t),
      ambient: Object.keys(moods).length > 0 || ANIMATED_DECOR.length > 0,
    });
    if (next === 'frame') schedule.now();
    if (next === 'ambient') schedule.later();
  }

  const paused = () => isPaused(visibility.isHidden(), cssWidth);
  const schedule = createScheduler(draw, paused);
  /** Stops or restarts the stage clock with the paused state, then draws (or not) to match. */
  function refresh(): void {
    clock = withPaused(clock, paused(), now());
    schedule.refresh();
  }
  const unsubscribe = visibility.subscribe(refresh);
  refresh();
  return {
    play(event) {
      director = scheduleEvent(director, event, stageNow(), { seats: DEFAULT_SEATS, random });
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
    resize(nextCssWidth, pixelRatio) {
      cssWidth = nextCssWidth;
      scale = fitCanvas(canvas, cssWidth, pixelRatio) ?? scale;
      refresh();
    },
    stop() {
      schedule.stop();
      unsubscribe();
    },
  };
}
