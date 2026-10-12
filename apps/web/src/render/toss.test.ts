import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel, MemberId } from '../guild.config';
import { stageTime, withPaused, RUNNING_CLOCK } from './clock';
import {
  EMPTY_DIRECTOR,
  frameAt,
  isAnimating,
  prune,
  scheduleEvent,
  sendHome,
  type Director,
} from './director';
import { heldLook } from './hands';
import { TOSS } from './metrics';
import { carry, raise, walkSegment, type Held, type Pose } from './motion';
import type { Point } from './path';
import { castOf, DEFAULT_SEATS, HOLD_UP_MS, PICK_UP_MS, planScene, type Track } from './scenes';
import { arcPoint, flightAt, flyingItemPoint, shouldToss, tileDistance, type Flight } from './toss';

/** A random source that counts its draws. */
function counted(value: number): { random: () => number; draws: () => number } {
  let draws = 0;
  return {
    random: () => {
      draws += 1;
      return value;
    },
    draws: () => draws,
  };
}

const TOSSING = { seats: DEFAULT_SEATS, random: () => 0 };
const WALKING = { seats: DEFAULT_SEATS, random: () => TOSS.share };

const NEAR: readonly (readonly [DepartmentLabel, MemberId])[] = [
  ['経理', 'minori'],
  ['広報', 'hibiki'],
];
const FAR: readonly (readonly [DepartmentLabel, MemberId])[] = [
  ['企画', 'hirame'],
  ['総務', 'sasae'],
];

const LET_GO = PICK_UP_MS + TOSS.windUpMs;
const CAUGHT = LET_GO + TOSS.flightMs;

function event(kind: GuildEventKind, department: DepartmentLabel | null): GuildEvent {
  return { id: `${kind}#1`, kind, number: 1, department };
}

function trackOf(tracks: readonly Track[], id: MemberId): Track {
  const track = tracks.find((t) => t.actor === id);
  if (track === undefined) throw new Error(`no track for ${id}`);
  return track;
}

function heldAt(track: Track, t: number): Held | null | undefined {
  return track.segments.find((s) => s.start <= t && t < s.end)?.held;
}

describe('shouldToss', () => {
  it('measures the straight line between the seats in tiles', () => {
    expect(tileDistance({ col: 16, row: 7 }, { col: 12, row: 4 })).toBe(5);
    expect(tileDistance({ col: 0, row: 0 }, { col: 0, row: 0 })).toBe(0);
  });

  it.each(NEAR)('tosses to %s (near) with the chance TOSS.share', (_label, id) => {
    expect(tileDistance(DEFAULT_SEATS.kaname, DEFAULT_SEATS[id])).toBeLessThanOrEqual(
      TOSS.maxTiles,
    );
    expect(shouldToss(DEFAULT_SEATS.kaname, DEFAULT_SEATS[id], () => 0)).toBe(true);
    expect(shouldToss(DEFAULT_SEATS.kaname, DEFAULT_SEATS[id], () => TOSS.share - 1e-9)).toBe(true);
    expect(shouldToss(DEFAULT_SEATS.kaname, DEFAULT_SEATS[id], () => TOSS.share)).toBe(false);
  });

  it.each(FAR)('never tosses to %s (far) and draws no random number', (_label, id) => {
    const source = counted(0);
    expect(tileDistance(DEFAULT_SEATS.kaname, DEFAULT_SEATS[id])).toBeGreaterThan(TOSS.maxTiles);
    expect(shouldToss(DEFAULT_SEATS.kaname, DEFAULT_SEATS[id], source.random)).toBe(false);
    expect(source.draws()).toBe(0);
  });

  it('counts a seat exactly TOSS.maxTiles away as near', () => {
    const from = { col: 0, row: 0 };
    expect(shouldToss(from, { col: TOSS.maxTiles, row: 0 }, () => 0)).toBe(true);
    expect(shouldToss(from, { col: TOSS.maxTiles + 0.01, row: 0 }, () => 0)).toBe(false);
  });
});

describe('planScene: issue-opened, tossed', () => {
  it.each(NEAR)('tosses the scroll to %s without anyone leaving their seat', (department, id) => {
    const scene = planScene(event('issue-opened', department), 0, TOSSING);
    expect(scene.flights).toEqual([
      { prop: 'scroll', from: 'kaname', to: id, start: LET_GO, end: CAUGHT },
    ]);
    expect(new Set(scene.tracks.map((t) => t.actor))).toEqual(
      new Set(castOf(event('issue-opened', department))),
    );
    for (const track of scene.tracks) {
      const seat = DEFAULT_SEATS[track.actor];
      // Nobody walks: every segment stays on the seat, back to back from the start.
      expect(track.segments.every((s) => s.path.length === 1 && s.path[0] === seat)).toBe(true);
      track.segments.forEach((s, i) => {
        expect(s.start).toBe(i === 0 ? 0 : track.segments[i - 1]?.end);
      });
    }
  });

  it('has かなめ take up the scroll, raise it, let it go and watch it land', () => {
    const kaname = trackOf(planScene(event('issue-opened', '経理'), 0, TOSSING).tracks, 'kaname');
    expect(heldAt(kaname, 0)).toEqual(carry('scroll'));
    expect(heldAt(kaname, PICK_UP_MS - 1)).toEqual(carry('scroll'));
    expect(heldAt(kaname, PICK_UP_MS)).toEqual(raise('scroll'));
    expect(heldAt(kaname, LET_GO - 1)).toEqual(raise('scroll'));
    // In the air: her hands are empty until she is done watching.
    expect(heldAt(kaname, LET_GO)).toBeNull();
    expect(heldAt(kaname, CAUGHT)).toBeNull();
    expect(kaname.segments.at(-1)?.end).toBe(CAUGHT + TOSS.watchMs);
  });

  it('has the member wait at the seat and catch it with both hands up at the landing', () => {
    const minori = trackOf(planScene(event('issue-opened', '経理'), 0, TOSSING).tracks, 'minori');
    expect(heldAt(minori, 0)).toBeNull();
    expect(heldAt(minori, CAUGHT - 1)).toBeNull();
    expect(heldAt(minori, CAUGHT)).toEqual(raise('scroll'));
    expect(heldAt(minori, CAUGHT + HOLD_UP_MS - 1)).toEqual(raise('scroll'));
    expect(minori.segments.at(-1)?.end).toBe(CAUGHT + HOLD_UP_MS);
  });

  it('walks the scroll over when the draw is TOSS.share or more', () => {
    const scene = planScene(event('issue-opened', '経理'), 0, WALKING);
    expect(scene.flights).toEqual([]);
    expect(trackOf(scene.tracks, 'kaname').segments.some((s) => s.path.length > 1)).toBe(true);
  });

  it.each(FAR)('walks the scroll to %s (far) and draws no random number', (department) => {
    const source = counted(0);
    const scene = planScene(event('issue-opened', department), 0, {
      seats: DEFAULT_SEATS,
      random: source.random,
    });
    expect(scene.flights).toEqual([]);
    expect(source.draws()).toBe(0);
  });

  it('never tosses at the reception (no department) or a chest', () => {
    const source = counted(0);
    const context = { seats: DEFAULT_SEATS, random: source.random };
    expect(planScene(event('issue-opened', null), 0, context).flights).toEqual([]);
    expect(planScene(event('pr-merged', '経理'), 0, context).flights).toEqual([]);
    expect(source.draws()).toBe(0);
  });
});

describe('flightAt / arcPoint', () => {
  const flight: Flight = { prop: 'scroll', from: 'kaname', to: 'minori', start: 1_000, end: 2_000 };

  it('is in the air from the moment it is let go until the moment it is caught', () => {
    expect(flightAt(flight, 999)).toBeNull();
    expect(flightAt(flight, 1_000)?.progress).toBe(0);
    expect(flightAt(flight, 1_500)?.progress).toBe(0.5);
    expect(flightAt(flight, 1_999)?.progress).toBeCloseTo(0.999);
    // Caught: the member holds it from here (exclusive end).
    expect(flightAt(flight, 2_000)).toBeNull();
  });

  it('leaves from the first point, lands on the second, arcPx over the higher at the middle', () => {
    const a: Point = { x: 0, y: 100 };
    const b: Point = { x: 100, y: 0 };
    const low: Point = { x: 100, y: 100 };
    expect(arcPoint(a, b, 0)).toEqual(a);
    expect(arcPoint(a, b, 1)).toEqual(b);
    expect(arcPoint(a, b, 0.5)).toEqual({ x: 50, y: -TOSS.arcPx });
    expect(arcPoint(a, b, 0.5, 10)).toEqual({ x: 50, y: -10 });
    // Downward too, and on the level.
    expect(arcPoint({ x: 100, y: 0 }, { x: 0, y: 100 }, 0.5, 10)).toEqual({ x: 50, y: -10 });
    expect(arcPoint(a, low, 0.5, 10)).toEqual({ x: 50, y: 90 });
  });

  it('comes down into the catching hands (it was falling just before)', () => {
    const a: Point = { x: 0, y: 100 };
    const b: Point = { x: 100, y: 0 };
    expect(arcPoint(a, b, 0.95).y).toBeLessThan(b.y);
    expect(arcPoint(a, b, 0.05).y).toBeLessThan(a.y);
  });
});

describe('the flight on stage', () => {
  const tossed = scheduleEvent(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0, TOSSING);

  /** The held item as draw.ts places it (both stand still at their seats: the front frame). */
  function heldItem(director: Director, now: number, id: MemberId, withHoldFrames: boolean): Point {
    const shown = frameAt(director, now, DEFAULT_SEATS).members.find((m) => m.id === id)?.pose;
    if (shown?.held == null) throw new Error(`${id} holds nothing`);
    const { point, frame, flip, held } = shown;
    expect(frame).toBe(0);
    const pose: Pose = { point, frame: 0, flip, held };
    return heldLook(id, pose, held, withHoldFrames).item;
  }

  function flying(director: Director, now: number, withHoldFrames: boolean): Point | null {
    const frame = frameAt(director, now, DEFAULT_SEATS);
    const view = frame.flights[0];
    if (view === undefined) return null;
    const feetOf = (id: MemberId) => frame.members.find((m) => m.id === id)?.pose.point;
    return flyingItemPoint(view, feetOf, () => withHoldFrames);
  }

  it.each([true, false])(
    'never jumps: let go from her hands, lands in theirs (hold frames %s)',
    (withHoldFrames) => {
      expect(flying(tossed, LET_GO - 1, withHoldFrames)).toBeNull();
      expect(flying(tossed, LET_GO, withHoldFrames)).toEqual(
        heldItem(tossed, LET_GO - 1, 'kaname', withHoldFrames),
      );
      const landing = flying(tossed, CAUGHT - 1, withHoldFrames);
      const caught = heldItem(tossed, CAUGHT, 'minori', withHoldFrames);
      expect(landing?.x).toBeCloseTo(caught.x, 0);
      expect(landing?.y).toBeCloseTo(caught.y, 0);
      expect(flying(tossed, CAUGHT, withHoldFrames)).toBeNull();
    },
  );

  it('flies over both hands at the middle', () => {
    const middle = flying(tossed, (LET_GO + CAUGHT) / 2, true);
    const from = heldItem(tossed, LET_GO - 1, 'kaname', true);
    const to = heldItem(tossed, CAUGHT, 'minori', true);
    expect(middle?.y).toBeCloseTo(Math.min(from.y, to.y) - TOSS.arcPx, 6);
  });

  it('keeps the stage animating while in the air and drops the flight once caught', () => {
    expect(isAnimating(tossed, LET_GO + 1)).toBe(true);
    expect(prune(tossed, CAUGHT - 1).flights).toHaveLength(1);
    expect(prune(tossed, CAUGHT).flights).toEqual([]);
    expect(frameAt(tossed, CAUGHT, DEFAULT_SEATS).flights).toEqual([]);
  });

  it('stands still in the air while the stage clock is paused (hidden page)', () => {
    const paused = withPaused(RUNNING_CLOCK, true, LET_GO + 300);
    const a = frameAt(tossed, stageTime(paused, LET_GO + 300), DEFAULT_SEATS).flights;
    const b = frameAt(tossed, stageTime(paused, LET_GO + 60_000), DEFAULT_SEATS).flights;
    expect(b).toEqual(a);
    expect(a).toHaveLength(1);
  });

  it('waits for a member walking back from play before tossing (nobody teleports)', () => {
    const beside = { col: DEFAULT_SEATS.minori.col + 1, row: DEFAULT_SEATS.minori.row };
    const walk = walkSegment([beside, DEFAULT_SEATS.minori], 0);
    const back = sendHome(EMPTY_DIRECTOR, 'minori', walk);
    const director = scheduleEvent(back, event('issue-opened', '経理'), 0, TOSSING);
    expect(director.flights[0]?.start).toBe(walk.end + LET_GO);
  });
});
