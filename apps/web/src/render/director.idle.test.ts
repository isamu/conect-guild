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

  it('walks the member from where they are to the seat, waiting for their running track', () => {
    const busy = play(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0);
    const until = busy.busyUntil.minori ?? 0;
    const back = sendHome(busy, { id: 'minori', from: away, seat }, 100);
    const segment = back.tracks.at(-1)?.segments[0];
    expect(segment?.start).toBe(until);
    expect(segment?.path[0]).toEqual(away);
    expect(segment?.path.at(-1)).toEqual(seat);
    expect(back.busyUntil.minori).toBe(segment?.end);
  });

  it('changes nothing when there is no way or nowhere to walk', () => {
    expect(sendHome(EMPTY_DIRECTOR, { id: 'minori', from: seat, seat }, 0)).toBe(EMPTY_DIRECTOR);
    const outside = { col: -5, row: 0 };
    expect(sendHome(EMPTY_DIRECTOR, { id: 'minori', from: outside, seat }, 0)).toBe(EMPTY_DIRECTOR);
  });

  it('draws the idle pose out of scenes, and the scene over it', () => {
    const seeds = createAmbientSeeds(() => 0);
    const idle = {
      minori: {
        feet: tileToPoint(away),
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
