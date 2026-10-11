import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel } from '../guild.config';
import { PLACES } from './map';
import type { Segment } from './motion';
import {
  actorOf,
  AWAY_MS,
  castOf,
  DEFAULT_SEATS,
  FETCH_MS,
  HANDOVER_MS,
  planScene,
  RECEPTION_MS,
  SHOW_MS,
  type Scene,
  type Track,
} from './scenes';

const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

function event(kind: GuildEventKind, department: DepartmentLabel | null, number = 1): GuildEvent {
  return { id: `${kind}#${String(number)}`, kind, number, department };
}

function trackOf(scene: Scene, actor: string): Track {
  const track = scene.tracks.find((t) => t.actor === actor);
  if (track === undefined) throw new Error(`no track for ${actor}`);
  return track;
}

const firstTile = (s: Segment) => s.path[0];
const lastTile = (s: Segment) => s.path.at(-1);
const lengthOf = (s: Segment) => s.end - s.start;

/** The segments of a track, failing the test when there are fewer than `count`. */
function segmentsOf(track: Track, count: number): Segment[] {
  expect(track.segments).toHaveLength(count);
  return [...track.segments];
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item ${String(index)}`);
  return item;
}

function expectBackToBack(track: Track, start: number): void {
  let cursor = start;
  for (const segment of track.segments) {
    expect(segment.start).toBe(cursor);
    expect(segment.end).toBeGreaterThanOrEqual(segment.start);
    cursor = segment.end;
  }
}

describe('actorOf / castOf', () => {
  it('maps departments to their members and no department to かなめ', () => {
    expect(actorOf({ department: '経理' })).toBe('minori');
    expect(actorOf({ department: '総務' })).toBe('sasae');
    expect(actorOf({ department: null })).toBe('kaname');
  });

  it('casts the member and かなめ for a handed-over quest', () => {
    expect(castOf(event('issue-opened', '広報'))).toEqual(['hibiki', 'kaname']);
    expect(castOf(event('issue-opened', null))).toEqual(['kaname']);
    expect(castOf(event('pr-merged', '企画'))).toEqual(['hirame']);
    expect(castOf(event('pr-merged', null))).toEqual(['kaname']);
  });

  it('casts nobody for confetti (nobody has to move)', () => {
    expect(castOf(event('issue-closed', '経理'))).toEqual([]);
  });
});

describe('planScene: issue-opened', () => {
  const scene = planScene(event('issue-opened', '経理'), 1_000, context);
  const member = trackOf(scene, 'minori');
  const kaname = trackOf(scene, 'kaname');
  const segments = segmentsOf(member, 6);
  const toCounter = at(segments, 0);
  const waiting = at(segments, 1);
  const receiving = at(segments, 2);
  const toDoor = at(segments, 3);
  const away = at(segments, 4);
  const home = at(segments, 5);

  it('runs the member segments back to back from the start', () => {
    expectBackToBack(member, 1_000);
  });

  it('walks the member from the seat to the counter front', () => {
    expect([firstTile(toCounter), lastTile(toCounter)]).toEqual([
      DEFAULT_SEATS.minori,
      PLACES.counterFront,
    ]);
  });

  it('hands the scroll over halfway through the stop at the counter', () => {
    expect([waiting.prop, receiving.prop]).toEqual([null, 'scroll']);
    expect(lengthOf(waiting) + lengthOf(receiving)).toBe(HANDOVER_MS);
  });

  it('carries the scroll out of the door, stays away, then walks home empty-handed', () => {
    expect([lastTile(toDoor), toDoor.prop]).toEqual([PLACES.door, 'scroll']);
    expect([away.visible, lengthOf(away)]).toEqual([false, AWAY_MS]);
    expect([firstTile(home), lastTile(home), home.prop]).toEqual([
      PLACES.door,
      DEFAULT_SEATS.minori,
      null,
    ]);
  });

  it('has かなめ hold the scroll at her seat until she hands it over', () => {
    const hold = at(segmentsOf(kaname, 1), 0);
    expect([hold.start, hold.end, hold.prop]).toEqual([1_000, receiving.start, 'scroll']);
    expect(firstTile(hold)).toEqual(DEFAULT_SEATS.kaname);
  });

  it('has no confetti', () => {
    expect(scene.bursts).toEqual([]);
  });

  it('only has かなめ take the scroll at the reception when there is no department', () => {
    const reception = planScene(event('issue-opened', null), 500, context);
    expect(reception.tracks).toHaveLength(1);
    expect(trackOf(reception, 'kaname').segments).toEqual([
      {
        start: 500,
        end: 500 + RECEPTION_MS,
        path: [DEFAULT_SEATS.kaname],
        prop: 'scroll',
        visible: true,
      },
    ]);
  });
});

describe('planScene: pr-merged', () => {
  const scene = planScene(event('pr-merged', '総務'), 0, context);
  const member = trackOf(scene, 'sasae');
  const segments = segmentsOf(member, 4);
  const out = at(segments, 0);
  const fetching = at(segments, 1);
  const back = at(segments, 2);
  const show = at(segments, 3);

  it('moves only the member, back to back', () => {
    expect(scene.tracks).toHaveLength(1);
    expectBackToBack(member, 0);
  });

  it('sends the member out of the door empty-handed', () => {
    expect([lastTile(out), out.prop]).toEqual([PLACES.door, null]);
    expect([fetching.visible, lengthOf(fetching)]).toEqual([false, FETCH_MS]);
  });

  it('brings the member back to the seat with a chest and shows it', () => {
    expect([firstTile(back), lastTile(back), back.prop]).toEqual([
      PLACES.door,
      DEFAULT_SEATS.sasae,
      'chest',
    ]);
    expect([show.prop, lengthOf(show)]).toEqual(['chest', SHOW_MS]);
  });

  it('only has かなめ take the chest when there is no department', () => {
    const reception = planScene(event('pr-merged', null), 0, context);
    expect(reception.tracks).toHaveLength(1);
    expect(at(trackOf(reception, 'kaname').segments, 0).prop).toBe('chest');
  });
});

describe('planScene: issue-closed', () => {
  it('bursts confetti over the member without moving anyone', () => {
    const scene = planScene(event('issue-closed', '広報'), 42, context);
    expect(scene.tracks).toEqual([]);
    expect(scene.bursts).toHaveLength(1);
    expect(scene.bursts[0]).toMatchObject({ actor: 'hibiki', start: 42 });
    expect(scene.bursts[0]?.particles.length).toBeGreaterThan(0);
  });

  it('bursts over かなめ when there is no department', () => {
    const scene = planScene(event('issue-closed', null), 0, context);
    expect(scene.bursts[0]?.actor).toBe('kaname');
  });

  it('uses the injected random numbers', () => {
    const a = planScene(event('issue-closed', null), 0, { ...context, random: () => 0.1 });
    const b = planScene(event('issue-closed', null), 0, { ...context, random: () => 0.9 });
    expect(a.bursts[0]?.particles).not.toEqual(b.bursts[0]?.particles);
  });
});

describe('planScene: unreachable places', () => {
  it('keeps the member where they are instead of jumping', () => {
    // A seat boxed in by walls: no way to the counter or the door.
    const seats = { ...DEFAULT_SEATS, minori: { col: 0, row: 5 } };
    const scene = planScene(event('pr-merged', '経理'), 0, { ...context, seats });
    for (const segment of trackOf(scene, 'minori').segments) {
      expect(segment.path).toEqual([{ col: 0, row: 5 }]);
    }
  });
});
