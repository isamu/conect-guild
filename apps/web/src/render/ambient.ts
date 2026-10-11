import type { MemberState } from '../domain/party';
import type { MemberId } from '../guild.config';
import type { Random } from './confetti';
import { AMBIENT } from './metrics';
import type { Prop, SpriteFrame } from './motion';
import type { Point } from './path';

/**
 * Small moves while nothing happens, chosen from the party state only (no new data, no new
 * pictures: the four frames, mirroring, a few px of offset and the existing props). Pure: the
 * time and the per-member seed are passed in. Members in a scene get none (director.ts).
 */

export type AmbientMood =
  /** Typing at the desk, now and then turning aside for papers. */
  | 'desk-work'
  /** Now and then looking around or stretching. */
  | 'idle'
  /** かなめ with quests at the reception: tidying the scroll. */
  | 'tidy-scroll'
  /** かなめ with nothing at the reception: fanning. */
  | 'fan'
  /** The king with PRs to approve: swaying on the throne. */
  | 'fidget';

export type AmbientMoods = Readonly<Partial<Record<MemberId, AmbientMood>>>;

export function ambientMoodOf(id: MemberId, state: MemberState): AmbientMood {
  if (id === 'kaname') {
    if (state === 'working') return 'tidy-scroll';
    // awaiting-kaname: reviewing PRs, which reads as desk work.
    return state === 'idle' ? 'fan' : 'desk-work';
  }
  if (id === 'yukihiro') return state === 'awaiting-president' ? 'fidget' : 'idle';
  return state === 'working' ? 'desk-work' : 'idle';
}

export function ambientMoodsOf(
  rows: readonly { id: MemberId; state: MemberState }[],
): AmbientMoods {
  const moods: Partial<Record<MemberId, AmbientMood>> = {};
  for (const row of rows) moods[row.id] = ambientMoodOf(row.id, row.state);
  return moods;
}

/** Per member, so the members do not all move together. */
export interface AmbientSeed {
  /** Shifts the member's cycle, ms in [0, intervalMs). */
  readonly phaseMs: number;
  /** Length of one cycle (a move, then rest), ms. */
  readonly intervalMs: number;
}

export type AmbientSeeds = Readonly<Record<MemberId, AmbientSeed>>;

function seed(random: Random): AmbientSeed {
  const span = AMBIENT.maxIntervalMs - AMBIENT.minIntervalMs;
  const intervalMs = Math.round(AMBIENT.minIntervalMs + random() * span);
  return { intervalMs, phaseMs: Math.floor(random() * intervalMs) };
}

export function createAmbientSeeds(random: Random): AmbientSeeds {
  return {
    kaname: seed(random),
    minori: seed(random),
    hibiki: seed(random),
    hirame: seed(random),
    sasae: seed(random),
    yukihiro: seed(random),
  };
}

/** An item handled in front of the member, centred at `offset` from the feet. */
export interface HandProp {
  readonly prop: Prop;
  readonly offset: Point;
}

export interface AmbientPose {
  readonly frame: SpriteFrame;
  /** True when facing left (side frames only). */
  readonly flip: boolean;
  /** Added to the feet, logical px. */
  readonly offset: Point;
  readonly hand: HandProp | null;
}

export const AMBIENT_REST: AmbientPose = {
  frame: 0,
  flip: false,
  offset: { x: 0, y: 0 },
  hand: null,
};

/** Where `now` falls in the member's cycle: which cycle, and ms since it began. */
interface CycleTime {
  readonly index: number;
  readonly elapsed: number;
}

function cycleTime(seed: AmbientSeed, now: number): CycleTime {
  const t = now + seed.phaseMs;
  const index = Math.floor(t / seed.intervalMs);
  return { index, elapsed: t - index * seed.intervalMs };
}

/** 0 or 1, switching every `stepMs` from the start of the cycle. */
function alternate(elapsed: number, stepMs: number): 0 | 1 {
  return Math.floor(elapsed / stepMs) % 2 === 0 ? 0 : 1;
}

function rest(offset: Point = AMBIENT_REST.offset): AmbientPose {
  return { ...AMBIENT_REST, offset };
}

function deskWork({ index, elapsed }: CycleTime): AmbientPose {
  if (elapsed < AMBIENT.pageTurnMs) return { ...AMBIENT_REST, frame: 1, flip: index % 2 !== 0 };
  return rest({ x: 0, y: -AMBIENT.typingBobPx * alternate(elapsed, AMBIENT.typingMs) });
}

function idle({ index, elapsed }: CycleTime): AmbientPose {
  if (index % 2 !== 0) {
    return elapsed < AMBIENT.stretchMs ? rest({ x: 0, y: -AMBIENT.stretchPx }) : AMBIENT_REST;
  }
  if (elapsed < AMBIENT.lookMs) return { ...AMBIENT_REST, frame: 1 };
  if (elapsed < 2 * AMBIENT.lookMs) return { ...AMBIENT_REST, frame: 1, flip: true };
  return AMBIENT_REST;
}

function fan({ elapsed }: CycleTime): AmbientPose {
  if (elapsed >= AMBIENT.fanBurstMs) return AMBIENT_REST;
  return { ...AMBIENT_REST, frame: alternate(elapsed, AMBIENT.fanStrokeMs) };
}

/** -1 or +1 times `px`, switching every `stepMs`, during the first `burstMs`; else 0. */
function sway(elapsed: number, burstMs: number, stepMs: number, px: number): number {
  if (elapsed >= burstMs) return 0;
  return alternate(elapsed, stepMs) === 0 ? -px : px;
}

function tidyScroll({ elapsed }: CycleTime): AmbientPose {
  const x = sway(elapsed, AMBIENT.scrollBurstMs, AMBIENT.scrollStepMs, AMBIENT.scrollShakePx);
  return { ...AMBIENT_REST, hand: { prop: 'scroll', offset: { x, y: -AMBIENT.handHeightPx } } };
}

function fidget({ elapsed }: CycleTime): AmbientPose {
  const x = sway(elapsed, AMBIENT.fidgetBurstMs, AMBIENT.fidgetStepMs, AMBIENT.fidgetPx);
  return rest({ x, y: 0 });
}

const MOVES: Readonly<Record<AmbientMood, (time: CycleTime) => AmbientPose>> = {
  'desk-work': deskWork,
  idle,
  'tidy-scroll': tidyScroll,
  fan,
  fidget,
};

/** The frame, facing, offset and handled item of a member in `mood` at `now` (ms). */
export function ambientPose(mood: AmbientMood, seed: AmbientSeed, now: number): AmbientPose {
  return MOVES[mood](cycleTime(seed, now));
}
