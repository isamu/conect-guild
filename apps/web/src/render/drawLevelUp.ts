import type { StageFrame } from './director';
import { bannerPoint, LEVEL_UP } from './levelUp';
import type { Speeches } from './summons';

/** What the words need of a 2D context (tests pass a recording one). */
export type BannerContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'lineWidth'
  | 'lineJoin'
  | 'strokeStyle'
  | 'fillStyle'
  | 'globalAlpha'
  | 'strokeText'
  | 'fillText'
>;

/**
 * Canvas side effects only (levelUp.ts decides): the words "LEVEL UP" over the seat of a member
 * who went up a level, on top of everything like the confetti, and over the member's answer to
 * the king when there is one. A fixed string, drawn with fillText.
 */
export function drawLevelUpBanners(
  ctx: BannerContext,
  stage: { readonly frame: Pick<StageFrame, 'confetti' | 'members'>; readonly speeches: Speeches },
): void {
  ctx.save();
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1608';
  ctx.fillStyle = '#ffd84a';
  for (const { actor, origin, banner } of stage.frame.confetti) {
    if (banner === null) continue;
    const speaker =
      stage.speeches[actor] === undefined
        ? null
        : (stage.frame.members.find((m) => m.id === actor)?.pose.point ?? null);
    const at = bannerPoint(origin, banner, speaker);
    ctx.globalAlpha = banner.alpha;
    ctx.strokeText(LEVEL_UP.text, Math.round(at.x), Math.round(at.y));
    ctx.fillText(LEVEL_UP.text, Math.round(at.x), Math.round(at.y));
  }
  ctx.restore();
}
