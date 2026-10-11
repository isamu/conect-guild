import { describe, expect, it } from 'vitest';
import { CHANGED_FILES_CONCURRENCY, collectSnapshot } from './collect.ts';
import type { GhRunner } from './gh.ts';

const REPO = 'owner/repo';
const OPEN_PR_COUNT = 30;

function openPr(number: number): object {
  return {
    number,
    title: 'PR',
    body: null,
    state: 'open',
    merged_at: null,
    closed_at: null,
    head: { ref: 'b' },
  };
}

describe('collectSnapshot', () => {
  it(`fetches changed files with at most ${String(CHANGED_FILES_CONCURRENCY)} gh processes at once`, async () => {
    let inFlight = 0;
    let peak = 0;
    let fileCalls = 0;
    const gh: GhRunner = async (args) => {
      const path = args.at(-1) ?? '';
      if (path.includes('pulls?state=open')) {
        return JSON.stringify([Array.from({ length: OPEN_PR_COUNT }, (_, i) => openPr(i + 1))]);
      }
      if (!path.includes('/files')) return '[[]]';
      fileCalls += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return JSON.stringify([[{ filename: 'a.md' }]]);
    };
    const snapshot = await collectSnapshot(gh, REPO, new Date('2026-10-12T00:00:00.000Z'));
    expect(fileCalls).toBe(OPEN_PR_COUNT);
    expect(peak).toBe(CHANGED_FILES_CONCURRENCY);
    expect(snapshot.prs.every((pr) => pr.changedFiles.length === 1)).toBe(true);
  });
});
