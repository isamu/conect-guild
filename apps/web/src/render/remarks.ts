import type { MemberId } from '../guild.config';
import type { BubbleKind, Bubbles } from './bubbles';
import type { Random } from './confetti';
import { inScene, isAtSeat, type Director } from './director';
import type { IdlePoses } from './idle';
import type { LineScene } from './lineBook';
import {
  linesAt,
  speakInTurn,
  type PickLine,
  type SpokenLines,
  type Turn,
  type Utterance,
} from './lines';
import { LINES } from './metrics';
import { DEFAULT_SEATS } from './scenes';

/**
 * A word when a member starts waiting on someone (Issue #47, docs/DESIGN.md 4.11): the waiting
 * bubble (bubbles.ts) is new for them, and now and then (`LINES.remarkChance`) they say a line of
 * that wait for `LINES.remarkMs`; the bubble stays and shows again once the line is over. Pure: the
 * time, the random source (`lineRandom`, render/loop.ts) and who is free to speak are passed in.
 */

/** The moment of the line book for each wait. */
const SCENE_OF: Readonly<Record<BubbleKind, LineScene>> = {
  'awaiting-president': 'awaitPresident',
  'awaiting-kaname': 'awaitKaname',
  'awaiting-permission': 'awaitPermission',
};

/** The order the members are taken in, as the party window (the king has no waiting bubble). */
const ORDER: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'];

export interface WaitingChange {
  readonly id: MemberId;
  readonly kind: BubbleKind;
}

/**
 * Members whose waiting bubble in `next` is new: none before, or another kind (a member waiting
 * for かなめ who now waits for the president). None without a `previous` (the first party).
 */
export function newlyWaiting(previous: Bubbles | null, next: Bubbles): WaitingChange[] {
  if (previous === null) return [];
  return ORDER.flatMap((id) => {
    const kind = next[id];
    return kind === undefined || kind === previous[id] ? [] : [{ id, kind }];
  });
}

/**
 * The turns of the members who say something at `at`: free to (at their seat and in no scene), then
 * only when the random number drawn for them is under `LINES.remarkChance`. Nothing is drawn for a
 * member who is not free.
 */
export function remarkTurns(
  changes: readonly WaitingChange[],
  at: number,
  free: (id: MemberId) => boolean,
  random: Random,
): Turn[] {
  return changes
    .filter((change) => free(change.id))
    .filter(() => random() < LINES.remarkChance)
    .map((change) => ({ actor: change.id, scene: SCENE_OF[change.kind], at }));
}

/**
 * True when `id` is free to say a remark at `t`: in no scene (nor walking back from play, which is a
 * track) and with their feet on their seat (not out playing in a long idle spell, `idle`).
 */
export function isFree(director: Director, t: number, id: MemberId, idle: IdlePoses): boolean {
  if (inScene(director, id, t)) return false;
  return isAtSeat(director, t, { id, seat: DEFAULT_SEATS[id], idle: idle[id] });
}

/** The bubbles last seen (null before a party to compare with) and the lines said or to come. */
export interface Remarks {
  readonly previous: Bubbles | null;
  readonly said: readonly Utterance[];
}

export const NO_REMARKS: Remarks = { previous: null, said: [] };

/** The party as the remarks see it. */
export interface RemarkParty {
  readonly bubbles: Bubbles;
  /** False before the first snapshot: its empty party is not one to compare with. */
  readonly known: boolean;
  /** Halted: what is said and to come is dropped, and the next party only starts over. */
  readonly halted: boolean;
}

export interface RemarkMoment {
  /** Stage time now. */
  readonly t: number;
  /** Nothing is drawn now (the page or the canvas is hidden): the moment passes unsaid. */
  readonly quiet: boolean;
  /** At their seat and in no scene (render/loop.ts). */
  readonly free: (id: MemberId) => boolean;
  readonly random: Random;
  /** Without one nothing is said (scenes.SceneContext.pickLine). */
  readonly pick: PickLine | undefined;
}

/**
 * Takes a new party. Those who start waiting now may say a line, one after another, after the lines
 * still to come, so two never show at once. None for the first party, the first after a halt, or
 * while nothing is drawn.
 */
export function receiveParty(remarks: Remarks, party: RemarkParty, moment: RemarkMoment): Remarks {
  if (party.halted) return NO_REMARKS;
  if (!party.known) return { ...remarks, previous: null };
  const changes = newlyWaiting(remarks.previous, party.bubbles);
  if (moment.quiet || changes.length === 0) return { ...remarks, previous: party.bubbles };
  const at = Math.max(moment.t, ...remarks.said.map((said) => said.end));
  const turns = remarkTurns(changes, at, moment.free, moment.random);
  return {
    previous: party.bubbles,
    said: [...remarks.said, ...speakInTurn(turns, remarks.said, moment.pick)],
  };
}

/** Who says a remark at `t`. */
export function remarksAt(remarks: Remarks, t: number): SpokenLines {
  return linesAt(remarks.said, t);
}

/** True while a remark shows or is still to come. */
export function isRemarking(remarks: Remarks, t: number): boolean {
  return remarks.said.some((said) => said.end > t);
}

/** Drops the remarks that are over. */
export function pruneRemarks(remarks: Remarks, t: number): Remarks {
  return { ...remarks, said: remarks.said.filter((said) => said.end > t) };
}

/** Drops what is said and to come, keeping the bubbles to compare with (the canvas is hidden). */
export function silenced(remarks: Remarks): Remarks {
  return { ...remarks, said: [] };
}
