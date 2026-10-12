import type { MemberState } from '../domain/party';
import type { MemberId } from '../guild.config';

/**
 * Small bubbles over the seats for members who are waiting on someone (docs/DESIGN.md 4.6).
 * The state is already the one that wins by the order of 4.6 (domain/party.ts), so a member whose
 * session waits for a permission (live, 4.7) shows that bubble even with PRs waiting.
 * The king's 承認まち bubble stays in HTML (ui/KingBubble.vue), so the canvas draws none for him.
 */

export type BubbleKind = 'awaiting-permission' | 'awaiting-president' | 'awaiting-kaname';

export type Bubbles = Readonly<Partial<Record<MemberId, BubbleKind>>>;

const BUBBLE_STATES: ReadonlySet<MemberState> = new Set<BubbleKind>([
  'awaiting-permission',
  'awaiting-president',
  'awaiting-kaname',
]);

function isBubbleKind(state: MemberState): state is BubbleKind {
  return BUBBLE_STATES.has(state);
}

export function bubbleFor(id: MemberId, state: MemberState): BubbleKind | null {
  if (id === 'yukihiro') return null;
  return isBubbleKind(state) ? state : null;
}

/**
 * The bubble drawn over a member in this frame. A member in a scene (carrying a scroll or a chest,
 * walking to the counter and back, or under confetti) shows none: the bubble belongs to the seat
 * where they wait, and comes back when they are seated again.
 */
export function bubbleShown(
  bubbles: Bubbles,
  member: { readonly id: MemberId; readonly inScene: boolean },
): BubbleKind | null {
  return member.inScene ? null : (bubbles[member.id] ?? null);
}

export function bubblesOf(rows: readonly { id: MemberId; state: MemberState }[]): Bubbles {
  const bubbles: Partial<Record<MemberId, BubbleKind>> = {};
  for (const row of rows) {
    const kind = bubbleFor(row.id, row.state);
    if (kind !== null) bubbles[row.id] = kind;
  }
  return bubbles;
}
