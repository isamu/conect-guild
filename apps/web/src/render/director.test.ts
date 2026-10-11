import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel } from '../guild.config';
import { ambientPose, createAmbientSeeds } from './ambient';
import { CONFETTI_MS } from './confetti';
import {
  EMPTY_DIRECTOR,
  frameAt,
  inScene,
  isAnimating,
  poseAt,
  prune,
  scheduleEvent,
  trackEnd,
  type AmbientContext,
  type Director,
} from './director';
import { PLACES } from './map';
import { OVERHEAD_OFFSET } from './metrics';
import { standingPose } from './motion';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';

const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

function event(kind: GuildEventKind, department: DepartmentLabel | null, number = 1): GuildEvent {
  return { id: `${kind}#${String(number)}`, kind, number, department };
}

function play(director: Director, e: GuildEvent, now: number): Director {
  return scheduleEvent(director, e, now, context);
}

describe('director: idle stage', () => {
  it('stands everybody at their seat', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    expect(frame.members).toHaveLength(6);
    for (const { id, pose } of frame.members) expect(pose).toEqual(standingPose(DEFAULT_SEATS[id]));
    expect(frame.confetti).toEqual([]);
  });

  it('orders members back to front', () => {
    const ys = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members.map((m) => m.pose.point.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('is not animating', () => {
    expect(isAnimating(EMPTY_DIRECTOR, 0)).toBe(false);
  });
});

describe('director: scheduling', () => {
  it('starts a scene at the given time', () => {
    const director = play(EMPTY_DIRECTOR, event('pr-merged', '経理'), 1_000);
    expect(director.tracks[0]?.segments[0]?.start).toBe(1_000);
    expect(director.busyUntil.minori).toBe(
      trackEnd(director.tracks[0] ?? { actor: 'minori', segments: [] }),
    );
  });

  it('waits until a busy member is back before the next scene', () => {
    const once = play(EMPTY_DIRECTOR, event('pr-merged', '経理', 1), 0);
    const busy = once.busyUntil.minori ?? 0;
    const twice = play(once, event('issue-opened', '経理', 2), 100);
    expect(twice.tracks).toHaveLength(3);
    expect(twice.tracks[1]?.segments[0]?.start).toBe(busy);
    // かなめ's part waits with the member, so the handover still meets.
    expect(twice.tracks[2]?.actor).toBe('kaname');
    expect(twice.tracks[2]?.segments[0]?.start).toBe(busy);
  });

  it('lets different members act at the same time', () => {
    const one = play(EMPTY_DIRECTOR, event('pr-merged', '経理'), 0);
    const two = play(one, event('pr-merged', '広報'), 100);
    expect(two.tracks[1]?.segments[0]?.start).toBe(100);
  });

  it('starts confetti at once even while the member walks', () => {
    const walking = play(EMPTY_DIRECTOR, event('pr-merged', '経理'), 0);
    const cleared = play(walking, event('issue-closed', '経理'), 300);
    expect(cleared.bursts[0]?.start).toBe(300);
  });

  it('does not change the director it was given', () => {
    const before = EMPTY_DIRECTOR;
    play(before, event('pr-merged', '経理'), 0);
    expect(before).toEqual({ tracks: [], bursts: [], busyUntil: {} });
  });
});

describe('director: poses', () => {
  const director = play(EMPTY_DIRECTOR, event('pr-merged', '総務'), 0);
  const track = director.tracks[0];
  const away = track?.segments[1];

  it('moves the member while the track runs', () => {
    expect(poseAt(director, 'sasae', 0, DEFAULT_SEATS.sasae).point).toEqual(
      tileToPoint(DEFAULT_SEATS.sasae),
    );
    expect(poseAt(director, 'sasae', 300, DEFAULT_SEATS.sasae).frame).toBeGreaterThanOrEqual(2);
  });

  it('hides the member beyond the door', () => {
    const t = away?.start ?? 0;
    const pose = poseAt(director, 'sasae', t + 1, DEFAULT_SEATS.sasae);
    expect(pose.visible).toBe(false);
    expect(pose.point).toEqual(tileToPoint(PLACES.door));
  });

  it('puts the member back at the seat once the track is over', () => {
    const end = trackEnd(track ?? { actor: 'sasae', segments: [] });
    expect(poseAt(director, 'sasae', end, DEFAULT_SEATS.sasae)).toEqual(
      standingPose(DEFAULT_SEATS.sasae),
    );
  });

  it('leaves the others at their seats', () => {
    expect(poseAt(director, 'minori', 300, DEFAULT_SEATS.minori)).toEqual(
      standingPose(DEFAULT_SEATS.minori),
    );
  });
});

describe('director: confetti', () => {
  it('bursts over the member and follows them', () => {
    const director = play(EMPTY_DIRECTOR, event('issue-closed', '企画'), 0);
    const frame = frameAt(director, 100, DEFAULT_SEATS);
    expect(frame.confetti).toHaveLength(1);
    const seat = tileToPoint(DEFAULT_SEATS.hirame);
    expect(frame.confetti[0]?.origin).toEqual({ x: seat.x, y: seat.y - OVERHEAD_OFFSET });
  });

  it('bursts over the seat while the member is out of the door', () => {
    const out = play(EMPTY_DIRECTOR, event('pr-merged', '企画'), 0);
    const awayStart = out.tracks[0]?.segments[1]?.start ?? 0;
    const director = play(out, event('issue-closed', '企画'), awayStart + 1);
    const frame = frameAt(director, awayStart + 2, DEFAULT_SEATS);
    const seat = tileToPoint(DEFAULT_SEATS.hirame);
    expect(frame.confetti[0]?.origin).toEqual({ x: seat.x, y: seat.y - OVERHEAD_OFFSET });
  });

  it('disappears when the burst is over', () => {
    const director = play(EMPTY_DIRECTOR, event('issue-closed', '企画'), 0);
    expect(frameAt(director, CONFETTI_MS, DEFAULT_SEATS).confetti).toEqual([]);
  });
});

describe('director: animating and pruning', () => {
  const director = play(
    play(EMPTY_DIRECTOR, event('pr-merged', '経理'), 0),
    event('issue-closed', '広報'),
    0,
  );
  const end = director.busyUntil.minori ?? 0;

  it('animates until the last track and burst are over', () => {
    expect(isAnimating(director, 0)).toBe(true);
    expect(isAnimating(director, end - 1)).toBe(true);
    expect(isAnimating(director, end)).toBe(false);
  });

  it('animates while a queued scene has not started yet', () => {
    const queued = play(director, event('pr-merged', '経理', 2), 10);
    expect(isAnimating(queued, end + 1)).toBe(true);
  });

  it('drops only what is over', () => {
    const middle = prune(director, CONFETTI_MS);
    expect(middle.bursts).toEqual([]);
    expect(middle.tracks).toHaveLength(1);
    expect(middle.busyUntil).toEqual({ minori: end });
    expect(prune(director, end)).toEqual(EMPTY_DIRECTOR);
  });
});

describe('director: ambient moves', () => {
  const seeds = createAmbientSeeds(() => 0);
  // Every cycle starts at 0 with phase 0, so t = 0 is the start of a move.
  const ambient: AmbientContext = {
    moods: { minori: 'idle', sasae: 'desk-work', yukihiro: 'fidget', kaname: 'tidy-scroll' },
    seeds,
  };
  const member = (frame: ReturnType<typeof frameAt>, id: string) =>
    frame.members.find((m) => m.id === id);

  it('applies the move to members at their seats', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS, ambient);
    const move = ambientPose('fidget', seeds.yukihiro, 0);
    const seat = tileToPoint(DEFAULT_SEATS.yukihiro);
    expect(member(frame, 'yukihiro')?.pose.point).toEqual({
      x: seat.x + move.offset.x,
      y: seat.y + move.offset.y,
    });
    expect(member(frame, 'minori')?.pose).toMatchObject({ frame: 1, flip: false });
  });

  it('places かなめ’s scroll at hand and nobody else holds anything', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS, ambient);
    expect(member(frame, 'kaname')?.hand?.prop).toBe('scroll');
    expect(member(frame, 'kaname')?.pose.prop).toBeNull();
    expect(frame.members.filter((m) => m.hand !== null)).toHaveLength(1);
  });

  it('leaves members without a mood standing still', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS, ambient);
    expect(member(frame, 'hibiki')?.pose).toEqual(standingPose(DEFAULT_SEATS.hibiki));
    expect(member(frame, 'hibiki')?.hand).toBeNull();
  });

  it('matches the plain frame when no ambient is given', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    for (const m of frame.members) {
      expect(m.pose).toEqual(standingPose(DEFAULT_SEATS[m.id]));
      expect(m.hand).toBeNull();
    }
  });

  it('keeps the back-to-front order of the seats under the offsets', () => {
    const plain = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members.map((m) => m.id);
    for (const t of [0, 100, 300, 600, 900]) {
      const ids = frameAt(EMPTY_DIRECTOR, t, DEFAULT_SEATS, ambient).members.map((m) => m.id);
      expect(ids).toEqual(plain);
    }
  });
});

describe('director: no ambient move during scenes', () => {
  const seeds = createAmbientSeeds(() => 0);
  const ambient: AmbientContext = {
    moods: { minori: 'idle', sasae: 'desk-work', kaname: 'tidy-scroll' },
    seeds,
  };
  const member = (frame: ReturnType<typeof frameAt>, id: string) =>
    frame.members.find((m) => m.id === id);

  it('gives no ambient move to a member walking, away or holding something in a scene', () => {
    const director = play(EMPTY_DIRECTOR, event('pr-merged', '総務'), 0);
    const end = director.busyUntil.sasae ?? 0;
    for (const t of [1, 300, end - 1]) {
      const sasae = member(frameAt(director, t, DEFAULT_SEATS, ambient), 'sasae');
      expect(sasae?.pose).toEqual(poseAt(director, 'sasae', t, DEFAULT_SEATS.sasae));
      expect(sasae?.hand).toBeNull();
    }
    expect(inScene(director, 'sasae', end - 1)).toBe(true);
    expect(inScene(director, 'sasae', end)).toBe(false);
  });

  it('gives none to かなめ while she holds the scroll out in a handover', () => {
    const director = play(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0);
    const kaname = member(frameAt(director, 10, DEFAULT_SEATS, ambient), 'kaname');
    expect(kaname?.hand).toBeNull();
    expect(kaname?.pose.prop).toBe('scroll');
  });

  it('gives none while confetti is over the member, and again afterwards', () => {
    const director = play(EMPTY_DIRECTOR, event('issue-closed', '総務'), 0);
    expect(inScene(director, 'sasae', 0)).toBe(true);
    expect(member(frameAt(director, 0, DEFAULT_SEATS, ambient), 'sasae')?.pose).toEqual(
      standingPose(DEFAULT_SEATS.sasae),
    );
    expect(inScene(director, 'sasae', CONFETTI_MS)).toBe(false);
    const after = member(frameAt(director, CONFETTI_MS, DEFAULT_SEATS, ambient), 'sasae');
    expect(after?.pose).toEqual(
      expect.objectContaining({ frame: ambientPose('desk-work', seeds.sasae, CONFETTI_MS).frame }),
    );
  });

  it('applies the move before a scene queued for later starts', () => {
    const director = play(EMPTY_DIRECTOR, event('pr-merged', '経理'), 5_000);
    expect(inScene(director, 'minori', 0)).toBe(false);
    expect(member(frameAt(director, 0, DEFAULT_SEATS, ambient), 'minori')?.pose.frame).toBe(1);
  });
});
