import type { MemberId } from '../guild.config';
import { bubbleShown, type BubbleKind, type Bubbles } from './bubbles';
import type { IdleMark } from './idle';
import type { LevelTag } from './levelTags';
import type { SpokenLine } from './lineBook';
import type { SpokenLines } from './lines';
import { BUBBLE_RISE, DETAIL_SCALE, LINES, OVERHEAD_OFFSET } from './metrics';
import type { Held } from './motion';
import type { Point } from './path';
import type { SpeechLine, Speeches } from './summons';

/**
 * What shows over a member's head: one thing at a time (docs/DESIGN.md 4.12, Issue #47). The first
 * that is there wins: the words of the king's call (summons.ts), a line of a scene (lines.ts), the
 * waiting bubble (bubbles.ts), the sign of a long idle spell (idle.ts). Those below are hidden
 * meanwhile, not delayed: each keeps its own times.
 */
export type Overhead =
  | { readonly kind: 'speech'; readonly words: SpeechLine }
  | { readonly kind: 'line'; readonly words: SpokenLine }
  | { readonly kind: 'bubble'; readonly bubble: BubbleKind }
  | { readonly kind: 'mark'; readonly mark: IdleMark };

/** What each member may show this frame. */
export interface OverheadSources {
  readonly speeches: Speeches;
  readonly lines: SpokenLines;
  readonly bubbles: Bubbles;
}

export function overheadOf(
  member: { readonly id: MemberId; readonly inScene: boolean; readonly mark: IdleMark | null },
  sources: OverheadSources,
): Overhead | null {
  const speech = sources.speeches[member.id];
  if (speech !== undefined) return { kind: 'speech', words: speech };
  const line = sources.lines[member.id];
  if (line !== undefined) return { kind: 'line', words: line };
  const bubble = bubbleShown(sources.bubbles, member);
  if (bubble !== null) return { kind: 'bubble', bubble };
  return member.mark === null ? null : { kind: 'mark', mark: member.mark };
}

/** What words are over the head, if any: they make the bubble as wide as they are. */
export function wordsOf(shown: Overhead): string | null {
  return shown.kind === 'speech' || shown.kind === 'line' ? shown.words : null;
}

/** A rectangle in logical px. */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where a bubble of `chars` characters is drawn over feet at `feet`, `lift` px up (draw.ts
 * drawBubble: 3 detail px right of the feet, 9 high with a 2 px tail under it, the text in the 7 px
 * font, a full-width character 7 px wide, plus 6 px). The tail's height spans the whole width.
 */
export function wordsBox(feet: Point, chars: number, lift: number): Box {
  const left = feet.x + 3 * DETAIL_SCALE;
  const top = feet.y - OVERHEAD_OFFSET - BUBBLE_RISE * DETAIL_SCALE - lift;
  return {
    left,
    right: left + (chars * 7 + 6) * DETAIL_SCALE,
    top,
    bottom: top + 11 * DETAIL_SCALE,
  };
}

/** Where a 「Lv N」 tag is drawn (drawLevelTags.ts: bold 10 px, centred, a 1 px outline). */
export function tagBox(tag: LevelTag): Box {
  const half = (tag.text.length * 6) / 2 + 2;
  return { left: tag.x - half, right: tag.x + half, top: tag.y - 7, bottom: tag.y + 7 };
}

function meet(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * How far up what is over the head goes: clear of an item held up over it (`raisedLiftPx`), and
 * for words, clear of the 「Lv N」 tags on the desks (levelTags.ts) too: a long line from a lower
 * seat reaches the tag on the counter or a desk up the room (ひらめ's to かなめ's, かなめ's to
 * ひびき's), and then goes up until its bottom is `tagGapPx` over the tag; again if it then meets
 * another one higher up (at most once per tag, as each step clears the highest one it meets).
 */
export function overheadLift(
  pose: { readonly point: Point; readonly held: Held | null },
  words: string | null,
  tags: readonly LevelTag[],
): number {
  const raised = pose.held?.hold === 'raise' ? LINES.raisedLiftPx : 0;
  if (words === null) return raised;
  return liftOverTags(pose.point, Array.from(words).length, raised, tags.map(tagBox));
}

/** `lift`, or more until words of `chars` characters meet none of `tags` (one step per tag). */
function liftOverTags(feet: Point, chars: number, lift: number, tags: readonly Box[]): number {
  const box = wordsBox(feet, chars, lift);
  const tops = tags.filter((tag) => meet(box, tag)).map((tag) => tag.top);
  if (tops.length === 0) return lift;
  const higher = lift + box.bottom - Math.min(...tops) + LINES.tagGapPx;
  // Now over the highest tag met, the bubble can only meet tags higher still: one step per tag.
  const rest = tags.filter((tag) => tag.top < Math.min(...tops));
  return liftOverTags(feet, chars, higher, rest);
}
