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

  it('rejects another schemaVersion', () => {
    expect(snapshotSchema.safeParse({ ...sampleRecord(), schemaVersion: 2 }).success).toBe(false);
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
