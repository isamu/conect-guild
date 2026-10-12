import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import type { DepartmentLabel } from '../guild.config';
import { createAmbientSeeds } from './ambient';
import {
  EMPTY_DIRECTOR,
  frameAt,
  scheduleEvent,
  sendHome,
  type AmbientContext,
  type Director,
} from './director';
import { walkSegment } from './motion';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';

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
