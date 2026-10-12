import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import type { DepartmentLabel } from '../guild.config';
import { createAmbientSeeds } from './ambient';
import {
  EMPTY_DIRECTOR,
  frameAt,
  isAtSeat,
  scheduleEvent,
  sendHome,
  type AmbientContext,
  type Director,
} from './director';
import type { IdlePose } from './idle';
import { walkSegment } from './motion';
import { tileToPoint } from './path';
import { DEFAULT_SEATS, PICK_UP_MS } from './scenes';

function event(kind: 'issue-opened', department: DepartmentLabel | null): GuildEvent {
  return { id: `${kind}#1`, kind, number: 1, department };
}

function play(director: Director, e: GuildEvent, now: number): Director {
  return scheduleEvent(director, e, now, { seats: DEFAULT_SEATS, random: () => 0.5 });
}

describe('director: back from play (idle.ts)', () => {
  const seat = DEFAULT_SEATS.minori;
  const away = { col: seat.col + 2, row: seat.row };

  it('adds the walk back as a track, so scenes for the member wait for it', () => {
    const walk = walkSegment([away, { col: away.col - 1, row: away.row }, seat], 100);
    const back = sendHome(EMPTY_DIRECTOR, 'minori', walk);
    expect(back.tracks).toEqual([{ actor: 'minori', segments: [walk] }]);
    expect(back.busyUntil.minori).toBe(walk.end);
    const scene = play(back, event('issue-opened', '経理'), 100);
    const sceneStarts = scene.tracks
      .filter((t) => t.actor === 'minori')
      .map((t) => t.segments[0]?.start);
    expect(sceneStarts.slice(1).every((start) => (start ?? 0) >= walk.end)).toBe(true);
  });

  it('keeps a later busy time already set', () => {
    const busy = play(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0);
    const walk = walkSegment([away, seat], 0);
    expect(sendHome(busy, 'minori', walk).busyUntil.minori).toBe(busy.busyUntil.minori);
  });

  it('draws the idle pose out of scenes, and the scene over it', () => {
    const seeds = createAmbientSeeds(() => 0);
    const idle = {
      minori: {
        feet: tileToPoint(away),
        step: { from: away, to: away, progress: 0 },
        frame: 0 as const,
        flip: false,
        offset: { x: 0, y: 0 },
        mark: { kind: 'z' as const, rise: 0.5 },
      },
    };
    const ambient: AmbientContext = {
      moods: { minori: 'idle' },
      seeds,
      hasHoldFrames: () => false,
      idle,
    };
    const quiet = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS, ambient).members.find(
      (m) => m.id === 'minori',
    );
    expect(quiet?.pose.point).toEqual(tileToPoint(away));
    expect(quiet?.mark).toEqual({ kind: 'z', rise: 0.5 });
    const busy = play(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0);
    const inScene = frameAt(busy, 10, DEFAULT_SEATS, ambient).members.find(
      (m) => m.id === 'minori',
    );
    expect(inScene?.inScene).toBe(true);
    expect(inScene?.mark).toBeNull();
  });
});

describe('isAtSeat (Issue #29)', () => {
  const seat = DEFAULT_SEATS.minori;
  const away = { col: seat.col + 2, row: seat.row };
  const idleAt = (tile: { col: number; row: number }): IdlePose => ({
    feet: tileToPoint(tile),
    step: { from: tile, to: tile, progress: 0 },
    frame: 0,
    flip: false,
    offset: { x: 0, y: 3 },
    mark: null,
  });

  it('is at the seat with nothing going on, dozing or asleep there', () => {
    expect(isAtSeat(EMPTY_DIRECTOR, 0, { id: 'minori', seat, idle: undefined })).toBe(true);
    expect(isAtSeat(EMPTY_DIRECTOR, 0, { id: 'minori', seat, idle: idleAt(seat) })).toBe(true);
  });

  it('is away while out playing, unless a scene has taken the member over', () => {
    expect(isAtSeat(EMPTY_DIRECTOR, 0, { id: 'minori', seat, idle: idleAt(away) })).toBe(false);
    const scene = play(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0);
    expect(isAtSeat(scene, 10, { id: 'minori', seat, idle: idleAt(away) })).toBe(true);
  });

  it('stays at the seat while receiving an item there, and is away only while walking', () => {
    const scene = play(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0);
    const end = scene.busyUntil.minori ?? 0;
    expect(isAtSeat(scene, end - 1, { id: 'minori', seat, idle: undefined })).toBe(true);
    expect(
      isAtSeat(scene, PICK_UP_MS / 2, {
        id: 'kaname',
        seat: DEFAULT_SEATS.kaname,
        idle: undefined,
      }),
    ).toBe(true);
    expect(
      isAtSeat(scene, PICK_UP_MS + 1, {
        id: 'kaname',
        seat: DEFAULT_SEATS.kaname,
        idle: undefined,
      }),
    ).toBe(false);
  });

  it('stays at the seat under the confetti', () => {
    const scene = scheduleEvent(
      EMPTY_DIRECTOR,
      { id: 'issue-closed#1', kind: 'issue-closed', number: 1, department: '経理' },
      0,
      { seats: DEFAULT_SEATS, random: () => 0.5 },
    );
    expect(isAtSeat(scene, 100, { id: 'minori', seat, idle: undefined })).toBe(true);
  });

  it('is reported on every member of the frame', () => {
    const scene = play(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0);
    const members = frameAt(scene, PICK_UP_MS + 1, DEFAULT_SEATS).members;
    const walking = members.filter((m) => !m.atSeat).map((m) => m.id);
    expect(walking).toEqual(['kaname']);
  });
});
