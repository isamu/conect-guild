import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import type { DepartmentLabel, MemberId } from '../guild.config';
import { CONFETTI_MS } from './confetti';
import { EMPTY_DIRECTOR, frameAt, isAnimating, isAtSeat, scheduleEvent } from './director';
import { bannerAt, hopSegments, LEVEL_UP } from './levelUp';
import { castOf, DEFAULT_SEATS, planScene } from './scenes';
import { seatedPoint } from './seating';
import { standingPose } from './motion';

const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

function levelUp(department: DepartmentLabel | null): GuildEvent {
  return { id: `level-up:${department ?? 'kaname'}#5`, kind: 'level-up', number: 5, department };
}

/** Where a member at their seat is drawn when nothing lifts them. */
const restAt = (id: MemberId) => seatedPoint(standingPose(DEFAULT_SEATS[id]).point);

function drawnAt(id: MemberId, start: number, t: number) {
  const director = scheduleEvent(EMPTY_DIRECTOR, levelUp('経理'), start, context);
  const member = frameAt(director, t, DEFAULT_SEATS).members.find((m) => m.id === id);
  if (member === undefined) throw new Error(`no ${id}`);
  return { director, member };
}

describe('hopSegments', () => {
  it('hops twice at the seat, one after the other', () => {
    const seat = DEFAULT_SEATS.minori;
    const hops = hopSegments(seat, 1_000);
    expect(hops).toHaveLength(2);
    expect(hops.map((h) => [h.start, h.end])).toEqual([
      [1_000, 1_000 + LEVEL_UP.hopMs],
      [1_000 + LEVEL_UP.hopMs, 1_000 + 2 * LEVEL_UP.hopMs],
    ]);
    for (const hop of hops) {
      expect(hop.path).toEqual([seat]);
      expect(hop.held).toBeNull();
      expect(hop.hopPx).toBe(LEVEL_UP.hopPx);
    }
  });
});

describe('bannerAt', () => {
  it('shows only while the confetti flies', () => {
    expect(bannerAt(-1)).toBeNull();
    expect(bannerAt(0)).toEqual({ rise: 0, alpha: 1 });
    expect(bannerAt(CONFETTI_MS - 1)).not.toBeNull();
    expect(bannerAt(CONFETTI_MS)).toBeNull();
  });

  it('rises slowly and fades out at the end', () => {
    const middle = bannerAt(CONFETTI_MS / 2);
    expect(middle?.rise).toBeCloseTo(LEVEL_UP.bannerRisePx / 2);
    expect(middle?.alpha).toBe(1);
    const late = bannerAt(CONFETTI_MS - LEVEL_UP.bannerFadeMs / 2);
    expect(late?.alpha).toBeCloseTo(0.5);
  });
});

describe('the level-up scene', () => {
  it('takes over only the member who went up (かなめ for her own)', () => {
    expect(castOf(levelUp('広報'))).toEqual(['hibiki']);
    expect(castOf(levelUp(null))).toEqual(['kaname']);
  });

  it('hops at the seat with confetti and the words over it', () => {
    const scene = planScene(levelUp('総務'), 500, context);
    expect(scene.tracks).toEqual([
      { actor: 'sasae', segments: hopSegments(DEFAULT_SEATS.sasae, 500) },
    ]);
    expect(scene.bursts).toHaveLength(1);
    expect(scene.bursts[0]).toMatchObject({ actor: 'sasae', start: 500, levelUp: true });
    expect(scene.flights).toEqual([]);
  });

  it('does it at the reception for かなめ', () => {
    const scene = planScene(levelUp(null), 0, context);
    expect(scene.tracks[0]?.segments[0]?.path).toEqual([DEFAULT_SEATS.kaname]);
    expect(scene.bursts[0]?.actor).toBe('kaname');
  });

  it('a cleared quest has confetti but no words', () => {
    const clear: GuildEvent = {
      id: 'issue-closed#1',
      kind: 'issue-closed',
      number: 1,
      department: '経理',
    };
    const director = scheduleEvent(EMPTY_DIRECTOR, clear, 0, context);
    expect(frameAt(director, 100, DEFAULT_SEATS).confetti[0]?.banner).toBeNull();
  });
});

describe('the level-up on the stage', () => {
  it('lifts the drawing at the top of each hop and puts it back between them', () => {
    const top = restAt('minori').y - LEVEL_UP.hopPx;
    expect(drawnAt('minori', 0, LEVEL_UP.hopMs / 2).member.pose.point.y).toBeCloseTo(top);
    expect(drawnAt('minori', 0, LEVEL_UP.hopMs).member.pose.point.y).toBeCloseTo(
      restAt('minori').y,
    );
    expect(drawnAt('minori', 0, 1.5 * LEVEL_UP.hopMs).member.pose.point.y).toBeCloseTo(top);
    expect(drawnAt('minori', 0, 2 * LEVEL_UP.hopMs).member.pose.point).toEqual(restAt('minori'));
  });

  it('keeps the feet on the seat while hopping (depth, seat and bubbles stay)', () => {
    const { director, member } = drawnAt('minori', 0, LEVEL_UP.hopMs / 2);
    expect(member.depth).toBe(standingPose(DEFAULT_SEATS.minori).point.y);
    expect(member.atSeat).toBe(true);
    expect(member.inScene).toBe(true);
    const idle = undefined;
    expect(
      isAtSeat(director, LEVEL_UP.hopMs / 2, { id: 'minori', seat: DEFAULT_SEATS.minori, idle }),
    ).toBe(true);
  });

  it('shows "LEVEL UP" over the seat while the confetti flies, then stops animating', () => {
    const { director } = drawnAt('minori', 0, 0);
    const during = frameAt(director, 1_000, DEFAULT_SEATS).confetti;
    expect(during).toHaveLength(1);
    expect(during[0]?.banner).toEqual(bannerAt(1_000));
    expect(isAnimating(director, CONFETTI_MS - 1)).toBe(true);
    expect(frameAt(director, CONFETTI_MS, DEFAULT_SEATS).confetti).toEqual([]);
    expect(isAnimating(director, CONFETTI_MS)).toBe(false);
  });

  it('waits for the member to be free when they are in another scene', () => {
    const merge: GuildEvent = {
      id: 'pr-merged#7',
      kind: 'pr-merged',
      number: 7,
      department: '経理',
    };
    const busy = scheduleEvent(EMPTY_DIRECTOR, merge, 0, context);
    const back = busy.busyUntil.minori ?? 0;
    expect(back).toBeGreaterThan(0);
    const director = scheduleEvent(busy, levelUp('経理'), 0, context);
    expect(director.tracks.at(-1)?.segments[0]?.start).toBe(back);
    expect(director.bursts[0]?.start).toBe(back);
  });
});
