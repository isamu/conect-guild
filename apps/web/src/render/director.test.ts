import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel, MemberId } from '../guild.config';
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
import { AMBIENT, OVERHEAD_OFFSET, SEATING, TILE_SIZE } from './metrics';
import { MS_PER_TILE, standingPose, type Pose } from './motion';
import { tileToPoint } from './path';
import { DEFAULT_SEATS, PICK_UP_MS } from './scenes';
import { seatedPoint } from './seating';

const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

const MEMBER_IDS: readonly MemberId[] = [
  'kaname',
  'minori',
  'hibiki',
  'hirame',
  'sasae',
  'yukihiro',
];

function event(kind: GuildEventKind, department: DepartmentLabel | null, number = 1): GuildEvent {
  return { id: `${kind}#${String(number)}`, kind, number, department };
}

/** A pose as frameAt draws it: sunk into the seat when on one. */
const seated = (pose: Pose): Pose => ({ ...pose, point: seatedPoint(pose.point) });
const atSeat = (id: MemberId): Pose => seated(standingPose(DEFAULT_SEATS[id]));

function play(director: Director, e: GuildEvent, now: number): Director {
  return scheduleEvent(director, e, now, context);
}

describe('director: idle stage', () => {
  it('stands everybody at their seat', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    expect(frame.members).toHaveLength(6);
    for (const { id, pose } of frame.members) expect(pose).toEqual(atSeat(id));
    expect(frame.confetti).toEqual([]);
  });

  it('orders members back to front by the feet on their tile, before sinking', () => {
    const { members } = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    const depths = members.map((m) => m.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    for (const m of members) expect(m.depth).toBe(tileToPoint(DEFAULT_SEATS[m.id]).y);
  });

  it('sinks every member into their seat', () => {
    for (const m of frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members) {
      expect(m.pose.point.y).toBeGreaterThan(m.depth);
    }
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
    const busy = Math.max(once.busyUntil.minori ?? 0, once.busyUntil.kaname ?? 0);
    const twice = play(once, event('issue-opened', '経理', 2), 100);
    expect(twice.tracks).toHaveLength(4);
    // Both parts of the second scene wait together, so the handover still meets.
    expect(twice.tracks.slice(2).map((t) => [t.actor, t.segments[0]?.start])).toEqual([
      ['kaname', busy],
      ['minori', busy],
    ]);
  });

  it('makes a handover for another member wait until かなめ is back at the counter', () => {
    const one = play(EMPTY_DIRECTOR, event('issue-opened', '企画'), 0);
    const kanameBack = one.busyUntil.kaname ?? 0;
    expect(kanameBack).toBeLessThan(one.busyUntil.hirame ?? 0);
    const two = play(one, event('pr-merged', '広報'), 100);
    expect(two.tracks.slice(2).map((t) => t.segments[0]?.start)).toEqual([kanameBack, kanameBack]);
    // A reception without a department waits for her too.
    const three = play(two, event('issue-opened', null), 200);
    expect(three.tracks.at(-1)?.segments[0]?.start).toBe(two.busyUntil.kaname);
  });

  it('lets members act at the same time when their scenes share nobody', () => {
    const one = play(EMPTY_DIRECTOR, event('pr-merged', '経理'), 0);
    const two = play(one, event('issue-closed', '広報'), 100);
    expect(two.bursts[0]?.start).toBe(100);
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

describe('director: nobody teleports through a run of events', () => {
  // Close together, mixing departments and receptions, so かなめ is wanted again and again.
  const events: readonly (readonly [GuildEvent, number])[] = [
    [event('issue-opened', '企画', 1), 0],
    [event('pr-merged', '総務', 2), 100],
    [event('issue-opened', '経理', 3), 200],
    [event('pr-merged', null, 4), 300],
    [event('issue-opened', null, 5), 400],
    [event('issue-closed', '広報', 6), 500],
    [event('pr-merged', '広報', 7), 600],
    [event('issue-opened', '総務', 8), 700],
  ];
  const director = events.reduce((d, [e, at]) => play(d, e, at), EMPTY_DIRECTOR);
  const end = Math.max(...director.tracks.map(trackEnd));
  const STEP_MS = 10;
  // The farthest anyone may move in one step: walking pace, plus rounding.
  const maxStepPx = (TILE_SIZE * STEP_MS) / MS_PER_TILE + 1e-9;

  it('moves every member at most at walking pace between samples', () => {
    for (const id of MEMBER_IDS) {
      let previous = poseAt(director, id, 0, DEFAULT_SEATS[id]).point;
      for (let t = STEP_MS; t <= end + STEP_MS; t += STEP_MS) {
        const point = poseAt(director, id, t, DEFAULT_SEATS[id]).point;
        expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThanOrEqual(
          maxStepPx,
        );
        previous = point;
      }
    }
  });

  it('sits down and stands up smoothly too (the drawn point never jumps)', () => {
    const deepest = Math.max(...Object.values(SEATING));
    const maxDrawnStepPx = ((TILE_SIZE + deepest) * STEP_MS) / MS_PER_TILE + 1e-9;
    const drawnAt = (t: number) =>
      new Map(frameAt(director, t, DEFAULT_SEATS).members.map((m) => [m.id, m.pose.point]));
    let previous = drawnAt(0);
    for (let t = STEP_MS; t <= end + STEP_MS; t += STEP_MS) {
      const now = drawnAt(t);
      for (const id of MEMBER_IDS) {
        const a = previous.get(id);
        const b = now.get(id);
        if (a === undefined || b === undefined) throw new Error('member missing');
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(maxDrawnStepPx);
      }
      previous = now;
    }
  });

  it('never gives かなめ two scenes at once', () => {
    const parts = director.tracks.filter((t) => t.actor === 'kaname');
    expect(parts).toHaveLength(7);
    for (let i = 1; i < parts.length; i += 1) {
      const previous = parts[i - 1];
      const next = parts[i];
      if (previous === undefined || next === undefined) continue;
      expect(next.segments[0]?.start).toBeGreaterThanOrEqual(trackEnd(previous));
    }
  });

  it('leaves everyone at their seat at the end, かなめ behind the counter', () => {
    for (const id of MEMBER_IDS) {
      expect(poseAt(director, id, end, DEFAULT_SEATS[id])).toEqual(standingPose(DEFAULT_SEATS[id]));
    }
  });
});

describe('director: poses', () => {
  const director = play(EMPTY_DIRECTOR, event('pr-merged', '総務'), 0);
  const track = director.tracks[0];

  it('moves the member while the track runs', () => {
    expect(poseAt(director, 'sasae', 0, DEFAULT_SEATS.sasae).point).toEqual(
      tileToPoint(DEFAULT_SEATS.sasae),
    );
    const walking = PICK_UP_MS + 300;
    expect(poseAt(director, 'sasae', walking, DEFAULT_SEATS.sasae).frame).toBeGreaterThanOrEqual(2);
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
    const seat = seatedPoint(tileToPoint(DEFAULT_SEATS.hirame));
    expect(frame.confetti[0]?.origin).toEqual({ x: seat.x, y: seat.y - OVERHEAD_OFFSET });
  });

  it('bursts over the seat even while the member is at the counter', () => {
    const out = play(EMPTY_DIRECTOR, event('pr-merged', '企画'), 0);
    const atCounter = out.tracks[0]?.segments[2]?.start ?? 0;
    expect(poseAt(out, 'hirame', atCounter, DEFAULT_SEATS.hirame).point).toEqual(
      tileToPoint(PLACES.counterFront),
    );
    const director = play(out, event('issue-closed', '企画'), atCounter);
    const frame = frameAt(director, atCounter + 1, DEFAULT_SEATS);
    const seat = seatedPoint(tileToPoint(DEFAULT_SEATS.hirame));
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
  // The later of the two: みのり walking back, or かなめ holding the chest up.
  const end = Math.max(director.busyUntil.minori ?? 0, director.busyUntil.kaname ?? 0);

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
    expect(middle.tracks.map((t) => t.actor)).toEqual(['minori', 'kaname']);
    expect(middle.busyUntil).toEqual(director.busyUntil);
    expect(prune(director, end)).toEqual(EMPTY_DIRECTOR);
  });
});

describe('director: ambient moves', () => {
  const seeds = createAmbientSeeds(() => 0);
  // Every cycle starts at 0 with phase 0, so t = 0 is the start of a move.
  const ambient: AmbientContext = {
    moods: { minori: 'idle', sasae: 'desk-work', yukihiro: 'fidget', kaname: 'tidy-scroll' },
    seeds,
    hasHoldFrames: () => false,
  };
  const member = (frame: ReturnType<typeof frameAt>, id: string) =>
    frame.members.find((m) => m.id === id);

  it('applies the move to members at their seats', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS, ambient);
    const move = ambientPose('fidget', seeds.yukihiro, 0);
    const seat = seatedPoint(tileToPoint(DEFAULT_SEATS.yukihiro));
    expect(member(frame, 'yukihiro')?.pose.point).toEqual({
      x: seat.x + move.offset.x,
      y: seat.y + move.offset.y,
    });
    expect(member(frame, 'minori')?.pose).toMatchObject({ frame: 1, flip: false });
  });

  it('places かなめ’s scroll at hand and nobody else holds anything', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS, ambient);
    expect(member(frame, 'kaname')?.hand?.prop).toBe('scroll');
    expect(member(frame, 'kaname')?.pose.held).toBeNull();
    expect(frame.members.filter((m) => m.hand !== null)).toHaveLength(1);
  });

  it('leaves members without a mood standing still', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS, ambient);
    expect(member(frame, 'hibiki')?.pose).toEqual(atSeat('hibiki'));
    expect(member(frame, 'hibiki')?.hand).toBeNull();
  });

  it('matches the plain frame when no ambient is given', () => {
    const frame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
    for (const m of frame.members) {
      expect(m.pose).toEqual(atSeat(m.id));
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

describe('director: typing at the desk', () => {
  const seeds = createAmbientSeeds(() => 0);
  const member = (frame: ReturnType<typeof frameAt>, id: string) =>
    frame.members.find((m) => m.id === id);

  it('types with the arms-in-front frame only for members whose sheet has it', () => {
    const typing: AmbientContext = {
      moods: { sasae: 'desk-work', minori: 'desk-work' },
      seeds,
      hasHoldFrames: (id) => id === 'sasae',
    };
    // Two strokes after the turn for papers: the front frame, then the arms in front.
    const strokes = [AMBIENT.pageTurnMs, AMBIENT.pageTurnMs + AMBIENT.typingMs];
    const frames = (id: string) =>
      new Set(
        strokes.map(
          (t) => member(frameAt(EMPTY_DIRECTOR, t, DEFAULT_SEATS, typing), id)?.pose.frame,
        ),
      );
    expect(frames('sasae')).toEqual(new Set([0, 5]));
    expect(frames('minori')).toEqual(new Set([0]));
  });
});

describe('director: no ambient move during scenes', () => {
  const seeds = createAmbientSeeds(() => 0);
  // With the holding frames, so typing would show frame 5 if it leaked into a scene.
  const ambient: AmbientContext = {
    moods: { minori: 'idle', sasae: 'desk-work', kaname: 'tidy-scroll' },
    seeds,
    hasHoldFrames: () => true,
  };
  const member = (frame: ReturnType<typeof frameAt>, id: string) =>
    frame.members.find((m) => m.id === id);

  it('gives no ambient move to a member walking, away or holding something in a scene', () => {
    const director = play(EMPTY_DIRECTOR, event('pr-merged', '総務'), 0);
    const end = director.busyUntil.sasae ?? 0;
    for (const t of [1, 300, end - 1]) {
      const sasae = member(frameAt(director, t, DEFAULT_SEATS, ambient), 'sasae');
      expect(sasae?.pose).toEqual(seated(poseAt(director, 'sasae', t, DEFAULT_SEATS.sasae)));
      expect(sasae?.hand).toBeNull();
    }
    expect(inScene(director, 'sasae', end - 1)).toBe(true);
    expect(inScene(director, 'sasae', end)).toBe(false);
  });

  it('gives none to かなめ while she holds the scroll out in a handover', () => {
    const director = play(EMPTY_DIRECTOR, event('issue-opened', '経理'), 0);
    const kaname = member(frameAt(director, 10, DEFAULT_SEATS, ambient), 'kaname');
    expect(kaname?.hand).toBeNull();
    expect(kaname?.pose.held).toEqual({ prop: 'scroll', hold: 'carry' });
  });

  it('gives none while confetti is over the member, and again afterwards', () => {
    const director = play(EMPTY_DIRECTOR, event('issue-closed', '総務'), 0);
    expect(inScene(director, 'sasae', 0)).toBe(true);
    expect(member(frameAt(director, 0, DEFAULT_SEATS, ambient), 'sasae')?.pose).toEqual(
      atSeat('sasae'),
    );
    expect(inScene(director, 'sasae', CONFETTI_MS)).toBe(false);
    const after = member(frameAt(director, CONFETTI_MS, DEFAULT_SEATS, ambient), 'sasae');
    expect(after?.pose).toEqual(
      expect.objectContaining({
        frame: ambientPose('desk-work', seeds.sasae, CONFETTI_MS, true).frame,
      }),
    );
  });

  it('does not type with the arms-in-front frame under confetti', () => {
    const director = play(EMPTY_DIRECTOR, event('issue-closed', '総務'), 0);
    const typingAt: number[] = [];
    for (let t = 0; t < CONFETTI_MS; t += 20) {
      if (ambientPose('desk-work', seeds.sasae, t, true).frame === 5) typingAt.push(t);
    }
    expect(typingAt.length).toBeGreaterThan(0);
    for (const t of typingAt) {
      expect(member(frameAt(director, t, DEFAULT_SEATS, ambient), 'sasae')?.pose).toEqual(
        atSeat('sasae'),
      );
    }
  });

  it('applies the move before a scene queued for later starts', () => {
    const director = play(EMPTY_DIRECTOR, event('pr-merged', '経理'), 5_000);
    expect(inScene(director, 'minori', 0)).toBe(false);
    expect(member(frameAt(director, 0, DEFAULT_SEATS, ambient), 'minori')?.pose.frame).toBe(1);
  });
});
