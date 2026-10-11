import type { GuildArt } from './art';
import type { BubbleKind, Bubbles } from './bubbles';
import type { ConfettiView, StageFrame } from './director';
import { GROUND, MAP_OBJECTS } from './map';
import { DETAIL_SCALE, OVERHEAD_OFFSET } from './metrics';
import type { Point } from './path';

/** Canvas side effects only: every decision was made in the pure modules. Logical pixels. */

/** Ground and furniture: they never move, so the loop draws them once into a cached layer. */
export function drawStatic(ctx: CanvasRenderingContext2D, art: GuildArt): void {
  GROUND.forEach((cells, row) => {
    cells.forEach((tile, col) => {
      art.tiles.drawTile(ctx, tile, { col, row, w: 1, h: 1 });
    });
  });
  for (const object of MAP_OBJECTS) art.tiles.drawTile(ctx, object.tile, object);
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
  const y = -6;
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

/** Members (back to front), what they hold or their bubble, then confetti on top. */
export function drawActors(
  ctx: CanvasRenderingContext2D,
  frame: StageFrame,
  bubbles: Bubbles,
  art: GuildArt,
): void {
  for (const { id, pose } of frame.members) {
    if (!pose.visible) continue;
    art.sprites.drawMember(ctx, id, pose, pose.point);
    const bubble = bubbles[id];
    if (pose.prop !== null) {
      art.sprites.drawProp(ctx, pose.prop, { x: pose.point.x, y: pose.point.y - OVERHEAD_OFFSET });
    } else if (bubble !== undefined) {
      drawBubble(ctx, bubble, pose.point);
    }
  }
  for (const view of frame.confetti) drawConfetti(ctx, view);
}
