import type { MemberId } from '../guild.config';
import type { GuildArt } from './art';
import type { BubbleKind, Bubbles } from './bubbles';
import type { ConfettiView, MemberPose, StageFrame } from './director';
import type { DecorPlacement } from './decor';
import { drawAnimatedDecor } from './drawDecor';
import { BACK_OBJECTS, BACK_STILL_DECOR, stageSteps, type FrontLayer } from './layers';
import { GROUND } from './map';
import type { IdleMark } from './idle';
import { BUBBLE_RISE, DETAIL_SCALE, IDLE, OVERHEAD_OFFSET, TILE_SIZE } from './metrics';
import { heldLook } from './hands';
import type { LevelTag } from './levelTags';
import {
  overheadLift,
  overheadOf,
  overheadSide,
  wordsOf,
  type Overhead,
  type Side,
} from './overhead';
import type { Point } from './path';
import type { SpeechLine, Speeches } from './summons';
import { flyingItemPoint } from './toss';
import type { DecorCues } from './trinkets';

/** Canvas side effects only: every decision was made in the pure modules. Logical pixels. */

function drawPlacement(ctx: CanvasRenderingContext2D, art: GuildArt, item: DecorPlacement): void {
  art.decor.drawDecor(ctx, item.name, item.col * TILE_SIZE, item.row * TILE_SIZE);
}

/**
 * Ground, the furniture behind the members and the small things that never move: the loop draws
 * them once into a cached layer. The things that move are left out (drawDecor.ts), and so are the
 * light patches (drawDaylight.ts) and the furniture in front of the members (drawFrontLayer).
 */
export function drawStatic(ctx: CanvasRenderingContext2D, art: GuildArt): void {
  GROUND.forEach((cells, row) => {
    cells.forEach((tile, col) => {
      art.tiles.drawTile(ctx, tile, { col, row, w: 1, h: 1 });
    });
  });
  for (const object of BACK_OBJECTS) art.tiles.drawTile(ctx, object.tile, object);
  for (const item of BACK_STILL_DECOR) drawPlacement(ctx, art, item);
}

/** One front layer's still parts, for its own cached canvas: furniture, clipped parts, things on it. */
export function drawFrontLayer(
  ctx: CanvasRenderingContext2D,
  art: GuildArt,
  layer: FrontLayer,
): void {
  for (const object of layer.objects) art.tiles.drawTile(ctx, object.tile, object);
  for (const { object, clips } of layer.parts) {
    ctx.save();
    ctx.beginPath();
    for (const r of clips) ctx.rect(r.left, r.top, r.right - r.left, r.bottom - r.top);
    ctx.clip();
    art.tiles.drawTile(ctx, object.tile, object);
    ctx.restore();
  }
  for (const item of layer.still) drawPlacement(ctx, art, item);
}

interface Glyph {
  readonly glyph: string;
  readonly color: string;
}

const BUBBLE_GLYPHS: Readonly<Record<BubbleKind, Glyph>> = {
  'awaiting-permission': { glyph: '?', color: '#1a56b0' },
  'awaiting-president': { glyph: '!', color: '#b0103a' },
  'awaiting-kaname': { glyph: '…', color: '#222222' },
};

/** The signs of a long idle spell (idle.ts): fixed glyphs, never outside text. */
const IDLE_GLYPHS: Readonly<Record<'…' | '♪', Glyph>> = {
  '…': { glyph: '…', color: '#222222' },
  '♪': { glyph: '♪', color: '#2a7a2a' },
};

/**
 * A bubble's font and width in detail px; a null width fits the text (summons.ts words). Words may
 * go on the left of the head (`side`, overhead.overheadSide); the rest are on the right.
 */
interface BubbleSize {
  readonly font: string;
  readonly width: number | null;
  readonly side?: Side;
}

/** The waiting bubbles and the signs of a long idle spell: one glyph. */
const SMALL_BUBBLE: BubbleSize = { font: 'bold 8px sans-serif', width: 11 };
/** The words of the king's summons and the members' lines (lines.ts). */
const SPEECH_BUBBLE: BubbleSize = { font: 'bold 7px sans-serif', width: null };

/**
 * A bubble to the upper right of the head (or the upper left, `side`: overhead.overheadSide), drawn
 * in detail pixels, its tail at the end next to the head.
 */
function drawBubble(
  ctx: CanvasRenderingContext2D,
  { glyph, color }: Glyph,
  feet: Point,
  size: BubbleSize = SMALL_BUBBLE,
): void {
  const side = size.side ?? 'right';
  ctx.save();
  ctx.translate(Math.round(feet.x), Math.round(feet.y - OVERHEAD_OFFSET));
  ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
  ctx.font = size.font;
  const width = size.width ?? Math.ceil(ctx.measureText(glyph).width) + 6;
  const x = side === 'right' ? 3 : -3 - width;
  const y = -BUBBLE_RISE;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, width, 9);
  ctx.fillRect(side === 'right' ? x + 1 : x + width - 3, y + 9, 2, 2);
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 8);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x + width / 2, y + 5);
  ctx.restore();
}

/** A "Z" rising from over the head and fading as it goes (`rise` 0 to 1), in detail pixels. */
function drawSleepZ(ctx: CanvasRenderingContext2D, rise: number, feet: Point): void {
  ctx.save();
  ctx.translate(Math.round(feet.x), Math.round(feet.y - OVERHEAD_OFFSET));
  ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
  ctx.globalAlpha = 1 - rise;
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#1a3a8a';
  const x = 6 + 2 * rise;
  const y = -(IDLE.zRisePx / DETAIL_SCALE) * rise;
  ctx.strokeText('Z', x, y);
  ctx.fillText('Z', x, y);
  ctx.restore();
}

/** The words of the king's summons (summons.ts): fixed strings, never outside text. */
const SPEECH_COLORS: Readonly<Record<SpeechLine, string>> = {
  '！': '#b0103a',
  ゴニョゴニョ: '#222222',
  'はっ！': '#1a3a8a',
};

/** The members' lines (lineBook.ts) read best in the dark ink of the king's murmur. */
const LINE_COLOR = '#222222';

function drawMark(ctx: CanvasRenderingContext2D, mark: IdleMark, feet: Point): void {
  if (mark.kind === 'z') drawSleepZ(ctx, mark.rise, feet);
  else drawBubble(ctx, IDLE_GLYPHS[mark.glyph], feet);
}

function drawConfetti(ctx: CanvasRenderingContext2D, view: ConfettiView): void {
  for (const p of view.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(view.origin.x + p.x), Math.round(view.origin.y + p.y), p.size, p.size);
  }
}

/** A front layer with its still parts already drawn (the loop caches them once). */
export interface CachedFrontLayer {
  readonly depth: number;
  readonly layer: FrontLayer;
  readonly image: CanvasImageSource;
}

function drawMemberPose(ctx: CanvasRenderingContext2D, member: MemberPose, art: GuildArt): void {
  const { id, pose } = member;
  if (pose.held === null) {
    art.sprites.drawMember(ctx, id, pose, pose.point);
    return;
  }
  const look = heldLook(id, pose, pose.held, art.sprites.hasHoldFrames(id));
  art.sprites.drawMember(ctx, id, look, look.feet);
}

/** What a member holds, in their hands: over the furniture in front, which would hide it. */
function drawHeldItem(ctx: CanvasRenderingContext2D, member: MemberPose, art: GuildArt): void {
  const { id, pose, hand } = member;
  if (pose.held !== null) {
    const { prop, hold } = pose.held;
    const look = heldLook(id, pose, pose.held, art.sprites.hasHoldFrames(id));
    art.sprites.drawProp(ctx, prop, look.item, hold);
  } else if (hand !== null) {
    const at = { x: pose.point.x + hand.offset.x, y: pose.point.y + hand.offset.y };
    art.sprites.drawProp(ctx, hand.prop, at, 'carry');
  }
}

/** Items in the air (toss.ts): over every member and the furniture, as they fly over the room. */
function drawFlights(ctx: CanvasRenderingContext2D, frame: StageFrame, art: GuildArt): void {
  const feetOf = (id: MemberId) => frame.members.find((m) => m.id === id)?.pose.point;
  const hasHoldFrames = (id: MemberId) => art.sprites.hasHoldFrames(id);
  for (const view of frame.flights) {
    const at = flyingItemPoint(view, feetOf, hasHoldFrames);
    if (at !== null) art.sprites.drawProp(ctx, view.prop, at, 'raise');
  }
}

/**
 * Members (back to front) between the front layers, so the furniture in front of a member covers
 * their lower body, with the moving things on that furniture; then what they hold (sunk into a
 * seat, the hands are just over the desk or the counter, which would hide the item).
 */
export function drawActors(
  ctx: CanvasRenderingContext2D,
  stage: { readonly frame: StageFrame; readonly now: number; readonly cues: DecorCues },
  art: GuildArt,
  front: readonly CachedFrontLayer[],
): void {
  for (const step of stageSteps(stage.frame.members, front)) {
    if (step.kind === 'member') drawMemberPose(ctx, step.member, art);
    if (step.kind === 'held') drawHeldItem(ctx, step.member, art);
    if (step.kind !== 'layer') continue;
    ctx.drawImage(step.layer.image, 0, 0);
    drawAnimatedDecor(ctx, art, stage, step.layer.layer.animated);
  }
  drawFlights(ctx, stage.frame, art);
}

function drawOverheadOf(
  ctx: CanvasRenderingContext2D,
  shown: Overhead,
  place: { readonly feet: Point; readonly side: Side },
): void {
  const { feet, side } = place;
  if (shown.kind === 'speech') {
    const glyph = { glyph: shown.words, color: SPEECH_COLORS[shown.words] };
    drawBubble(ctx, glyph, feet, { ...SPEECH_BUBBLE, side });
  } else if (shown.kind === 'line') {
    drawBubble(ctx, { glyph: shown.words, color: LINE_COLOR }, feet, { ...SPEECH_BUBBLE, side });
  } else if (shown.kind === 'bubble') drawBubble(ctx, BUBBLE_GLYPHS[shown.bubble], feet);
  else drawMark(ctx, shown.mark, feet);
}

/**
 * Over everything, after the shade of the night (drawDaylight.ts), so they read the same at any
 * hour: one thing over each head (overhead.ts: the words of the king's summons, a line of a scene,
 * the waiting bubble or the sign of a long idle spell), and confetti.
 */
export function drawOverhead(
  ctx: CanvasRenderingContext2D,
  stage: {
    readonly frame: StageFrame;
    readonly bubbles: Bubbles;
    readonly speeches: Speeches;
    /** The 「Lv N」 tags on the desks, which words go over (overhead.overheadLift). */
    readonly tags: readonly LevelTag[];
  },
): void {
  const sources = { ...stage, lines: stage.frame.lines };
  for (const member of stage.frame.members) {
    const shown = overheadOf(member, sources);
    if (shown === null) continue;
    const { x, y } = member.pose.point;
    const words = wordsOf(shown);
    const lift = overheadLift(member.pose, words, stage.tags);
    drawOverheadOf(ctx, shown, {
      feet: { x, y: y - lift },
      side: overheadSide(member.pose, words),
    });
  }
  for (const view of stage.frame.confetti) drawConfetti(ctx, view);
}
