import { snapshotSchema } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { CollectorError } from './errors.ts';
import type { GhRunner } from './gh.ts';
import { runCollector, type RunDeps } from './run.ts';
import { fakeGh, harness, SESSIONS_OK } from './run.fixtures.test-util.ts';
import type { SessionsReading } from './sessions.ts';

/** A clock that only moves when the loop sleeps; aborts once `untilMs` has passed. */
function clockedHarness(gh: GhRunner, untilMs: number, patch: Partial<RunDeps> = {}) {
  const controller = new AbortController();
  const start = Date.parse('2026-10-12T00:00:00.000Z');
  let elapsed = 0;
  const sleeps: number[] = [];
  const sessionReads: number[] = [];
  const deps = harness(gh, {
    signal: controller.signal,
    now: () => new Date(start + elapsed),
    readSessions: () => {
      sessionReads.push(elapsed);
      return Promise.resolve(SESSIONS_OK);
    },
    sleep: (ms) => {
      sleeps.push(ms);
      elapsed += ms;
      if (elapsed >= untilMs) controller.abort();
      return Promise.resolve();
    },
    ...patch,
  });
  return { deps, sleeps, sessionReads, elapsed: () => elapsed };
}

function githubCycles(gh: { calls: string[] }): number {
  return gh.calls.filter((c) => c.includes('issues?state=open')).length;
}

describe('runCollector loop', () => {
  it('reads the sessions every 5 seconds and GitHub every 60 seconds', async () => {
    const gh = fakeGh();
    const { deps, sleeps, sessionReads } = clockedHarness(gh, 125_000);
    await expect(runCollector([], deps)).resolves.toBe(0);
    expect(new Set(sleeps)).toEqual(new Set([5_000]));
    expect(sessionReads).toEqual(Array.from({ length: 25 }, (_, i) => i * 5_000));
    // GitHub at 0 s, 60 s and 120 s.
    expect(githubCycles(gh)).toBe(3);
    expect(deps.writes).toHaveLength(25);
  });

  it('writes the GitHub part of its last fetch with every sessions update', async () => {
    const { deps } = clockedHarness(fakeGh(), 15_000);
    await runCollector([], deps);
    const snapshots = deps.writes.map((w) => snapshotSchema.parse(JSON.parse(w)));
    expect(snapshots.map((s) => s.fetchedAt)).toEqual(
      Array.from({ length: 3 }, () => '2026-10-12T00:00:00.000Z'),
    );
    expect(snapshots.map((s) => s.sessions.checkedAt)).toEqual([
      '2026-10-12T00:00:00.000Z',
      '2026-10-12T00:00:05.000Z',
      '2026-10-12T00:00:10.000Z',
    ]);
  });

  it('keeps the last good GitHub part when a later fetch fails', async () => {
    let fail = false;
    const base = fakeGh();
    const gh: GhRunner = (args) =>
      fail ? Promise.reject(new CollectorError('gh-failed')) : base(args);
    const { deps } = clockedHarness(gh, 65_000, {});
    const sleep = deps.sleep;
    const patched = {
      ...deps,
      sleep: async (ms: number) => {
        fail = true;
        await sleep(ms);
      },
    };
    await runCollector([], patched);
    const last = snapshotSchema.parse(JSON.parse(deps.writes.at(-1) ?? ''));
    expect(last.fetchedAt).toBe('2026-10-12T00:00:00.000Z');
    expect(last.sessions.checkedAt).toBe('2026-10-12T00:01:00.000Z');
    expect(deps.errors).toEqual(['[collector] 2026-10-12T00:01:00.000Z failed: gh-failed']);
  });
});

describe('runCollector loop: failures', () => {
  it('writes nothing until GitHub has succeeded once, then retries it 60 seconds later', async () => {
    let cycle = 0;
    const base = fakeGh();
    const gh: GhRunner = (args) => {
      if (cycle === 0) return Promise.reject(new CollectorError('gh-failed'));
      return base(args);
    };
    const { deps } = clockedHarness(gh, 70_000);
    const sleep = deps.sleep;
    await runCollector([], {
      ...deps,
      sleep: async (ms) => {
        await sleep(ms);
        cycle = deps.now().getTime() >= Date.parse('2026-10-12T00:01:00.000Z') ? 1 : 0;
      },
    });
    // 12 ticks before the retry at 60 s write nothing; 60 s and 65 s write.
    expect(deps.writes).toHaveLength(2);
    expect(deps.errors).toEqual(['[collector] 2026-10-12T00:00:00.000Z failed: gh-failed']);
    expect(deps.logs).toContain('[collector] 2026-10-12T00:01:00.000Z ok: issues=1 prs=2');
  });
});

describe('runCollector loop: logs', () => {
  it('logs the sessions only when their summary changes', async () => {
    const readings: SessionsReading[] = [
      SESSIONS_OK,
      SESSIONS_OK,
      { ok: false, kind: 'parse-failed' },
      { ok: false, kind: 'parse-failed' },
      SESSIONS_OK,
    ];
    let index = 0;
    const { deps } = clockedHarness(fakeGh(), 25_000, {
      readSessions: () => Promise.resolve(readings[index++] ?? SESSIONS_OK),
    });
    await runCollector([], deps);
    expect(deps.logs.filter((l) => l.includes('sessions'))).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z sessions=5 ok',
      '[collector] 2026-10-12T00:00:10.000Z sessions unavailable: parse-failed',
      '[collector] 2026-10-12T00:00:20.000Z sessions=5 ok',
    ]);
    expect(deps.writes).toHaveLength(5);
  });

  it('logs a write failure once while it lasts', async () => {
    let attempts = 0;
    const { deps } = clockedHarness(fakeGh(), 20_000, {
      writeSnapshot: () => {
        attempts += 1;
        return Promise.reject(new Error('EACCES /secret/path'));
      },
    });
    await runCollector([], deps);
    expect(attempts).toBe(4);
    expect(deps.errors).toEqual(['[collector] 2026-10-12T00:00:00.000Z failed: write-failed']);
  });

  it('ends quietly when interrupted during a cycle', async () => {
    const controller = new AbortController();
    const interrupted: GhRunner = () => {
      controller.abort();
      return Promise.reject(new CollectorError('gh-failed'));
    };
    const deps = harness(interrupted, { signal: controller.signal });
    await expect(runCollector([], deps)).resolves.toBe(0);
    expect([...deps.logs, ...deps.errors]).toEqual([]);
    expect(deps.writes).toEqual([]);
  });
});
