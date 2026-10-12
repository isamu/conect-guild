import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { MemberState } from '../domain/party';
import type { MemberId } from '../guild.config';
import type { SoundCue } from './scores';

/** Which sound each event plays when its message reaches the window. */
const EVENT_CUES: Readonly<Record<GuildEventKind, SoundCue>> = {
  'issue-opened': 'scroll',
  'pr-merged': 'chest',
  'issue-closed': 'clear',
};

/**
 * The sound of a message that reached the window: its event's, or the soft ピピピ for a notice
 * (no event). Event messages do not add the ピピピ, so two sounds never start together.
 */
export function cueForMessage(message: { readonly event: GuildEvent | null }): SoundCue {
  return message.event === null ? 'text' : EVENT_CUES[message.event.kind];
}

/** The sound of the head message when it newly reached the window (its id is not `lastId`). */
export function messageCue(
  message: { readonly id: number; readonly event: GuildEvent | null } | null,
  lastId: number | null,
): SoundCue | null {
  return message === null || message.id === lastId ? null : cueForMessage(message);
}

/**
 * The king's call for a new order of the president (Issue #28; its id is not `lastId`), unless
 * `other` starts with it (two sounds never start together, and the call gives way) or the canvas is
 * not known to be shown (null before it reports; the call is not played there, so not heard).
 */
export function summonsCue(
  summons: { readonly id: number } | null,
  lastId: number | null,
  context: { readonly other: SoundCue | null; readonly stageShown: boolean | null },
): SoundCue | null {
  if (summons === null || summons.id === lastId) return null;
  return context.other === null && context.stageShown === true ? 'summon' : null;
}

export interface PartyMember {
  readonly id: MemberId;
  readonly state: MemberState;
}

function awaitingIds(rows: readonly PartyMember[]): Set<MemberId> {
  return new Set(rows.filter((row) => row.state === 'awaiting-permission').map((row) => row.id));
}

/**
 * Members who wait for a permission in `next` but did not in `previous`. With no previous party
 * (the first snapshot) nobody is new: those already waiting at load do not ring.
 */
export function newlyAwaiting(
  previous: readonly PartyMember[] | null,
  next: readonly PartyMember[],
): MemberId[] {
  if (previous === null) return [];
  const before = awaitingIds(previous);
  return [...awaitingIds(next)].filter((id) => !before.has(id));
}

export interface SoundGate {
  /** The viewer turned the sound on. */
  readonly enabled: boolean;
  /** The page is hidden: nothing rings now, nor later when it is shown again. */
  readonly hidden: boolean;
  /** The screen is halted (schema mismatch): the windows are not live. */
  readonly halted: boolean;
}

export function mayPlay(gate: SoundGate): boolean {
  return gate.enabled && !gate.hidden && !gate.halted;
}
