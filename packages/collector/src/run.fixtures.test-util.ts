import type { SnapshotSession } from '@conect-guild/snapshot';
import type { GhRunner } from './gh.ts';
import type { RunDeps } from './run.ts';
import type { SessionsReading } from './sessions.ts';

/** Shared fakes for the run tests. Titles, bodies and branch names are the secrets to keep out. */

export const SECRET_TITLE = 'Secret client Ltd invoice';
export const SECRET_BRANCH = 'accounting/secret-client';
const SECRET_BODY = 'Confidential body Closes #1';

const ISSUE = {
  number: 1,
  title: SECRET_TITLE,
  state: 'open',
  state_reason: null,
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
  state_reason: 'completed',
  closed_at: '2026-09-01T00:00:00Z',
};
/** Closed long ago as not planned: counted as opened, never as completed. */
const NOT_PLANNED_ISSUE = { ...OLD_CLOSED_ISSUE, number: 5, state_reason: 'not_planned' };
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

/** Projected items per endpoint, one array per page; issues, closed issues and files span two pages. */
const OUTPUTS: Record<string, unknown[][]> = {
  'issues?state=open': [[ISSUE], [PR_AS_ISSUE]],
  'issues?state=closed': [[OLD_CLOSED_ISSUE], [NOT_PLANNED_ISSUE]],
  'pulls?state=open': [[OPEN_PR]],
  'pulls?state=closed': [[MERGED_PR]],
  'pulls/2/files': [['a/CLAUDE.md'], ['b.md']],
};

export function fakeGh(
  overrides: Record<string, string | Error> = {},
): GhRunner & { calls: string[] } {
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

export const SESSION_MEMBERS: readonly SnapshotSession[] = [
  { department: null, state: 'working' },
  { department: '経理', state: 'awaiting-permission' },
  { department: '広報', state: 'resting' },
  { department: '企画', state: 'idle' },
  { department: '総務', state: 'idle' },
];

export const SESSIONS_OK: SessionsReading = { ok: true, found: 5, members: SESSION_MEMBERS };

export interface Harness extends RunDeps {
  readonly logs: string[];
  readonly errors: string[];
  readonly writes: string[];
}

export function harness(gh: GhRunner, patch: Partial<RunDeps> = {}): Harness {
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
    readSessions: () => Promise.resolve(SESSIONS_OK),
    writeSnapshot: (content) => {
      writes.push(content);
      return Promise.resolve();
    },
    sleep: () => Promise.resolve(),
    signal: new AbortController().signal,
    ...patch,
  };
}
