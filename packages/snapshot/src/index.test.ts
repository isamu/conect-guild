import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_SCHEMA_VERSION, snapshotSchema } from './index.ts';

const samplePath = new URL('../../../apps/web/public/snapshot.sample.json', import.meta.url);

function loadSample(): unknown {
  return JSON.parse(readFileSync(samplePath, 'utf8'));
}

function sampleRecord(): Record<string, unknown> {
  const sample = loadSample();
  if (typeof sample !== 'object' || sample === null || Array.isArray(sample)) {
    throw new Error('sample is not an object');
  }
  return { ...sample };
}

describe('snapshotSchema', () => {
  it('accepts the dummy sample used by build and CI', () => {
    const result = snapshotSchema.safeParse(loadSample());
    expect(result.success).toBe(true);
    expect(result.data?.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });

  it.each([1, 3])('rejects schemaVersion %i', (version) => {
    expect(snapshotSchema.safeParse({ ...sampleRecord(), schemaVersion: version }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys so bodies cannot slip in', () => {
    expect(snapshotSchema.safeParse({ ...sampleRecord(), body: 'x' }).success).toBe(false);
    const issue = {
      number: 1,
      title: 't',
      labels: [],
      state: 'open',
      createdAt: '2026-10-12T00:00:00.000Z',
      updatedAt: '2026-10-12T00:00:00.000Z',
      closedAt: null,
      body: 'secret',
    };
    expect(snapshotSchema.safeParse({ ...sampleRecord(), issues: [issue] }).success).toBe(false);
  });

  it.each([
    ['a non-ISO time', { fetchedAt: 'yesterday' }],
    ['a repo without owner', { repo: 'name-only' }],
    ['a missing prs array', { prs: undefined }],
  ])('rejects %s', (_label, patch) => {
    expect(snapshotSchema.safeParse({ ...sampleRecord(), ...patch }).success).toBe(false);
  });
});

const CHECKED_AT = '2026-10-12T09:00:05.000Z';

describe('snapshotSchema: sessions', () => {
  function withSessions(sessions: unknown) {
    return snapshotSchema.safeParse({ ...sampleRecord(), sessions });
  }

  it('accepts unavailable sessions and an empty member list', () => {
    expect(withSessions({ status: 'unavailable', checkedAt: CHECKED_AT }).success).toBe(true);
    expect(withSessions({ status: 'ok', checkedAt: CHECKED_AT, members: [] }).success).toBe(true);
  });

  it('accepts かなめ as department null', () => {
    const members = [{ department: null, state: 'awaiting-permission' }];
    expect(withSessions({ status: 'ok', checkedAt: CHECKED_AT, members }).success).toBe(true);
  });

  it.each([
    ['missing sessions', undefined],
    ['an unknown status', { status: 'maybe', checkedAt: CHECKED_AT }],
    ['a missing checkedAt', { status: 'unavailable' }],
    ['members on unavailable', { status: 'unavailable', checkedAt: CHECKED_AT, members: [] }],
    [
      'an unknown state',
      { status: 'ok', checkedAt: CHECKED_AT, members: [{ department: '経理', state: 'busy' }] },
    ],
    [
      'an unknown department',
      { status: 'ok', checkedAt: CHECKED_AT, members: [{ department: '営業', state: 'idle' }] },
    ],
    [
      'a session id slipped into a member',
      {
        status: 'ok',
        checkedAt: CHECKED_AT,
        members: [
          { department: '経理', state: 'idle', id: '00000000-0000-0000-0000-000000000000' },
        ],
      },
    ],
    [
      'a path slipped into the sessions',
      { status: 'unavailable', checkedAt: CHECKED_AT, cwd: '/home/someone' },
    ],
    [
      'two entries for one department',
      {
        status: 'ok',
        checkedAt: CHECKED_AT,
        members: [
          { department: null, state: 'idle' },
          { department: null, state: 'working' },
        ],
      },
    ],
  ])('rejects %s', (_label, sessions) => {
    expect(withSessions(sessions).success).toBe(false);
  });
});
