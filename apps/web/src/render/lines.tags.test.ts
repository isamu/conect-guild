import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel, MemberId } from '../guild.config';
import { EMPTY_DIRECTOR, frameAt, scheduleEvent, type Director, type MemberPose } from './director';
import { levelTags, type LevelTag } from './levelTags';
import { linesOf } from './lineBook';
import type { PickLine } from './lines';
import { BUBBLE_RISE, DETAIL_SCALE, OVERHEAD_OFFSET } from './metrics';
import { overheadLift, overheadSide, type Side } from './overhead';
import type { Point } from './path';
import { LOGICAL_WIDTH, TALLEST_WINDOW_EXTENTS } from './map';
import { DEFAULT_SEATS, type SceneContext } from './scenes';
import { NO_HOLDS, speechesAt, summonsEnd, withSummons } from './summons';

/**
 * The members' line bubbles never meet the 「Lv N」 tags on the desks (levelTags.ts, Issue #19):
 * every moment of every scene, for every department, walked or tossed.
 */

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * A line bubble over feet drawn at `feet` (draw.ts drawBubble): the box, 9 detail px high and as
 * wide as the text (a full-width character of the 7 px font is 7 px, plus 6 px), 3 detail px right
 * of the feet (or left of them on the left side), and its tail, 2 by 2 detail px under the box's
 * end next to the head.
 */
function bubbleBoxes(feet: Point, lift: number, line: string, side: Side): Box[] {
  const width = (Array.from(line).length * 7 + 6) * DETAIL_SCALE;
  const left = side === 'right' ? feet.x + 3 * DETAIL_SCALE : feet.x - 3 * DETAIL_SCALE - width;
  const top = feet.y - OVERHEAD_OFFSET - BUBBLE_RISE * DETAIL_SCALE - lift;
  const tail = side === 'right' ? left + DETAIL_SCALE : left + width - 3 * DETAIL_SCALE;
  return [
    { left, right: left + width, top, bottom: top + 9 * DETAIL_SCALE },
    {
      left: tail,
      right: tail + 2 * DETAIL_SCALE,
      top: top + 9 * DETAIL_SCALE,
      bottom: top + 11 * DETAIL_SCALE,
    },
  ];
}

/** A tag's text (bold 10 px, 「Lv 99」 about 28 px wide) with its 1 px outline. */
function tagBox(tag: LevelTag): Box {
  return { left: tag.x - 16, right: tag.x + 16, top: tag.y - 7, bottom: tag.y + 7 };
}

function meet(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

const LEVEL_TAGS = levelTags(
  { kaname: 99, minori: 99, hibiki: 99, hirame: 99, sasae: 99 },
  DEFAULT_SEATS,
);
const TAGS = LEVEL_TAGS.map(tagBox);

/** The longest line of each moment, the worst case for the width. */
const pick: PickLine = (actor, scene) =>
  linesOf(actor, scene).toSorted((a, b) => Array.from(b).length - Array.from(a).length)[0] ?? null;

function event(kind: GuildEventKind, department: DepartmentLabel | null): GuildEvent {
  return { id: `${kind}#1`, kind, number: 1, department };
}

const CASES = (['issue-opened', 'pr-merged', 'issue-closed'] as const).flatMap((kind) =>
  ([null, '経理', '広報', '企画', '総務'] as const).flatMap((label) =>
    [0, 0.99].map((toss) => ({ kind, label, toss })),
  ),
);

const WINDOWS = Object.values(TALLEST_WINDOW_EXTENTS);

/** Asserts that words over `member` meet no tag nor HTML window and stay on the canvas. */
function expectClear(member: MemberPose, words: string, t: number): void {
  const lift = overheadLift(member.pose, words, LEVEL_TAGS);
  const boxes = bubbleBoxes(member.pose.point, lift, words, overheadSide(member.pose, words));
  const met = TAGS.filter((tag) => boxes.some((box) => meet(box, tag)));
  expect({ who: member.id, t, met }).toEqual({ who: member.id, t, met: [] });
  const under = WINDOWS.filter((area) => boxes.some((box) => meet(box, area)));
  expect({ who: member.id, t, words, under }).toEqual({ who: member.id, t, words, under: [] });
  const [box] = boxes;
  expect(box?.top).toBeGreaterThanOrEqual(0);
  expect(box?.left).toBeGreaterThanOrEqual(0);
  expect(box?.right).toBeLessThanOrEqual(LOGICAL_WIDTH);
}

function contextFor(toss: number): SceneContext {
  return { seats: DEFAULT_SEATS, random: () => 0.5, tossRandom: () => toss, pickLine: pick };
}

describe('line bubbles and level tags', () => {
  it('has tags to check', () => {
    expect(TAGS).toHaveLength(5);
  });

  it.each(CASES)('$kind for $label (toss draw $toss): no bubble meets a tag', (c) => {
    const director = scheduleEvent(EMPTY_DIRECTOR, event(c.kind, c.label), 0, contextFor(c.toss));
    const end = Math.max(...director.lines.map((said) => said.end));
    let checked = 0;
    for (let t = 0; t < end; t += 50) {
      const frame = frameAt(director, t, DEFAULT_SEATS);
      for (const member of frame.members) {
        const line = frame.lines[member.id];
        if (line === undefined) continue;
        expectClear(member, line, t);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

const EVERYONE: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'];

describe('the words of the king’s call and level tags', () => {
  const scenes = [
    { name: 'no scene', director: EMPTY_DIRECTOR },
    ...CASES.map((c) => ({
      name: `${c.kind} for ${String(c.label)} (toss draw ${String(c.toss)})`,
      director: scheduleEvent(EMPTY_DIRECTOR, event(c.kind, c.label), 0, contextFor(c.toss)),
    })),
  ];

  /** Checks the words over everyone at `t` of a call to everyone starting at `start`; how many. */
  function checkCall(director: Director, start: number, t: number): number {
    const list = [{ start, members: EVERYONE }];
    const frame = withSummons(frameAt(director, t, DEFAULT_SEATS), list, t, {
      seats: DEFAULT_SEATS,
      holds: NO_HOLDS,
    });
    const speeches = speechesAt(list, t);
    let checked = 0;
    for (const member of frame.members) {
      const words = speeches[member.id];
      if (words === undefined) continue;
      expectClear(member, words, t);
      checked += 1;
    }
    return checked;
  }

  it.each(scenes)('$name: calling everyone at any moment, no word meets a tag', ({ director }) => {
    let checked = 0;
    for (const start of [0, 2_000, 4_000, 6_000, 8_000]) {
      const end = summonsEnd({ start, members: EVERYONE });
      for (let t = start; t < end; t += 100) checked += checkCall(director, start, t);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

const WAITS = ['awaitPresident', 'awaitKaname', 'awaitPermission'] as const;

describe('lines on starting to wait and level tags (remarks.ts)', () => {
  const seated = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members;

  it.each(EVERYONE)('%s at the seat: the longest line of each wait meets no tag', (id) => {
    const member = seated.find((m) => m.id === id);
    if (member === undefined) throw new Error(`no ${id}`);
    let checked = 0;
    for (const scene of WAITS) {
      const line = pick(id, scene);
      if (line === null) continue;
      expectClear(member, line, 0);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
