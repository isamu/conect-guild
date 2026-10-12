import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel, MemberId } from '../guild.config';
import { RUNNING_CLOCK, stageTime, withPaused } from './clock';
import { CONFETTI_MS } from './confetti';
import {
  EMPTY_DIRECTOR,
  frameAt,
  hushed,
  isAnimating,
  prune,
  scheduleEvent,
  type Director,
} from './director';
import { linesOf, type LineScene } from './lineBook';
import { createLinePicker, type PickLine, type Utterance } from './lines';
import { sceneContext, sceneContextWhile, scenesShown } from './loop';
import { LINES, TOSS } from './metrics';
import {
  DEFAULT_SEATS,
  HANDOVER_MS,
  PICK_UP_MS,
  RECEIVE_MS,
  planScene,
  type SceneContext,
  type Track,
} from './scenes';

/** Says the first line of each moment, and notes who was asked for what. */
function firstLines(): { pick: PickLine; asked: [MemberId, LineScene][] } {
  const asked: [MemberId, LineScene][] = [];
  return {
    asked,
    pick: (actor, scene) => {
      asked.push([actor, scene]);
      return linesOf(actor, scene)[0] ?? null;
    },
  };
}

function context(pick: PickLine | undefined, tossRandom = () => 0.99): SceneContext {
  return { seats: DEFAULT_SEATS, random: () => 0.5, tossRandom, pickLine: pick };
}

function event(kind: GuildEventKind, department: DepartmentLabel | null): GuildEvent {
  return { id: `${kind}#1`, kind, number: 1, department };
}

function schedule(e: GuildEvent, ctx: SceneContext, at = 0, from = EMPTY_DIRECTOR): Director {
  return scheduleEvent(from, e, at, ctx);
}

function trackOf(tracks: readonly Track[], id: MemberId): Track {
  const track = tracks.find((t) => t.actor === id);
  if (track === undefined) throw new Error(`no track for ${id}`);
  return track;
}

/** The start of the first segment where `id` raises the item over the head. */
function raisedAt(tracks: readonly Track[], id: MemberId): number | undefined {
  return trackOf(tracks, id).segments.find((s) => s.held?.hold === 'raise')?.start;
}

/** Asserts that no two lines show at the same time. */
function expectInTurn(lines: readonly Utterance[]): void {
  const ordered = lines.toSorted((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i += 1) {
    expect(ordered[i]?.start).toBeGreaterThanOrEqual(ordered[i - 1]?.end ?? Infinity);
  }
}

const WALKED_TO: readonly (readonly [DepartmentLabel, MemberId])[] = [
  ['経理', 'minori'],
  ['広報', 'hibiki'],
  ['企画', 'hirame'],
  ['総務', 'sasae'],
];

describe('lines of a scroll walked over', () => {
  it.each(WALKED_TO)(
    '%s: かなめ speaks as she reaches the desk, the member as they hold it up',
    (label, id) => {
      const { pick } = firstLines();
      const director = schedule(event('issue-opened', label), context(pick), 500);
      const kaname = trackOf(director.tracks, 'kaname');
      const arrived = kaname.segments[2]?.start ?? Number.NaN;
      expect(director.lines).toEqual([
        {
          actor: 'kaname',
          line: linesOf('kaname', 'handOver')[0],
          start: arrived,
          end: arrived + LINES.giveMs,
        },
        {
          actor: id,
          line: linesOf(id, 'takeScroll')[0],
          start: arrived + HANDOVER_MS / 2 + RECEIVE_MS,
          end: arrived + HANDOVER_MS / 2 + RECEIVE_MS + LINES.takeMs,
        },
      ]);
      expect(director.lines[1]?.start).toBe(raisedAt(director.tracks, id));
      expectInTurn(director.lines);
    },
  );

  it('ends かなめ’s line by the time the scroll changes hands', () => {
    expect(LINES.giveMs).toBeLessThanOrEqual(HANDOVER_MS / 2);
  });
});

describe('lines of a chest brought to the counter', () => {
  it.each(WALKED_TO)(
    '%s: the member speaks at the counter, かなめ as she holds it up',
    (label, id) => {
      const { asked, pick } = firstLines();
      const director = schedule(event('pr-merged', label), context(pick));
      const member = trackOf(director.tracks, id);
      const arrived = member.segments[2]?.start ?? Number.NaN;
      expect(asked).toEqual([
        [id, 'deliverChest'],
        ['kaname', 'takeChest'],
      ]);
      expect(director.lines[0]?.start).toBe(arrived);
      expect(director.lines[1]?.start).toBe(raisedAt(director.tracks, 'kaname'));
      expectInTurn(director.lines);
    },
  );
});

describe('lines of a tossed scroll', () => {
  it.each([
    ['経理', 'minori'],
    ['広報', 'hibiki'],
  ] as const)('%s: かなめ speaks as she lets go, the member once her line is over', (label, id) => {
    const { pick } = firstLines();
    const director = schedule(
      event('issue-opened', label),
      context(pick, () => 0),
    );
    const letGo = PICK_UP_MS + TOSS.windUpMs;
    expect(director.flights).toHaveLength(1);
    expect(director.lines).toEqual([
      { actor: 'kaname', line: 'それっ！', start: letGo, end: letGo + LINES.tossMs },
      {
        actor: id,
        line: linesOf(id, 'takeScroll')[0],
        start: letGo + LINES.tossMs,
        end: letGo + LINES.tossMs + LINES.takeMs,
      },
    ]);
    // The catch comes first; the member speaks while holding the scroll up.
    expect(raisedAt(director.tracks, id)).toBeLessThanOrEqual(letGo + LINES.tossMs);
  });
});

describe('lines at the reception', () => {
  it.each([
    ['issue-opened', 'takeScroll'],
    ['pr-merged', 'takeChest'],
  ] as const)('%s with no department: かなめ alone as she holds it up', (kind, scene) => {
    const { pick } = firstLines();
    const director = schedule(event(kind, null), context(pick), 200);
    expect(director.lines).toEqual([
      {
        actor: 'kaname',
        line: linesOf('kaname', scene)[0],
        start: 200,
        end: 200 + LINES.takeMs,
      },
    ]);
    expect(raisedAt(director.tracks, 'kaname')).toBe(200);
  });
});

describe('lines of a clear', () => {
  it.each([...WALKED_TO, [null, 'kaname'] as const])(
    '%s: the member under the confetti, then the king a moment after',
    (label, id) => {
      const { pick } = firstLines();
      const director = schedule(event('issue-closed', label), context(pick), 1_000);
      const king = 1_000 + LINES.clearMs + LINES.kingGapMs;
      expect(director.lines).toEqual([
        { actor: id, line: linesOf(id, 'clear')[0], start: 1_000, end: 1_000 + LINES.clearMs },
        { actor: 'yukihiro', line: 'みごとじゃ！', start: king, end: king + LINES.kingMs },
      ]);
      expect(director.bursts[0]?.start).toBe(1_000);
    },
  );

  it('drops the king’s line on a second clear while he still says the first', () => {
    const { pick } = firstLines();
    const first = schedule(event('issue-closed', '経理'), context(pick), 0);
    const second = schedule(event('issue-closed', '広報'), context(pick), 1_000, first);
    expect(second.lines.filter((l) => l.actor === 'yukihiro')).toHaveLength(1);
    expect(second.lines.filter((l) => l.actor === 'hibiki')).toHaveLength(1);
  });
});

describe('lines and the other users of randomness', () => {
  it('plans the same scenes with and without lines', () => {
    for (const [kind, label] of [
      ['issue-opened', '経理'],
      ['issue-opened', '企画'],
      ['pr-merged', '総務'],
      ['issue-closed', '広報'],
    ] as const) {
      const withLines = planScene(event(kind, label), 0, context(createLinePicker(() => 0.3)));
      const without = planScene(event(kind, label), 0, context(undefined));
      expect(withLines).toEqual(without);
    }
  });

  it('says nothing when no picker is given (the message queue paces scenes without one)', () => {
    expect(schedule(event('issue-opened', '経理'), context(undefined)).lines).toEqual([]);
  });
});

describe('lines on the stage', () => {
  const { pick } = firstLines();
  const closed = schedule(event('issue-closed', '経理'), context(pick));
  const kingStart = LINES.clearMs + LINES.kingGapMs;

  it('shows who says what in the frame', () => {
    expect(frameAt(closed, 0, DEFAULT_SEATS).lines).toEqual({ minori: 'かんりょう！' });
    expect(frameAt(closed, LINES.clearMs, DEFAULT_SEATS).lines).toEqual({});
    expect(frameAt(closed, kingStart, DEFAULT_SEATS).lines).toEqual({ yukihiro: 'みごとじゃ！' });
  });

  it('keeps drawing until the last line is over, past the confetti', () => {
    const lastEnd = kingStart + LINES.kingMs;
    expect(lastEnd).toBeGreaterThan(CONFETTI_MS);
    expect(isAnimating(closed, lastEnd - 1)).toBe(true);
    expect(isAnimating(closed, lastEnd)).toBe(false);
  });

  it('prunes the lines that are over', () => {
    expect(prune(closed, LINES.clearMs).lines).toHaveLength(1);
    expect(prune(closed, kingStart + LINES.kingMs).lines).toEqual([]);
  });

  it('stops with the stage clock while the page is hidden, and goes on after', () => {
    const paused = withPaused(RUNNING_CLOCK, true, 500);
    const t = stageTime(paused, 500 + 60_000);
    expect(t).toBe(500);
    expect(frameAt(closed, t, DEFAULT_SEATS).lines).toEqual({ minori: 'かんりょう！' });
  });

  it('drops every line, said or still to come, when halted (hushed)', () => {
    const quiet = hushed(closed);
    expect(quiet.lines).toEqual([]);
    expect(quiet.bursts).toEqual(closed.bursts);
    expect(frameAt(quiet, kingStart, DEFAULT_SEATS).lines).toEqual({});
  });

  it('drops the lines with the scenes while the canvas is out of sight', () => {
    expect(scenesShown(closed, 0).lines).toEqual([]);
    expect(scenesShown(closed, 300).lines).toEqual(closed.lines);
  });
});

/** A random source that notes each number it gives. */
function noted(seed: number): { random: () => number; given: number[] } {
  const given: number[] = [];
  let a = seed;
  return {
    given,
    random: () => {
      a = (a * 9301 + 49297) % 233280;
      const value = a / 233280;
      given.push(value);
      return value;
    },
  };
}

describe('the render loop’s sources of randomness (sceneContext)', () => {
  const events = [
    event('issue-opened', '経理'),
    event('issue-closed', '広報'),
    event('issue-opened', '広報'),
    event('pr-merged', '企画'),
    event('issue-closed', null),
    event('issue-opened', '経理'),
  ];

  /** Plays the events one after another (each once the last is over) and keeps the director. */
  function playAll(ctx: SceneContext): Director {
    return events.reduce(
      (director, e, i) => scheduleEvent(director, e, i * 30_000, ctx),
      EMPTY_DIRECTOR,
    );
  }

  it('picks the lines from lineRandom only: the confetti and the tosses draw what they drew without lines', () => {
    const quiet = { confetti: noted(1), toss: noted(2) };
    const withoutLines = playAll({
      seats: DEFAULT_SEATS,
      random: quiet.confetti.random,
      tossRandom: quiet.toss.random,
    });
    const talking = { confetti: noted(1), toss: noted(2), lines: noted(3) };
    const withLines = playAll(
      sceneContext(
        { tossRandom: talking.toss.random, lineRandom: talking.lines.random },
        talking.confetti.random,
      ),
    );
    expect(talking.confetti.given).toEqual(quiet.confetti.given);
    expect(talking.toss.given).toEqual(quiet.toss.given);
    expect(talking.lines.given.length).toBeGreaterThan(0);
    expect(withLines.lines.length).toBeGreaterThan(0);
    expect({ ...withLines, lines: [] }).toEqual(withoutLines);
  });
});

describe('scenes played while halted (sceneContextWhile)', () => {
  it('says nothing and draws no line number while halted; the scene plays as without lines', () => {
    const lines = noted(5);
    const ctx = sceneContext({ lineRandom: lines.random }, () => 0.5);
    const halted = scheduleEvent(
      EMPTY_DIRECTOR,
      event('issue-closed', '経理'),
      0,
      sceneContextWhile(ctx, true),
    );
    expect(halted.lines).toEqual([]);
    expect(halted.bursts).toHaveLength(1);
    expect(lines.given).toEqual([]);
  });

  it('keeps the picker when live', () => {
    const ctx = sceneContext({}, () => 0.5);
    expect(sceneContextWhile(ctx, false)).toBe(ctx);
    const live = scheduleEvent(
      EMPTY_DIRECTOR,
      event('issue-closed', '経理'),
      0,
      sceneContextWhile(ctx, false),
    );
    expect(live.lines).toHaveLength(2);
  });
});
