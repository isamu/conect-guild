import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { MessageEntry } from '../domain/message';
import type { DepartmentLabel } from '../guild.config';
import {
  castFreeAt,
  EMPTY_DIRECTOR,
  poseAt,
  scheduleEvent,
  type Director,
} from '../render/director';
import { standingPose } from '../render/motion';
import { DEFAULT_SEATS } from '../render/scenes';
import { createMessageQueue, type GuildMessage } from './messageQueue';
import { globalScheduler } from './scheduler';

const HOLD_MS = 8_000;
const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

function event(
  kind: GuildEventKind,
  department: DepartmentLabel | null,
  number: number,
): GuildEvent {
  return { id: `${kind}#${String(number)}`, kind, number, department };
}

function entry(e: GuildEvent | null, text = e?.id ?? 'notice'): MessageEntry {
  return { text, event: e };
}

/** A queue on the fake timers, recording when each message reached the window. */
function setup() {
  const shown: { message: GuildMessage; at: number }[] = [];
  const queue = createMessageQueue({
    scheduler: globalScheduler,
    now: Date.now,
    holdMs: HOLD_MS,
    publish: (messages) => {
      const head = messages[0];
      if (head !== undefined && shown.at(-1)?.message.id !== head.id) {
        shown.push({ message: head, at: Date.now() });
      }
    },
  });
  return { queue, shown };
}

const T0 = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('messageQueue: hold', () => {
  it('moves on after 8 seconds when nobody has to wait', async () => {
    const { queue, shown } = setup();
    queue.push([entry(null, 'a'), entry(event('issue-closed', '経理', 1)), entry(null, 'c')]);
    await vi.advanceTimersByTimeAsync(HOLD_MS * 5);
    expect(shown.map((s) => s.at - T0)).toEqual([0, HOLD_MS, HOLD_MS * 2]);
    queue.dispose();
  });
});

describe('messageQueue: messages wait for their scene', () => {
  // Three scenes in a row that all need かなめ (each takes longer than the 8 s hold).
  const run = [
    event('issue-opened', '企画', 1),
    event('pr-merged', '広報', 2),
    event('issue-opened', null, 3),
  ];

  async function playRun() {
    const { queue, shown } = setup();
    queue.push(run.map((e) => entry(e)));
    await vi.advanceTimersByTimeAsync(120_000);
    queue.dispose();
    return shown;
  }

  it('shows each message when its scene can start, and no later', async () => {
    const shown = await playRun();
    expect(shown.map((s) => s.message.event)).toEqual(run);
    // The stage as the canvas builds it: one scene per message, started when it shows.
    let director: Director = EMPTY_DIRECTOR;
    for (const [i, { message, at }] of shown.entries()) {
      if (message.event === null) throw new Error('every message here has a scene');
      const free = castFreeAt(director, message.event, at);
      expect(free).toBe(at);
      if (i > 0) {
        const previous = shown[i - 1];
        if (previous === undefined) throw new Error('unreachable');
        // Not earlier than the hold, and right when かなめ is back (the scenes are longer).
        expect(at - previous.at).toBeGreaterThan(HOLD_MS);
        expect(at).toBe(director.busyUntil.kaname);
      }
      director = scheduleEvent(director, message.event, at, context);
    }
  });

  it('starts every scene with かなめ standing at the counter (nobody teleports)', async () => {
    const shown = await playRun();
    let director: Director = EMPTY_DIRECTOR;
    for (const { message, at } of shown) {
      if (message.event === null) throw new Error('every message here has a scene');
      expect(poseAt(director, 'kaname', at, DEFAULT_SEATS.kaname)).toEqual(
        standingPose(DEFAULT_SEATS.kaname),
      );
      director = scheduleEvent(director, message.event, at, context);
      expect(director.tracks.at(-1)?.segments[0]?.start).toBe(at);
    }
  });

  it('waits only for the cast: a clear right after a handover comes after 8 seconds', async () => {
    const { queue, shown } = setup();
    queue.push([entry(event('issue-opened', '企画', 1)), entry(event('issue-closed', '経理', 2))]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shown.map((s) => s.at - T0)).toEqual([0, HOLD_MS]);
    queue.dispose();
  });
});

describe('messageQueue: hidden page', () => {
  it('does not move on while the page is hidden, and keeps the rest of the hold', async () => {
    const { queue, shown } = setup();
    queue.push([entry(null, 'a'), entry(null, 'b')]);
    await vi.advanceTimersByTimeAsync(3_000);
    queue.setHidden(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shown).toHaveLength(1);
    queue.setHidden(false);
    await vi.advanceTimersByTimeAsync(HOLD_MS - 3_000 - 1);
    expect(shown).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(shown.map((s) => s.message.text)).toEqual(['a', 'b']);
    queue.dispose();
  });

  it('counts a scene as stopped while hidden, like the canvas does', async () => {
    const { queue, shown } = setup();
    const opened = event('issue-opened', '企画', 1);
    queue.push([entry(opened), entry(event('pr-merged', '広報', 2))]);
    const sceneMs = scheduleEvent(EMPTY_DIRECTOR, opened, 0, context).busyUntil.kaname ?? 0;
    await vi.advanceTimersByTimeAsync(2_000);
    queue.setHidden(true);
    await vi.advanceTimersByTimeAsync(100_000);
    queue.setHidden(false);
    await vi.advanceTimersByTimeAsync(sceneMs - 2_000 - 1);
    expect(shown).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(shown).toHaveLength(2);
    queue.dispose();
  });

  it('shows a message pushed while hidden at once when the window was empty', async () => {
    const { queue, shown } = setup();
    queue.setHidden(true);
    queue.push([entry(null, 'a'), entry(null, 'b')]);
    expect(shown.map((s) => s.message.text)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shown).toHaveLength(1);
    queue.setHidden(false);
    await vi.advanceTimersByTimeAsync(HOLD_MS);
    expect(shown).toHaveLength(2);
    queue.dispose();
  });
});
