import type { MemberId } from '../guild.config';
import type { Random } from './confetti';
import { linesOf, type LineScene, type SpokenLine } from './lineBook';
import { LINES } from './metrics';

/**
 * The members' lines at the moments of a scene (Issue #47, docs/DESIGN.md 4.11). Pure but for
 * createLinePicker, whose memory of the last lines is the only state: the times are passed in and
 * the random source is injected (`lineRandom` in render/loop.ts, apart from the confetti's and the
 * toss's, so their sequences stay as they were).
 *
 * A scene says who speaks at which moment (`Turn`, scenes.ts); the director turns them into lines
 * on the stage clock (`Utterance`) when it schedules the scene, so a hidden page stops them with
 * everything else and a hidden canvas drops them with the scenes.
 */

/** Someone speaks at a moment of a scene, from `at` (stage ms) or when the one before is done. */
export interface Turn {
  readonly actor: MemberId;
  readonly scene: LineScene;
  readonly at: number;
}

/** A line over a member's head from `start` to `end` (exclusive), on the stage clock. */
export interface Utterance {
  readonly actor: MemberId;
  readonly line: SpokenLine;
  readonly start: number;
  readonly end: number;
}

/** Chooses what `actor` says at `scene`; null when they say nothing there. */
export type PickLine = (actor: MemberId, scene: LineScene) => SpokenLine | null;

/** Who says which line at a moment. */
export type SpokenLines = Readonly<Partial<Record<MemberId, SpokenLine>>>;

const SHOW_MS: Readonly<Record<LineScene, number>> = {
  handOver: LINES.giveMs,
  deliverChest: LINES.giveMs,
  toss: LINES.tossMs,
  takeScroll: LINES.takeMs,
  takeChest: LINES.takeMs,
  clear: LINES.clearMs,
  seeClear: LINES.kingMs,
};

/** How long a line of `scene` shows. */
export function showMs(scene: LineScene): number {
  return SHOW_MS[scene];
}

/** The last lines to avoid out of `count` to choose from: always leaves one to say. */
function avoidedOf<L>(count: number, recent: readonly L[]): readonly L[] {
  const keep = Math.min(LINES.recentLines, count - 1);
  return keep > 0 ? recent.slice(-keep) : [];
}

/**
 * One of `options` that is not among the last ones said (`recent`, oldest first), chosen evenly by
 * `random`; null when there are no options.
 */
export function pickLine<L>(options: readonly L[], recent: readonly L[], random: Random): L | null {
  const avoided = avoidedOf(options.length, recent);
  const fresh = options.filter((line) => !avoided.includes(line));
  // No number is drawn for nothing to say, so the sequence goes on as if it was never asked.
  if (fresh.length === 0) return null;
  const index = Math.min(Math.floor(random() * fresh.length), fresh.length - 1);
  return fresh[index] ?? null;
}

/** `recent` with `line` said last, keeping as many as pickLine may avoid. */
export function remember<L>(recent: readonly L[], line: L): L[] {
  return [...recent, line].slice(-LINES.recentLines);
}

/** Picks from the line book, remembering the last lines of each member at each moment. */
export function createLinePicker(random: Random): PickLine {
  const memory = new Map<string, readonly SpokenLine[]>();
  return (actor, scene) => {
    const key = `${actor}:${scene}`;
    const recent = memory.get(key) ?? [];
    const line = pickLine(linesOf(actor, scene), recent, random);
    if (line !== null) memory.set(key, remember(recent, line));
    return line;
  };
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * The lines of a scene's turns, one after another: each starts at its time or when the line before
 * ends, so two never show at once. A turn that would show while its member still says something
 * (`said`, from another scene) is dropped, not delayed; so is one nobody picks a line for. Without
 * `pick` nothing is said (the message queue plans scenes only to time them).
 */
export function speakInTurn(
  turns: readonly Turn[],
  said: readonly Utterance[],
  pick: PickLine | undefined,
): Utterance[] {
  if (pick === undefined) return [];
  const spoken: Utterance[] = [];
  let free = Number.NEGATIVE_INFINITY;
  for (const turn of turns) {
    const start = Math.max(turn.at, free);
    const slot = { start, end: start + showMs(turn.scene) };
    const busy = said.some((other) => other.actor === turn.actor && overlaps(other, slot));
    const line = busy ? null : pick(turn.actor, turn.scene);
    if (line === null) continue;
    spoken.push({ actor: turn.actor, line, ...slot });
    free = slot.end;
  }
  return spoken;
}

/** Who says what at `now`. */
export function linesAt(lines: readonly Utterance[], now: number): SpokenLines {
  const shown: Partial<Record<MemberId, SpokenLine>> = {};
  for (const said of lines) if (said.start <= now && now < said.end) shown[said.actor] = said.line;
  return shown;
}
