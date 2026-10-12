import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel, MemberId, TilePos } from '../guild.config';
import type { IdleStep } from './idle';
import { createAmbientSeeds } from './ambient';
import { EMPTY_DIRECTOR, frameAt, trackEnd, type Director } from './director';
import { createIdleCrew, playEvent, type IdleCrew } from './idleCrew';
import { IDLE } from './metrics';
import type { Point } from './path';
import { DEFAULT_SEATS } from './scenes';

/**
 * Events while members are out playing (idle.ts): nobody jumps. Each member's drawn point moves
 * at most a walking step (plus sinking into the seat) from one frame to the next, from before the
 * event to the end of its scene. The wall clock runs with the stage clock here.
 */

const MIN = 60_000;
const CYCLE_START = 7_000_000 * IDLE.playCycleMs;
const IDS: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'];
const FRAME_MS = 50;
/** A walking step in FRAME_MS (6.4 px) plus the seat's sink blending in (7.2 px), with room. */
const MAX_STEP_PX = 20;
const ambient = { moods: {}, seeds: createAmbientSeeds(() => 0), hasHoldFrames: () => false };
const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

function event(kind: GuildEventKind, department: DepartmentLabel): GuildEvent {
  return { id: `${kind}#1`, kind, number: 1, department };
}

interface Stage {
  readonly crew: IdleCrew;
  readonly clock: { wall: number };
  director: Director;
}

/** Everybody idle for an hour; the stage clock starts at the wall's CYCLE_START. */
function stage(): Stage {
  const clock = { wall: CYCLE_START };
  const crew = createIdleCrew({
    random: () => 0.25,
    wallNow: () => clock.wall,
    onActive: undefined,
  });
  const since = Object.fromEntries(IDS.map((id) => [id, CYCLE_START - 60 * MIN]));
  return { crew, clock, director: crew.setSince(EMPTY_DIRECTOR, since, 0) };
}

function pointsAt(s: Stage, t: number): Map<MemberId, Point> {
  s.clock.wall = CYCLE_START + t;
  const frame = frameAt(s.director, t, DEFAULT_SEATS, {
    ...ambient,
    idle: s.crew.frame(s.director, t),
  });
  return new Map(frame.members.map((m) => [m.id, m.pose.point]));
}

const sameTile = (a: TilePos, b: TilePos): boolean => a.col === b.col && a.row === b.row;
const nearSeat = (id: MemberId, tile: TilePos): boolean =>
  Math.abs(tile.col - DEFAULT_SEATS[id].col) + Math.abs(tile.row - DEFAULT_SEATS[id].row) <= 1;

/** True when the step is what we look for: at a spot, or walking more than a tile from the seat. */
function isAway(id: MemberId, step: IdleStep, walking: boolean): boolean {
  if (sameTile(step.from, step.to)) return !walking && !sameTile(step.from, DEFAULT_SEATS[id]);
  return walking && !nearSeat(id, step.from) && !nearSeat(id, step.to);
}

/** The first frame time when `id` is away from the seat, standing (`walking` false) or walking. */
function awayAt(s: Stage, id: MemberId, walking: boolean): number {
  for (let t = 0; t < 240 * MIN; t += FRAME_MS) {
    s.clock.wall = CYCLE_START + t;
    const step = s.crew.frame(s.director, t)[id]?.step;
    if (step !== undefined && isAway(id, step, walking)) return t;
  }
  throw new Error(`${id} never goes out`);
}

/** The largest move of any member between two frames, from `from` for `ms`. */
function largestStep(
  s: Stage,
  from: number,
  ms: number,
): { px: number; id: MemberId | null; t: number } {
  let largest: { px: number; id: MemberId | null; t: number } = { px: 0, id: null, t: from };
  let before = pointsAt(s, from);
  for (let t = from + FRAME_MS; t <= from + ms; t += FRAME_MS) {
    const now = pointsAt(s, t);
    for (const id of IDS) {
      const a = before.get(id);
      const b = now.get(id);
      if (a === undefined || b === undefined) continue;
      const px = Math.hypot(b.x - a.x, b.y - a.y);
      if (px > largest.px) largest = { px, id, t: t - from };
    }
    before = now;
  }
  return largest;
}

const CASES: readonly { kind: GuildEventKind; department: DepartmentLabel; away: MemberId }[] = [
  { kind: 'issue-closed', department: '広報', away: 'hibiki' },
  { kind: 'issue-closed', department: '経理', away: 'minori' },
  { kind: 'issue-opened', department: '広報', away: 'hibiki' },
  { kind: 'issue-opened', department: '経理', away: 'kaname' },
  { kind: 'pr-merged', department: '企画', away: 'hirame' },
  { kind: 'pr-merged', department: '総務', away: 'kaname' },
  { kind: 'level-up', department: '経理', away: 'minori' },
  { kind: 'level-up', department: '総務', away: 'sasae' },
];

/** A level-up's hops and confetti start at the seat once the member is back there. */
function expectHopsAtSeat(director: Director, away: MemberId): void {
  const [walk, hops] = director.tracks.filter((track) => track.actor === away);
  const back = walk === undefined ? undefined : trackEnd(walk);
  expect(back).toBeDefined();
  expect(hops?.segments[0]?.start).toBe(back);
  expect(hops?.segments[0]?.path).toEqual([DEFAULT_SEATS[away]]);
  expect(director.bursts[0]?.start).toBe(back);
}

describe('playEvent with members out playing', () => {
  for (const { kind, department, away } of CASES) {
    for (const walking of [false, true]) {
      const where = walking ? 'on the way' : 'at the spot';
      it(`${kind} (${department}) with ${away} ${where}: nobody jumps`, () => {
        const s = stage();
        const t = awayAt(s, away, walking);
        const before = pointsAt(s, t);
        s.director = playEvent(s.crew, s.director, event(kind, department), { t, context });
        const after = pointsAt(s, t);
        // Waking up may lift a sleeper by a few px; nobody moves further than a step.
        for (const id of IDS) {
          const a = before.get(id);
          const b = after.get(id);
          expect(a && b && Math.hypot(b.x - a.x, b.y - a.y), id).toBeLessThanOrEqual(MAX_STEP_PX);
        }
        if (kind === 'issue-closed') {
          // The confetti starts over the seat once the member is back there.
          const burst = s.director.bursts[0];
          const walk = s.director.tracks.find((track) => track.actor === away);
          expect(walk).toBeDefined();
          expect(burst?.start).toBe(walk && trackEnd(walk));
        }
        if (kind === 'level-up') expectHopsAtSeat(s.director, away);
        const step = largestStep(s, t, 30_000);
        expect(step.px, `${String(step.id)} jumped at +${String(step.t)} ms`).toBeLessThanOrEqual(
          MAX_STEP_PX,
        );
      });
    }
  }
});
