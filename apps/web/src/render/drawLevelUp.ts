import type { StageFrame } from './director';
import type { LevelTag } from './levelTags';
import { bannerPoint, LEVEL_UP } from './levelUp';
import { wordsFeet } from './overhead';
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
 * who went up a level, on top of everything like the confetti, and over the words over the
 * member's head when there are some (the answer to the king, a line of a scene: overhead.wordsFeet,
 * lifted as they are drawn). A fixed string, drawn with fillText.
 */
export function drawLevelUpBanners(
  ctx: BannerContext,
  stage: {
    readonly frame: Pick<StageFrame, 'confetti' | 'members' | 'lines'>;
    readonly speeches: Speeches;
    /** The 「Lv N」 tags, which lift words over them (overhead.overheadLift). */
    readonly tags: readonly LevelTag[];
  },
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
    const member = stage.frame.members.find((m) => m.id === actor);
    const sources = { speeches: stage.speeches, lines: stage.frame.lines };
    const speaker = member === undefined ? null : wordsFeet(member, sources, stage.tags);
    const at = bannerPoint(origin, banner, speaker);
    ctx.globalAlpha = banner.alpha;
    ctx.strokeText(LEVEL_UP.text, Math.round(at.x), Math.round(at.y));
    ctx.fillText(LEVEL_UP.text, Math.round(at.x), Math.round(at.y));
  }
  ctx.restore();
}
