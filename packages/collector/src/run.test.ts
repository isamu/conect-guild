import { snapshotSchema } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { CollectorError } from './errors.ts';
import type { GhRunner } from './gh.ts';
import { collectOnce, runCollector, type RunDeps } from './run.ts';

const SECRET_TITLE = 'Secret client Ltd invoice';
const SECRET_BRANCH = 'accounting/secret-client';
const SECRET_BODY = 'Confidential body Closes #1';

const ISSUE = {
  number: 1,
  title: SECRET_TITLE,
  state: 'open',
  labels: ['経理'],
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-11T00:00:00Z',
  closed_at: null,
  is_pull_request: false,
};
const PR_AS_ISSUE = { ...ISSUE, number: 2, is_pull_request: true };
const OLD_CLOSED_ISSUE = {
  ...ISSUE,
  number: 3,
  state: 'closed',
  closed_at: '2026-09-01T00:00:00Z',
};
const OPEN_PR = {
  number: 2,
  title: SECRET_TITLE,
  body: SECRET_BODY,
  state: 'open',
  merged_at: null,
  closed_at: null,
  head_ref: SECRET_BRANCH,
};
const MERGED_PR = {
  ...OPEN_PR,
  number: 4,
  state: 'closed',
  merged_at: '2026-10-11T00:00:00Z',
  closed_at: '2026-10-11T00:00:00Z',
};

/** Projected items per endpoint, one array per page; issues and files span two pages. */
const OUTPUTS: Record<string, unknown[][]> = {
  'issues?state=open': [[ISSUE], [PR_AS_ISSUE]],
  'issues?state=closed': [[OLD_CLOSED_ISSUE]],
  'pulls?state=open': [[OPEN_PR]],
  'pulls?state=closed': [[MERGED_PR]],
  'pulls/2/files': [['a/CLAUDE.md'], ['b.md']],
};

function fakeGh(overrides: Record<string, string | Error> = {}): GhRunner & { calls: string[] } {
  const calls: string[] = [];
  const gh = (args: readonly string[]): Promise<string> => {
    const path = args.at(-1) ?? '';
    calls.push(path);
    const key = Object.keys(OUTPUTS).find((k) => path.includes(k)) ?? 'missing';
    const override = overrides[key];
    if (override instanceof Error) return Promise.reject(override);
    const pages = OUTPUTS[key] ?? [];
    // gh --paginate --jq prints the lines of every page one after another.
    const stdout = pages
      .flat()
      .map((item) => `${JSON.stringify(item)}\n`)
      .join('');
    return Promise.resolve(override ?? stdout);
  };
  return Object.assign(gh, { calls });
}

interface Harness extends RunDeps {
  readonly logs: string[];
  readonly errors: string[];
  readonly writes: string[];
}

function harness(gh: GhRunner, patch: Partial<RunDeps> = {}): Harness {
  const logs: string[] = [];
  const errors: string[] = [];
  const writes: string[] = [];
  return {
    logs,
    errors,
    writes,
    now: () => new Date('2026-10-12T00:00:00.000Z'),
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
    gh,
    writeSnapshot: (content) => {
      writes.push(content);
      return Promise.resolve();
    },
    sleep: () => Promise.resolve(),
    signal: new AbortController().signal,
    ...patch,
  };
}

describe('collectOnce', () => {
  it('writes one validated snapshot built from every page', async () => {
    const deps = harness(fakeGh());
    await expect(collectOnce(deps)).resolves.toEqual({ ok: true, issues: 1, prs: 2 });
    expect(deps.writes).toHaveLength(1);
    const snapshot = snapshotSchema.parse(JSON.parse(deps.writes[0] ?? ''));
    expect(snapshot.issues.map((i) => i.number)).toEqual([1]);
    expect(snapshot.prs.map((p) => [p.number, p.linkedIssues, p.changedFiles])).toEqual([
      [2, [1], ['a/CLAUDE.md', 'b.md']],
      [4, [1], []],
    ]);
    expect(deps.writes[0]).not.toContain('Confidential body');
  });

  it('asks for closed issues since 7 days ago and files only for open PRs', async () => {
    const gh = fakeGh();
    await collectOnce(harness(gh));
    expect(gh.calls).toContain(
      'repos/yukihiroyamaguchi569/conect-management/issues?state=closed&since=2026-10-05T00%3A00%3A00.000Z&per_page=100',
    );
    expect(gh.calls.filter((c) => c.includes('/files'))).toEqual([
      'repos/yukihiroyamaguchi569/conect-management/pulls/2/files?per_page=100',
    ]);
  });

  it.each([
    [
      'gh fails for one endpoint',
      { 'pulls/2/files': new CollectorError('gh-failed') },
      'gh-failed',
    ],
    ['gh prints broken JSON', { 'issues?state=open': '{"number":\n' }, 'validation-failed'],
    [
      'an item has the wrong shape',
      { 'pulls?state=open': '{"number":"x"}\n' },
      'validation-failed',
    ],
    ['a file entry is not a path', { 'pulls/2/files': '{"filename":"a"}\n' }, 'validation-failed'],
  ])('does not write when %s', async (_label, overrides, kind) => {
    const deps = harness(fakeGh(overrides));
    await expect(collectOnce(deps)).resolves.toEqual({ ok: false, kind });
    expect(deps.writes).toEqual([]);
  });

  it('reports write-failed when writing throws', async () => {
    const deps = harness(fakeGh(), { writeSnapshot: () => Promise.reject(new Error('EACCES')) });
    await expect(collectOnce(deps)).resolves.toEqual({ ok: false, kind: 'write-failed' });
  });
});

describe('runCollector --once', () => {
  it('exits 0 and logs counts and time only', async () => {
    const deps = harness(fakeGh());
    await expect(runCollector(['--once'], deps)).resolves.toBe(0);
    expect(deps.logs).toEqual(['[collector] 2026-10-12T00:00:00.000Z ok: issues=1 prs=2']);
    expect(deps.errors).toEqual([]);
  });

  it('exits 1 on failure and logs only the error kind', async () => {
    const error = new Error(`gh: ${SECRET_TITLE} ${SECRET_BRANCH}`);
    const deps = harness(fakeGh({ 'issues?state=open': error }));
    await expect(runCollector(['--once'], deps)).resolves.toBe(1);
    expect(deps.errors).toEqual(['[collector] 2026-10-12T00:00:00.000Z failed: unexpected']);
    expect(deps.writes).toEqual([]);
  });

  it('never logs titles, bodies or branch names', async () => {
    const cases: Record<string, string | Error>[] = [
      {},
      { 'pulls/2/files': new Error(SECRET_TITLE) },
    ];
    for (const overrides of cases) {
      const deps = harness(fakeGh(overrides));
      await runCollector(['--once'], deps);
      const output = [...deps.logs, ...deps.errors].join('\n');
      for (const secret of [SECRET_TITLE, SECRET_BRANCH, 'Confidential', 'CLAUDE.md']) {
        expect(output).not.toContain(secret);
      }
    }
  });

  it('rejects unknown arguments without echoing them or contacting GitHub', async () => {
    const gh = fakeGh();
    const deps = harness(gh);
    await expect(runCollector(['--repo', 'other/repo'], deps)).resolves.toBe(2);
    expect(deps.errors.join('\n')).not.toContain('other/repo');
    expect(gh.calls).toEqual([]);
  });
});

describe('runCollector loop', () => {
  it('retries after a failed cycle, sleeps the interval, and stops when aborted', async () => {
    const controller = new AbortController();
    let cycle = 0;
    const flaky: GhRunner = (args) => {
      if (cycle === 0) return Promise.reject(new CollectorError('gh-failed'));
      return fakeGh()(args);
    };
    const sleeps: number[] = [];
    const deps = harness(flaky, {
      signal: controller.signal,
      sleep: (ms) => {
        sleeps.push(ms);
        cycle += 1;
        if (cycle === 2) controller.abort();
        return Promise.resolve();
      },
    });
    await expect(runCollector([], deps)).resolves.toBe(0);
    expect(deps.errors).toEqual(['[collector] 2026-10-12T00:00:00.000Z failed: gh-failed']);
    expect(deps.logs).toEqual(['[collector] 2026-10-12T00:00:00.000Z ok: issues=1 prs=2']);
    expect(deps.writes).toHaveLength(1);
    expect(sleeps).toEqual([60_000, 60_000]);
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
