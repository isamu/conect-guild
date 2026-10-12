import type { ConfettiView } from './director';
import { LEVEL_UP } from './levelUp';

/**
 * Canvas side effects only (levelUp.ts decides): the words "LEVEL UP" over the seat of a member
 * who went up a level, on top of everything like the confetti. A fixed string, drawn with fillText.
 */
export function drawLevelUpBanners(
  ctx: CanvasRenderingContext2D,
  confetti: readonly ConfettiView[],
): void {
  ctx.save();
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1608';
  ctx.fillStyle = '#ffd84a';
  for (const { origin, banner } of confetti) {
    if (banner === null) continue;
    ctx.globalAlpha = banner.alpha;
    const x = Math.round(origin.x);
    const y = Math.round(origin.y - banner.rise);
    ctx.strokeText(LEVEL_UP.text, x, y);
    ctx.fillText(LEVEL_UP.text, x, y);
  }
  ctx.restore();
}
