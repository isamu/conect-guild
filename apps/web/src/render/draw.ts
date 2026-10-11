import { decorPose } from './ambient';
import type { GuildArt } from './art';
import type { BubbleKind, Bubbles } from './bubbles';
import type { ConfettiView, MemberPose, StageFrame } from './director';
import { FLOOR_PATCH_DECOR, type AnimatedDecor, type DecorPlacement } from './decor';
import {
  BACK_ANIMATED_DECOR,
  BACK_OBJECTS,
  BACK_STILL_DECOR,
  drawSteps,
  type FrontLayer,
} from './layers';
import { GROUND } from './map';
import { BUBBLE_RISE, DETAIL_SCALE, OVERHEAD_OFFSET, TILE_SIZE } from './metrics';
import type { Point } from './path';

/** Canvas side effects only: every decision was made in the pure modules. Logical pixels. */

function drawPlacement(ctx: CanvasRenderingContext2D, art: GuildArt, item: DecorPlacement): void {
  art.decor.drawDecor(ctx, item.name, item.col * TILE_SIZE, item.row * TILE_SIZE);
}

/**
 * Ground, the furniture behind the members and the small things that never move: the loop draws
 * them once into a cached layer. The lamps and the cat are left out (drawAnimatedDecor), and so is
 * the furniture in front of the members (drawFrontLayer).
 */
export function drawStatic(ctx: CanvasRenderingContext2D, art: GuildArt): void {
  GROUND.forEach((cells, row) => {
    cells.forEach((tile, col) => {
      art.tiles.drawTile(ctx, tile, { col, row, w: 1, h: 1 });
    });
  });
  for (const item of FLOOR_PATCH_DECOR) drawPlacement(ctx, art, item);
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

/** Lamps with a flickering flame (a little light added over them) and the breathing cat. */
export function drawAnimatedDecor(
  ctx: CanvasRenderingContext2D,
  art: GuildArt,
  now: number,
  items: readonly AnimatedDecor[] = BACK_ANIMATED_DECOR,
): void {
  for (const { placement, motion, phaseMs } of items) {
    const { dy, glow } = decorPose(motion, phaseMs, now);
    const x = placement.col * TILE_SIZE;
    const y = placement.row * TILE_SIZE + dy;
    art.decor.drawDecor(ctx, placement.name, x, y);
    if (glow <= 0) continue;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = glow;
    art.decor.drawDecor(ctx, placement.name, x, y);
    ctx.restore();
  }
}

const BUBBLE_GLYPHS: Readonly<Record<BubbleKind, { glyph: string; color: string }>> = {
  'awaiting-president': { glyph: '!', color: '#b0103a' },
  'awaiting-kaname': { glyph: '…', color: '#222222' },
};

/** A small bubble to the upper right of the head, drawn in detail pixels. */
function drawBubble(ctx: CanvasRenderingContext2D, kind: BubbleKind, feet: Point): void {
  ctx.save();
  ctx.translate(Math.round(feet.x), Math.round(feet.y - OVERHEAD_OFFSET));
  ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
  const x = 3;
  const y = -BUBBLE_RISE;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, 11, 9);
  ctx.fillRect(x + 1, y + 9, 2, 2);
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, 10, 8);
  const { glyph, color } = BUBBLE_GLYPHS[kind];
  ctx.fillStyle = color;
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x + 5.5, y + 5);
  ctx.restore();
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
  const { id, pose, hand } = member;
  art.sprites.drawMember(ctx, id, pose, pose.point);
  if (hand !== null) {
    const at = { x: pose.point.x + hand.offset.x, y: pose.point.y + hand.offset.y };
    art.sprites.drawProp(ctx, hand.prop, at);
  }
  if (pose.prop !== null) {
    art.sprites.drawProp(ctx, pose.prop, { x: pose.point.x, y: pose.point.y - OVERHEAD_OFFSET });
  }
}

/**
 * Members (back to front) with what they hold, between the front layers so the furniture in front
 * of a member covers them; then the bubbles of those holding nothing, and confetti on top.
 */
export function drawActors(
  ctx: CanvasRenderingContext2D,
  stage: { readonly frame: StageFrame; readonly bubbles: Bubbles; readonly now: number },
  art: GuildArt,
  front: readonly CachedFrontLayer[],
): void {
  const { frame, bubbles, now } = stage;
  for (const step of drawSteps(frame.members, front)) {
    if (step.kind === 'member') {
      drawMemberPose(ctx, step.member, art);
      continue;
    }
    ctx.drawImage(step.layer.image, 0, 0);
    drawAnimatedDecor(ctx, art, now, step.layer.layer.animated);
  }
  for (const { id, pose } of frame.members) {
    const bubble = bubbles[id];
    if (pose.prop === null && bubble !== undefined) drawBubble(ctx, bubble, pose.point);
  }
  for (const view of frame.confetti) drawConfetti(ctx, view);
}
