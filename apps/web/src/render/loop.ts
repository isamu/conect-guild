import { documentVisibility, type PageVisibility } from '../adapters/visibility';
import type { GuildEvent } from '../domain/events';
import type { MemberId } from '../guild.config';
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
  type Director,
  type StageFrame,
} from './director';
import { daylightAt, hourOf, lampLights } from './daylight';
import { ANIMATED_DECOR } from './decor';
import {
  drawActors,
  drawFrontLayer,
  drawOverhead,
  drawStatic,
  type CachedFrontLayer,
} from './draw';
import { drawAnimatedDecor } from './drawDecor';
import { drawLightPatches, drawShade, drawWindowSun, type ShadeScratch } from './drawDaylight';
import { BACK_ANIMATED_DECOR, FRONT_LAYERS } from './layers';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './map';
import { AMBIENT } from './metrics';
import type { IdleSeeds, IdleSince } from './idle';
import { createIdleCrew, playEvent, type IdleCrew } from './idleCrew';
import { DEFAULT_SEATS } from './scenes';
import { decorCuesOf, type DecorCues } from './trinkets';

/**
 * The requestAnimationFrame loop. It runs every frame while a scene plays; between scenes it
 * redraws only every AMBIENT.frameMs for the small moves (members, lamps, the pet, the other small
 * things, and the light of the time of day, read from the local clock on each draw), and sleeps
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
  /** The local time of day in hours, 0 to 24 (daylight.hourOf of the browser's clock). */
  readonly localHour?: () => number;
  readonly random?: Random;
  readonly visibility?: PageVisibility;
  /** Epoch ms, for the long idle spells (idle.ts); they go on while the page is hidden. */
  readonly wallNow?: () => number;
  /** Members in a scene at `at` (epoch ms), on every frame that shows them in one. */
  readonly onActive?: (ids: readonly MemberId[], at: number) => void;
  /** The idle spells' per-member salts, so the narration tells the same outings (Issue #30). */
  readonly idleSeeds?: IdleSeeds;
}

export interface StageParty {
  readonly bubbles: Bubbles;
  readonly moods: AmbientMoods;
  readonly idleSince: IdleSince;
}

export interface RenderLoop {
  /** Starts the scene for an event now (or when its cast is free); dropped while not shown. */
  play(event: GuildEvent): void;
  /**
   * What the party state shows on the stage: the waiting bubbles, the ambient moves, and since
   * when each member has had nothing to do (idle.ts; a member whose time changes while out playing
   * walks back to their seat).
   */
  setParty(party: StageParty): void;
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

/** False while narrow screens hide the canvas (display: none gives it no width). */
export function isShown(cssWidth: number): boolean {
  return cssWidth > 0;
}

/**
 * The scenes to keep: none while the canvas is out of sight, so they never play late when it comes
 * back (the message queue drops them too and does not wait for them).
 */
export function scenesShown(director: Director, cssWidth: number): Director {
  return isShown(cssWidth) ? director : EMPTY_DIRECTOR;
}

/** True while drawing would not be seen: the page is hidden or the canvas has no width. */
export function isPaused(pageHidden: boolean, cssWidth: number): boolean {
  return pageHidden || !isShown(cssWidth);
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

interface Painter {
  readonly ctx: CanvasRenderingContext2D;
  /** A logical-size canvas for the shade of the night. */
  readonly scratch: ShadeScratch;
  readonly background: HTMLCanvasElement;
  readonly front: readonly CachedFrontLayer[];
  readonly art: GuildArt;
}

interface Moment {
  readonly now: number;
  readonly hour: number;
  readonly frame: StageFrame;
  readonly bubbles: Bubbles;
  readonly cues: DecorCues;
}

/**
 * One frame: the cached background with the sun in the windows and the light patches, the moving
 * things, the members between the cached front layers (desks, the counter, the throne's arms),
 * the shade of the time of day with the lamps' light, and the bubbles and confetti on top.
 */
function paint(painter: Painter, scale: number, moment: Moment): void {
  const { ctx, art } = painter;
  const light = daylightAt(moment.hour);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(painter.background, 0, 0);
  drawWindowSun(ctx, art, light);
  drawLightPatches(ctx, art, moment, light);
  drawAnimatedDecor(ctx, art, moment, BACK_ANIMATED_DECOR);
  drawActors(ctx, moment, art, painter.front);
  drawShade(ctx, painter.scratch, light, lampLights(moment.now));
  drawOverhead(ctx, moment);
}

/** The canvas, the scenery drawn once and an empty canvas for the shade. */
function createPainter(ctx: CanvasRenderingContext2D, art: GuildArt): Painter {
  const { background, front } = cachedScenery(art);
  const image = cachedLayer(() => undefined);
  return { ctx, scratch: { ctx: context2d(image), image }, background, front, art };
}

/** The members' small moves and long idle spells over the director's scenes. */
function createCast(
  art: GuildArt,
  random: Random,
  options: Pick<RenderLoopOptions, 'wallNow' | 'onActive' | 'idleSeeds'>,
): { crew: IdleCrew; frame: (director: Director, t: number, moods: AmbientMoods) => StageFrame } {
  const seeds = createAmbientSeeds(random);
  const hasHoldFrames = (id: MemberId): boolean => art.sprites.hasHoldFrames(id);
  const crew = createIdleCrew({
    random,
    seeds: options.idleSeeds,
    wallNow: options.wallNow ?? (() => Date.now()),
    onActive: options.onActive,
  });
  return {
    crew,
    frame: (director, t, moods) =>
      frameAt(director, t, DEFAULT_SEATS, {
        moods,
        seeds,
        hasHoldFrames,
        idle: crew.frame(director, t),
      }),
  };
}

export function startRenderLoop(options: RenderLoopOptions): RenderLoop {
  const { canvas, art } = options;
  const now = options.now ?? (() => performance.now());
  const localHour = options.localHour ?? (() => hourOf(new Date()));
  const random = options.random ?? Math.random;
  const painter = createPainter(context2d(canvas), art);
  const cast = createCast(art, random, options);
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
    const frame = cast.frame(director, t, moods);
    const cues = decorCuesOf(moods, director.bursts, t);
    paint(painter, scale, { now: t, hour: localHour(), frame, bubbles, cues });
    director = prune(director, t);
    const ambient = Object.keys(moods).length > 0 || ANIMATED_DECOR.length > 0;
    const next = nextDraw({ hidden: paused(), animating: isAnimating(director, t), ambient });
    if (next === 'frame') schedule.now();
    if (next === 'ambient') schedule.later();
  }

  const paused = () => isPaused(visibility.isHidden(), cssWidth);
  const schedule = createScheduler(draw, paused);
  /**
   * Drops the scenes nobody can see, stops or restarts the stage clock with the paused state, then
   * draws (or not) to match.
   */
  function refresh(): void {
    director = scenesShown(director, cssWidth);
    clock = withPaused(clock, paused(), now());
    schedule.refresh();
  }
  const unsubscribe = visibility.subscribe(refresh);
  refresh();
  return {
    play(event) {
      // Members out playing come back first; the scene waits for them (idleCrew.playEvent).
      const context = { seats: DEFAULT_SEATS, random };
      director = playEvent(cast.crew, director, event, { t: stageNow(), context });
      refresh();
    },
    setParty(party) {
      ({ bubbles, moods } = party);
      director = cast.crew.setSince(director, party.idleSince, stageNow());
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
