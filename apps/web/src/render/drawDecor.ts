import type { DecorName } from '../../../../assets/decor/decor';
import { decorPose, type DecorMotion } from './ambient';
import type { GuildArt } from './art';
import type { AnimatedDecor } from './decor';
import { decorDraw } from './decorArt';
import { TILE_SIZE, TRINKETS } from './metrics';
import {
  activeSince,
  catStretchAt,
  GLINT_POINTS,
  GLOBE_BODY,
  glintAt,
  notesAt,
  SAND_STREAM,
  sandGrainAt,
  spinBandAt,
  swingAt,
  waveAt,
  type DecorCues,
  type Note,
} from './trinkets';

/**
 * Canvas side effects for the small things that move (ambient.ts, trinkets.ts decide how they
 * look). Each is drawn whole every frame, then its motion over it: added light, a shift of some
 * rows, or a few small shapes. No new pictures. Logical px.
 */

interface Drawing {
  readonly ctx: CanvasRenderingContext2D;
  readonly art: GuildArt;
  readonly now: number;
}

/** One thing at its place, with the time it has been moving since (its trigger). */
interface Thing {
  readonly name: DecorName;
  readonly x: number;
  readonly y: number;
  readonly phaseMs: number;
  readonly since: number;
}

/** The picture again with added light (the flames, the globe's band). */
function addLight(d: Drawing, thing: Thing, alpha: number): void {
  d.ctx.save();
  d.ctx.globalCompositeOperation = 'lighter';
  d.ctx.globalAlpha = alpha;
  d.art.decor.drawDecor(d.ctx, thing.name, thing.x, thing.y);
  d.ctx.restore();
}

/** The picture in rows of `band` px, each shifted sideways by `dxOf(row top, picture height)`. */
function drawShifted(
  d: Drawing,
  thing: Thing,
  band: number,
  dxOf: (top: number, height: number) => number,
): void {
  const { w, h } = decorDraw(thing.name);
  for (let top = 0; top < h; top += band) {
    d.ctx.save();
    d.ctx.beginPath();
    d.ctx.rect(thing.x - TILE_SIZE, thing.y + top, w + 2 * TILE_SIZE, band);
    d.ctx.clip();
    d.art.decor.drawDecor(d.ctx, thing.name, thing.x + dxOf(top, h), thing.y);
    d.ctx.restore();
  }
}

function drawFlame(d: Drawing, thing: Thing): void {
  d.art.decor.drawDecor(d.ctx, thing.name, thing.x, thing.y);
  const { glow } = decorPose('flame', thing.phaseMs, d.now);
  if (glow > 0) addLight(d, thing, glow);
}

/** The cat breathes, and now and then wakes and stretches (scaled around its bottom centre). */
function drawCat(d: Drawing, thing: Thing): void {
  const { dy } = decorPose('breath', thing.phaseMs, d.now);
  const { scaleX, scaleY } = catStretchAt(thing.phaseMs, d.now);
  const { w, h } = decorDraw(thing.name);
  d.ctx.save();
  d.ctx.translate(thing.x + w / 2, thing.y + h);
  d.ctx.scale(scaleX, scaleY);
  // Asleep it breathes; awake it is still.
  const rise = scaleX === 1 && scaleY === 1 ? dy : 0;
  d.art.decor.drawDecor(d.ctx, thing.name, -w / 2, -h + rise);
  d.ctx.restore();
}

/** A four-pointed star in pale gold, `arm` px each way from its centre. */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, arm: number): void {
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(x - arm, y - 1, 2 * arm + 2, 2);
  ctx.fillRect(x - 1, y - arm, 2, 2 * arm + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1, y - 1, 2, 2);
}

function drawGlint(d: Drawing, thing: Thing): void {
  d.art.decor.drawDecor(d.ctx, thing.name, thing.x, thing.y);
  const glint = glintAt(GLINT_POINTS[thing.name] ?? [], thing.phaseMs, d.now - thing.since);
  if (glint !== null) drawStar(d.ctx, thing.x + glint.x, thing.y + glint.y, glint.arm);
}

/** Cells (NOTE_CELL px each) of a note and of a "!", from their bottom-left. */
const NOTE_CELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [2, -1],
  [2, -2],
  [2, -3],
  [2, -4],
  [3, -4],
  [0, -1],
  [1, -1],
];
const BANG_CELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -2],
  [0, -3],
  [0, -4],
  [0, -5],
];

/** Side of one cell of a note, logical px. */
const NOTE_CELL = 3;

/**
 * A note (dark violet) or a "!" (red) with a white outline, so it reads over ひびき's white
 * blouse and dark hair alike.
 */
function drawNote(ctx: CanvasRenderingContext2D, x: number, y: number, note: Note): void {
  const cells = note.kind === 'note' ? NOTE_CELLS : BANG_CELLS;
  ctx.fillStyle = '#ffffff';
  for (const [cx, cy] of cells) {
    ctx.fillRect(x + cx * NOTE_CELL - 1, y + cy * NOTE_CELL - 1, NOTE_CELL + 2, NOTE_CELL + 2);
  }
  ctx.fillStyle = note.kind === 'note' ? '#5a1f8a' : '#d42a2a';
  for (const [cx, cy] of cells) {
    ctx.fillRect(x + cx * NOTE_CELL, y + cy * NOTE_CELL, NOTE_CELL, NOTE_CELL);
  }
}

function drawNotes(d: Drawing, thing: Thing): void {
  d.art.decor.drawDecor(d.ctx, thing.name, thing.x, thing.y);
  for (const note of notesAt(thing.phaseMs, d.now - thing.since)) {
    drawNote(d.ctx, thing.x + note.x, thing.y + note.y, note);
  }
}

/** A band of light across the globe's body, as if it turned. */
function drawSpin(d: Drawing, thing: Thing): void {
  d.art.decor.drawDecor(d.ctx, thing.name, thing.x, thing.y);
  const left = spinBandAt(thing.phaseMs, d.now);
  d.ctx.save();
  d.ctx.beginPath();
  d.ctx.rect(
    thing.x + left,
    thing.y + GLOBE_BODY.top,
    TRINKETS.spinBandPx,
    GLOBE_BODY.bottom - GLOBE_BODY.top,
  );
  d.ctx.clip();
  addLight(d, thing, 0.45);
  d.ctx.restore();
}

/** The keys swing: the lower rows go further, the top stays on its hook. */
function drawSwing(d: Drawing, thing: Thing): void {
  const dx = swingAt(thing.phaseMs, d.now);
  drawShifted(d, thing, 2, (top, h) => Math.round((dx * top) / h));
}

/** A thin stream of sand through the neck, with a brighter grain falling down it. */
function drawSand(d: Drawing, thing: Thing): void {
  d.art.decor.drawDecor(d.ctx, thing.name, thing.x, thing.y);
  const x = thing.x + SAND_STREAM.x;
  d.ctx.fillStyle = '#e2b866';
  d.ctx.fillRect(x, thing.y + SAND_STREAM.top, 2, SAND_STREAM.bottom - SAND_STREAM.top);
  d.ctx.fillStyle = '#fff1c0';
  d.ctx.fillRect(x, thing.y + SAND_STREAM.top + sandGrainAt(thing.phaseMs, d.now), 2, 2);
}

function drawFlutter(d: Drawing, thing: Thing): void {
  const elapsed = d.now - thing.since;
  drawShifted(d, thing, 2, (top, h) => waveAt(top / h, elapsed));
}

const DRAW: Readonly<Record<DecorMotion, (d: Drawing, thing: Thing) => void>> = {
  flame: drawFlame,
  breath: drawCat,
  glint: drawGlint,
  notes: drawNotes,
  spin: drawSpin,
  swing: drawSwing,
  sand: drawSand,
  flutter: drawFlutter,
};

/**
 * The lamps with a flickering flame, the cat, and the things that move at times: still pictures
 * while their trigger does not hold (`cues`, trinkets.ts).
 */
export function drawAnimatedDecor(
  ctx: CanvasRenderingContext2D,
  art: GuildArt,
  stage: { readonly now: number; readonly cues: DecorCues },
  items: readonly AnimatedDecor[],
): void {
  const d: Drawing = { ctx, art, now: stage.now };
  for (const { placement, motion, phaseMs, trigger } of items) {
    const x = placement.col * TILE_SIZE;
    const y = placement.row * TILE_SIZE;
    const since = activeSince(trigger, stage.cues);
    if (since === null) {
      art.decor.drawDecor(ctx, placement.name, x, y);
      continue;
    }
    DRAW[motion](d, { name: placement.name, x, y, phaseMs, since });
  }
}
