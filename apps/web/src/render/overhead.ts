import type { MemberId } from '../guild.config';
import { bubbleShown, type BubbleKind, type Bubbles } from './bubbles';
import type { IdleMark } from './idle';
import type { SpokenLine } from './lineBook';
import type { SpokenLines } from './lines';
import { LINES } from './metrics';
import type { Held } from './motion';
import type { SpeechLine, Speeches } from './summons';

/**
 * What shows over a member's head: one thing at a time (docs/DESIGN.md 4.11, Issue #47). The first
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

/** How far up what is over the head goes: clear of an item held up over it, else not at all. */
export function overheadLift(pose: { readonly held: Held | null }): number {
  return pose.held?.hold === 'raise' ? LINES.raisedLiftPx : 0;
}
