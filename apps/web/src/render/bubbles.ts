import type { MemberState } from '../domain/party';
import type { MemberId } from '../guild.config';

/**
 * Small bubbles over the seats for members who are waiting on someone (docs/DESIGN.md 4.6).
 * The king's 承認まち bubble stays in HTML (ui/KingBubble.vue), so the canvas draws none for him.
 */

export type BubbleKind = 'awaiting-president' | 'awaiting-kaname';

export type Bubbles = Readonly<Partial<Record<MemberId, BubbleKind>>>;

export function bubbleFor(id: MemberId, state: MemberState): BubbleKind | null {
  if (id === 'yukihiro') return null;
  return state === 'awaiting-president' || state === 'awaiting-kaname' ? state : null;
}

export function bubblesOf(rows: readonly { id: MemberId; state: MemberState }[]): Bubbles {
  const bubbles: Partial<Record<MemberId, BubbleKind>> = {};
  for (const row of rows) {
    const kind = bubbleFor(row.id, row.state);
    if (kind !== null) bubbles[row.id] = kind;
  }
  return bubbles;
}
