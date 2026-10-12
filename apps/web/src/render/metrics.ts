/**
 * Every size of the drawing in one place (contract with assets/tiles and assets/sprites):
 * 32 x 18 tiles of 32 px (logical 1024 x 576), members drawn from 80 x 80 frames.
 */

export const TILE_SIZE = 32;
/** One sprite frame (square); the feet are at the bottom centre. */
export const SPRITE_SIZE = 80;
/**
 * Logical px per detail pixel. Small hand-made shapes (bubbles, placeholder boxes, confetti) are
 * designed on a 16 px tile grid and scaled by this, so they keep their proportions.
 */
export const DETAIL_SCALE = TILE_SIZE / 16;
/** How far above the feet held items and confetti are centred: just over the head. */
export const OVERHEAD_OFFSET = SPRITE_SIZE + 2 * DETAIL_SCALE;
/** How far a waiting bubble's top sits over OVERHEAD_OFFSET, in detail px (draw.ts). */
export const BUBBLE_RISE = 6;
/** The highest point drawn over a member, above the feet: the top of a bubble. */
export const OVERHEAD_TOP = OVERHEAD_OFFSET + BUBBLE_RISE * DETAIL_SCALE;

/**
 * The small moves members make when nothing happens (ambient.ts), kept quiet on purpose.
 * Times are ms, distances logical px. Each member waits `minIntervalMs`–`maxIntervalMs` between
 * their moves (drawn once per member from the injected random source).
 */
export const AMBIENT = {
  /** Redraw interval while only ambient moves show (about 7 fps). */
  frameMs: 140,
  minIntervalMs: 5_000,
  maxIntervalMs: 14_000,
  /**
   * Desk work: typing (the front frame and the arms-in-front frame in turn, or an up-and-down bob
   * on a sheet without the holding frames), and a short turn to the side for papers.
   */
  typingMs: 280,
  typingBobPx: 2,
  pageTurnMs: 560,
  /** Idle: look right then left, or stretch up. */
  lookMs: 840,
  stretchMs: 1_120,
  stretchPx: 4,
  /** かなめ with nothing at the reception: fanning (front and side frames in turn). */
  fanBurstMs: 2_520,
  fanStrokeMs: 280,
  /** かなめ with quests at the reception: the scroll at hand, nudged left and right. */
  scrollBurstMs: 3_360,
  scrollStepMs: 420,
  scrollShakePx: 2,
  handHeightPx: 28,
  /** The king with PRs to approve: a small sway on the throne. */
  fidgetBurstMs: 3_360,
  fidgetStepMs: 420,
  fidgetPx: 2,
  /** Lamps and candles: the flame brightens by up to this much (added light), changing every step. */
  flameGlow: 0.22,
  flameStepMs: 280,
  /** The sleeping cat rises 1 px for half of each breath. */
  breathMs: 2_520,
  breathPx: 1,
  /** Shifts each lamp's flicker and each cat's breath against the others. */
  decorPhaseStepMs: 377,
} as const;

/**
 * How far a member at a seat is drawn below the feet of their tile (logical px), so the furniture
 * in front hides the lower body (seating.ts). Measured on the tiles: a desk's back edge is 12 px
 * below its top, the counter's 3 px, the throne's seat cushion 62 px.
 */
export const SEATING = {
  /** On a chair behind a desk: the desk hides everything below the chest. */
  chairPx: 36,
  /** かなめ right behind the counter top: it hides her from the waist down. */
  counterPx: 30,
  /** The king deep in the throne: its seat and arms hide his legs. */
  thronePx: 26,
} as const;

/** Where a carried item is centred (motion.heldItemPoint), logical px from the feet. */
export const HOLD = {
  /** Up from the feet: between the chest and the waist. */
  carryHeightPx: 30,
  /** Forward of the middle when facing sideways: at the hands, a little out from the body. */
  carryForwardPx: 14,
  /** Up on every other step while walking in the carrying frame (it has no stepping legs). */
  walkBobPx: 2,
  /** Half the height of a raised item's picture (chest 31 px, scroll bundle 32 px): it sits on the hands. */
  raisedItemHalfPx: 16,
} as const;

/**
 * Confetti over a member when a quest is cleared (confetti.ts): squares of `smallPx` or `largePx`,
 * thrown up and out, then drifting down slowly (light paper, low gravity) for `durationMs`.
 * Velocities are logical px / s. Chosen so that over every seat the squares stay on screen and
 * above the message window until the end: the fastest rise stays under the top of the room from
 * the upper seats, and the slowest one has not fallen past the message window from the lower ones.
 */
export const CONFETTI = {
  durationMs: 2_600,
  count: 48,
  smallPx: 2 * DETAIL_SCALE,
  largePx: 3 * DETAIL_SCALE,
  /** Share of the large squares. */
  largeShare: 0.4,
  /** Sideways speed, -spread/2 to +spread/2. */
  spreadPx: 60 * DETAIL_SCALE,
  riseMinPx: 25 * DETAIL_SCALE,
  riseMaxPx: 60 * DETAIL_SCALE,
  gravityPx: 40 * DETAIL_SCALE,
} as const;

/**
 * The small things that move (trinkets.ts): times are ms, distances logical px (one px of the
 * decor pictures). Each thing is still unless its trigger holds (who works, the king waiting, a
 * quest just cleared); the cat and the light patches always move.
 */
export const TRINKETS = {
  /** 経理: a glint on the abacus or the coins now and then, `showMs` out of every `stepMs`. */
  sparkleStepMs: 1_120,
  sparkleShowMs: 420,
  /** Share of the steps with a glint. */
  sparkleShare: 0.6,
  /** 広報: a note or a "!" leaves the megaphone every `noteEveryMs` and lives `noteLifeMs`. */
  noteEveryMs: 840,
  noteLifeMs: 1_680,
  noteRisePx: 28,
  noteDriftPx: 20,
  /** Share of "!" among them. */
  bangShare: 0.25,
  /** 企画: a band of light crosses the globe once every `spinMs`, as if it turned. */
  spinMs: 1_960,
  spinBandPx: 4,
  /**
   * 総務: the papers on ささえ's file stack are sorted. Each turn of `shuffleMs` the top sheet
   * slides `shuffleSlidePx`, lifts its corner, then lies flat again; on a share of the turns a
   * sheet floats up off the stack, `floatRisePx` up and `floatDriftPx` aside at the top, and
   * settles back on it by `floatMs`.
   */
  shuffleMs: 1_680,
  shuffleSlidePx: 3,
  floatShare: 0.35,
  floatMs: 1_120,
  floatRisePx: 14,
  floatDriftPx: 6,
  /** The hourglass: a grain falls through the neck every `sandMs`. */
  sandMs: 700,
  /** A banner flutters while the confetti flies, `wavePx` at the bottom, one wave every `waveMs`. */
  waveMs: 560,
  wavePx: 4,
  /** The cat wakes once every `catIntervalMs`: it rises, then stretches out. */
  catIntervalMs: 21_000,
  catRiseMs: 420,
  catStretchMs: 1_260,
  catRiseY: 1.1,
  catStretchX: 1.15,
  catStretchY: 0.88,
  /** The light patches drift with the sun (from morning to evening) and sway a little. */
  patchDriftPx: 16,
  patchSwayPx: 2,
  patchSwayMs: 17_000,
} as const;

/** Day and night (daylight.ts): the light around the lamps at night and the sun in the windows. */
export const DAYLIGHT = {
  /** Radius of the light around a lantern or a pillar lamp, and around a candle or a sconce. */
  lampRadiusPx: 84,
  smallLampRadiusPx: 60,
  /** The radius grows by up to this share with the flame's flicker. */
  lampFlickerShare: 0.1,
  /** Warm light added around the lamps at full night. */
  glowAlpha: 0.3,
  /** Light added over the window tiles in full sun. */
  windowSunAlpha: 0.3,
} as const;
