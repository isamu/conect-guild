import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import type { DepartmentLabel, MemberId } from '../guild.config';
import { EMPTY_DIRECTOR, frameAt, inScene, poseAt, scheduleEvent, trackEnd } from './director';
import { plannedOuting, type Outing } from './idle';
import { createIdleCrew } from './idleCrew';
import { IDLE } from './metrics';
import { tileToPoint } from './path';
import { castOf, DEFAULT_SEATS } from './scenes';

const MIN = 60_000;
const CYCLE = 7_000_000;
const CYCLE_START = CYCLE * IDLE.playCycleMs;
/** The random source draws the same salt for everyone; with it ひびき goes to the pet. */
const SALT_RANDOM = 0.25;
const SALT = Math.floor(SALT_RANDOM * 2 ** 31);

function createIssueEvent(department: DepartmentLabel | null): GuildEvent {
  return { id: 'issue-opened#1', kind: 'issue-opened', number: 1, department };
}

function outingOf(id: MemberId): Outing {
  const outing = plannedOuting(id, SALT, CYCLE);
  if (outing === null) throw new Error(`no outing for ${id} with this salt`);
  return outing;
}

function setup(wall: number) {
  const clock = { wall };
  const active: { ids: readonly MemberId[]; at: number }[] = [];
  const crew = createIdleCrew({
    random: () => SALT_RANDOM,
    wallNow: () => clock.wall,
    onActive: (ids, at) => active.push({ ids, at }),
  });
  return { clock, active, crew };
}

/** A member out at their spot in the middle of the stay. */
function playing(id: MemberId) {
  const outing = outingOf(id);
  const wall = (outing.out.end + outing.back.start) / 2;
  const env = setup(wall);
  const since = { [id]: CYCLE_START - 40 * MIN };
  const director = env.crew.setSince(EMPTY_DIRECTOR, since, 1_000);
  return { ...env, outing, director, since };
}

describe('createIdleCrew', () => {
  it('poses the member out at the spot while idle', () => {
    const { crew, director, outing } = playing('minori');
    expect(director).toEqual(EMPTY_DIRECTOR);
    expect(crew.frame(director, 1_000).minori?.feet).toEqual(tileToPoint(outing.spot.tile));
  });

  it('walks a member back from the spot when work comes (no teleport)', () => {
    const { crew, director, outing } = playing('minori');
    const back = crew.setSince(director, {}, 1_000);
    const track = back.tracks.find((t) => t.actor === 'minori');
    expect(track?.segments[0]?.path[0]).toEqual(outing.spot.tile);
    expect(track?.segments[0]?.path.at(-1)).toEqual(DEFAULT_SEATS.minori);
    expect(track?.segments[0]?.start).toBe(1_000);
    expect(poseAt(back, 'minori', 1_000, DEFAULT_SEATS.minori).point).toEqual(
      tileToPoint(outing.spot.tile),
    );
    expect(back.busyUntil.minori).toBe(track && trackEnd(track));
    expect(crew.frame(back, 1_000).minori).toBeUndefined();
  });

  it('leaves members at their seat where they are', () => {
    const { crew } = setup(CYCLE_START + 1);
    const director = crew.setSince(EMPTY_DIRECTOR, { sasae: CYCLE_START - 15 * MIN }, 0);
    expect(crew.setSince(director, {}, 0)).toEqual(EMPTY_DIRECTOR);
  });

  it('leaves members whose time did not change where they are', () => {
    const { crew, director, since } = playing('minori');
    expect(crew.setSince(director, { ...since, hibiki: 5 }, 1_000)).toEqual(EMPTY_DIRECTOR);
  });
});

describe('createIdleCrew and scenes', () => {
  it('brings the cast of a scene back first; the scene waits for them', () => {
    const { crew, director, outing } = playing('hibiki');
    const event = createIssueEvent('広報');
    const back = crew.callCast(director, castOf(event), 1_000);
    const walkEnd = back.busyUntil.hibiki ?? 0;
    expect(walkEnd).toBeGreaterThan(1_000);
    const scheduled = scheduleEvent(back, event, 1_000, { seats: DEFAULT_SEATS, random: () => 0 });
    const sceneStarts = scheduled.tracks
      .filter((t) => t.actor === 'hibiki')
      .map((t) => t.segments[0]?.start);
    expect(sceneStarts).toContain(walkEnd);
    expect(poseAt(scheduled, 'hibiki', walkEnd - 1, DEFAULT_SEATS.hibiki).point).not.toEqual(
      tileToPoint(outing.spot.tile),
    );
    // Back at the seat the idle spell starts over: no dozing right after the scene.
    expect(crew.frame(scheduled, walkEnd + 60_000).hibiki).toBeUndefined();
  });

  it('reports the members in a scene and starts their idle spell over', () => {
    const { crew, clock, active } = setup(CYCLE_START);
    const since = { kaname: CYCLE_START - 20 * MIN };
    let director = crew.setSince(EMPTY_DIRECTOR, since, 0);
    expect(crew.frame(director, 0).kaname).toBeDefined();
    director = scheduleEvent(director, createIssueEvent(null), 0, {
      seats: DEFAULT_SEATS,
      random: () => 0,
    });
    expect(inScene(director, 'kaname', 10)).toBe(true);
    crew.frame(director, 10);
    expect(active).toEqual([{ ids: ['kaname'], at: CYCLE_START }]);
    clock.wall = CYCLE_START + 5 * MIN;
    expect(crew.frame(director, 1e9).kaname).toBeUndefined();
    clock.wall = CYCLE_START + 10 * MIN;
    expect(crew.frame(director, 1e9).kaname).toBeDefined();
  });

  it('shows the idle poses in the stage frame, scenes first', () => {
    const { crew, director, outing } = playing('minori');
    const ambient = { moods: {}, seeds: SEEDS_ANY, hasHoldFrames: () => false };
    const frame = frameAt(director, 1_000, DEFAULT_SEATS, {
      ...ambient,
      idle: crew.frame(director, 1_000),
    });
    const minori = frame.members.find((m) => m.id === 'minori');
    expect(minori?.depth).toBe(tileToPoint(outing.spot.tile).y);
    expect(minori?.inScene).toBe(false);
  });
});

const SEEDS_ANY = {
  kaname: { phaseMs: 0, intervalMs: 5_000 },
  minori: { phaseMs: 0, intervalMs: 5_000 },
  hibiki: { phaseMs: 0, intervalMs: 5_000 },
  hirame: { phaseMs: 0, intervalMs: 5_000 },
  sasae: { phaseMs: 0, intervalMs: 5_000 },
  yukihiro: { phaseMs: 0, intervalMs: 5_000 },
};
