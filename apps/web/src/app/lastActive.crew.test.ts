import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import type { GuildEvent } from '../domain/events';
import { EMPTY_DIRECTOR, prune, scheduleEvent, trackEnd, type Director } from '../render/director';
import type { IdleSince } from '../render/idle';
import { createIdleCrew } from '../render/idleCrew';
import { IDLE } from '../render/metrics';
import { tileToPoint } from '../render/path';
import { castOf, DEFAULT_SEATS } from '../render/scenes';
import { createLastActiveTracker, LAST_ACTIVE_STORAGE_KEY, type PartyStateRow } from './lastActive';

/**
 * The tracker and the render loop's idle crew wired as ui/GuildCanvas.vue wires them: the loop
 * reports members in scenes, the tracker stores the time and hands back the idle times, and the
 * loop takes them (walking members back when theirs changed).
 */

class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const MIN = 60_000;
const CYCLE_START = 7_000_000 * IDLE.playCycleMs;
const ALL_IDLE: PartyStateRow[] = (
  ['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'] as const
).map((id) => ({ id, state: 'idle' }));
const scroll: GuildEvent = {
  id: 'issue-opened#1',
  kind: 'issue-opened',
  number: 1,
  department: '広報',
};

function wire(startWall: number, stored: Record<string, number>) {
  const storage = new MemoryStorage();
  storage.items.set(LAST_ACTIVE_STORAGE_KEY, JSON.stringify(stored));
  const tracker = createLastActiveTracker(createKeyValueStore(() => storage));
  const clock = { wall: startWall };
  const state: { director: Director; since: IdleSince } = { director: EMPTY_DIRECTOR, since: {} };
  const crew = createIdleCrew({
    random: () => 0.25,
    wallNow: () => clock.wall,
    onActive: (ids, at) => {
      state.since = tracker.markActive(ids, at);
      state.director = crew.setSince(state.director, state.since, stage(clock.wall));
    },
  });
  // Stage time runs with wall time here (the page stays shown).
  const stage = (wall: number) => wall - startWall;
  state.since = tracker.observe(ALL_IDLE, clock.wall);
  state.director = crew.setSince(state.director, state.since, 0);
  return { storage, crew, clock, state, stage };
}

describe('the last-active tracker with the idle crew', () => {
  it('brings the cast back, plays the scene, then starts their idle time over', () => {
    const longAgo = CYCLE_START - 60 * MIN;
    const env = wire(CYCLE_START, { kaname: longAgo, hibiki: longAgo });
    const { crew, clock, state, stage, storage } = env;
    // Find a moment when one of the cast is out playing.
    const away = () => {
      const poses = crew.frame(state.director, stage(clock.wall));
      return (['kaname', 'hibiki'] as const).find((id) => {
        const feet = poses[id]?.feet;
        const seat = tileToPoint(DEFAULT_SEATS[id]);
        return feet !== undefined && Math.hypot(feet.x - seat.x, feet.y - seat.y) > 1;
      });
    };
    for (let i = 0; i < 2_000 && away() === undefined; i += 1) clock.wall += 5_000;
    expect(away()).toBeDefined();
    const t = stage(clock.wall);
    state.director = crew.callCast(state.director, castOf(scroll), t);
    const out = away();
    expect(out).toBeUndefined();
    const walk = state.director.tracks[0];
    expect(walk).toBeDefined();
    if (walk === undefined) return;
    state.director = scheduleEvent(state.director, scroll, t, {
      seats: DEFAULT_SEATS,
      random: () => 0,
    });
    const sceneEnd = Math.max(...state.director.tracks.map(trackEnd));
    expect(sceneEnd).toBeGreaterThan(trackEnd(walk));
    // Frames during the scene report the cast as active; the tracker stores the time.
    for (let now = t; now < sceneEnd; now += 1_000) {
      clock.wall = CYCLE_START + now;
      crew.frame(state.director, now);
    }
    state.director = prune(state.director, sceneEnd);
    const sceneWall = CYCLE_START + t;
    const hibikiSince = state.since.hibiki ?? 0;
    expect(hibikiSince).toBeGreaterThan(sceneWall);
    expect(state.since.kaname ?? 0).toBeGreaterThan(sceneWall);
    const lastFrameWall = hibikiSince;
    const raw: unknown = JSON.parse(storage.items.get(LAST_ACTIVE_STORAGE_KEY) ?? '{}');
    const stored = z.record(z.string(), z.number()).parse(raw);
    expect(stored.hibiki).toBeGreaterThan(sceneWall);
    expect(stored.kaname).toBeGreaterThan(sceneWall);
    // Right after the scene they are awake at their seat; they doze again 10 minutes later.
    clock.wall = lastFrameWall + MIN;
    expect(crew.frame(state.director, sceneEnd + MIN).hibiki).toBeUndefined();
    clock.wall = lastFrameWall + IDLE.dozeAfterMs;
    expect(crew.frame(state.director, sceneEnd + IDLE.dozeAfterMs).hibiki).toBeDefined();
  });
});
