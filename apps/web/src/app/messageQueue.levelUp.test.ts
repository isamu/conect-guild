import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildEvent } from '../domain/events';
import type { MemberId } from '../guild.config';
import { cueForMessage } from '../audio/judge';
import { EMPTY_DIRECTOR, trackEnd, type Director } from '../render/director';
import { createIdleCrew, playEvent, recallHome, type IdleCrew } from '../render/idleCrew';
import { IDLE } from '../render/metrics';
import { DEFAULT_SEATS } from '../render/scenes';
import { createMessageQueue, type GuildMessage, type StageRecall } from './messageQueue';
import { globalScheduler } from './scheduler';

/**
 * A level-up of a member out playing (Issue #19 review): the message, its sound and the hops start
 * at the same time, once the member is back at the seat. The stage here is the canvas's crew and
 * director (render/), on a clock that runs with the queue's.
 */

const MIN = 60_000;
const START = 7_000_000 * IDLE.playCycleMs;
const context = { seats: DEFAULT_SEATS, random: () => 0.5 };
const minoriUp: GuildEvent = {
  id: 'level-up:経理#4',
  kind: 'level-up',
  number: 4,
  department: '経理',
};

/** Stage time: ms since START (the wall clock is the fake timers' Date.now). */
const stageNow = () => Date.now() - START;

/** The canvas's side: everybody idle for an hour, so they go out playing now and then. */
function createStage() {
  const crew = createIdleCrew({ random: () => 0.25, wallNow: Date.now, onActive: undefined });
  const since = Object.fromEntries(
    (['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'] as const).map((id) => [
      id,
      START - 60 * MIN,
    ]),
  );
  const stage: { crew: IdleCrew; director: Director } = {
    crew,
    director: crew.setSince(EMPTY_DIRECTOR, since, 0),
  };
  const recall: StageRecall = {
    recall(members) {
      const recalled = recallHome(stage.crew, stage.director, members, stageNow());
      stage.director = recalled.director;
      return recalled.homeIn;
    },
  };
  return { stage, recall };
}

/** Moves the clock to the first time `id` stands at a play spot away from the seat. */
function goOutPlaying(stage: ReturnType<typeof createStage>['stage'], id: MemberId): void {
  for (let t = 0; t < 240 * MIN; t += 1_000) {
    vi.setSystemTime(START + t);
    const step = stage.crew.frame(stage.director, t)[id]?.step;
    const seat = DEFAULT_SEATS[id];
    const atSpot =
      step !== undefined && step.from.col === step.to.col && step.from.row === step.to.row;
    if (atSpot && (step.from.col !== seat.col || step.from.row !== seat.row)) return;
  }
  throw new Error(`${id} never goes out`);
}

function setupQueue(recall: StageRecall | null) {
  const shown: { message: GuildMessage; at: number }[] = [];
  const queue = createMessageQueue({
    scheduler: globalScheduler,
    now: Date.now,
    holdMs: 8_000,
    lastHoldMs: 30_000,
    publish: (messages) => {
      const head = messages[0];
      if (head !== undefined && shown.at(-1)?.message.id !== head.id)
        shown.push({ message: head, at: stageNow() });
    },
  });
  queue.setStage(recall);
  return { queue, shown };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('messageQueue: a level-up of a member out playing', () => {
  it('shows the message, rings and starts the hops together, once the member is back', async () => {
    const { stage, recall } = createStage();
    goOutPlaying(stage, 'minori');
    const pushedAt = stageNow();
    const { queue, shown } = setupQueue(recall);
    queue.push([{ text: 'みのりは レベル 4 に あがった！', event: minoriUp }]);

    // She walks back now; the window waits for her.
    const walk = stage.director.tracks.find((track) => track.actor === 'minori');
    if (walk === undefined) throw new Error('minori does not walk back');
    const back = trackEnd(walk);
    expect(back).toBeGreaterThan(pushedAt);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(back - pushedAt - 1);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    // The message reaches the window when she is back; its sound rings with it.
    expect(shown.map((s) => s.at)).toEqual([back]);
    const head = shown[0]?.message;
    if (head === undefined) throw new Error('no message');
    expect(cueForMessage(head)).toBe('levelup');

    // The canvas starts the scene for that message then: the hops begin at once.
    const event = head.event;
    if (event === null) throw new Error('no event');
    stage.director = playEvent(stage.crew, stage.director, event, { t: stageNow(), context });
    const hops = stage.director.tracks.filter((track) => track.actor === 'minori').at(-1);
    expect(hops?.segments[0]?.start).toBe(back);
    expect(hops?.segments[0]?.hopPx).toBeGreaterThan(0);
    expect(stage.director.bursts.at(-1)?.start).toBe(back);
    queue.dispose();
  });
});

describe('messageQueue: a level-up with nobody to wait for', () => {
  it('shows the message at once when the member is at the seat', () => {
    const { recall } = createStage();
    const { queue, shown } = setupQueue(recall);
    queue.push([{ text: 'みのりは レベル 4 に あがった！', event: minoriUp }]);
    expect(shown.map((s) => s.at)).toEqual([0]);
    queue.dispose();
  });

  it('does not wait without a stage (the canvas not running yet) or while it is not shown', () => {
    const { stage, recall } = createStage();
    goOutPlaying(stage, 'minori');
    for (const setup of [
      () => setupQueue(null),
      () => {
        const q = setupQueue(recall);
        q.queue.setStageShown(false);
        return q;
      },
    ]) {
      const { queue, shown } = setup();
      queue.push([{ text: 'みのりは レベル 4 に あがった！', event: minoriUp }]);
      expect(shown).toHaveLength(1);
      queue.dispose();
    }
  });

  it('ignores ▼ while the message waits, and waits on while the page is hidden', async () => {
    const { stage, recall } = createStage();
    goOutPlaying(stage, 'minori');
    const pushedAt = stageNow();
    const { queue, shown } = setupQueue(recall);
    queue.push([{ text: 'みのりは レベル 4 に あがった！', event: minoriUp }]);
    const back = stage.director.busyUntil.minori ?? pushedAt;
    queue.next();
    expect(shown).toEqual([]);
    queue.setHidden(true);
    await vi.advanceTimersByTimeAsync(back - pushedAt + 5_000);
    expect(shown).toEqual([]);
    queue.setHidden(false);
    await vi.advanceTimersByTimeAsync(back - pushedAt);
    expect(shown).toHaveLength(1);
    queue.dispose();
  });
});
