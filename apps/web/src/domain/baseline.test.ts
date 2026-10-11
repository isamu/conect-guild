import { describe, expect, it } from 'vitest';
import { BASELINE_SCHEMA_VERSION, parseBaseline, toBaseline } from './baseline';
import { T0, closedIssue, issue, mergedPr, pr, snapshot } from './fixtures.test-util';

const sample = snapshot({
  issues: [issue(1, { labels: ['経理'] }), closedIssue(2, T0, ['広報'])],
  prs: [
    pr(3, { headRef: 'accounting/secret-client', changedFiles: ['CLAUDE.md'] }),
    mergedPr(4, T0),
  ],
});

describe('toBaseline', () => {
  it('keeps only numbers, states and times', () => {
    expect(toBaseline(sample)).toEqual({
      schemaVersion: BASELINE_SCHEMA_VERSION,
      fetchedAt: T0,
      issues: [
        { number: 1, state: 'open', closedAt: null },
        { number: 2, state: 'closed', closedAt: T0 },
      ],
      prs: [
        { number: 3, state: 'open', mergedAt: null },
        { number: 4, state: 'closed', mergedAt: T0 },
      ],
    });
  });

  it('leaves no title, label, branch name or file path in the stored text', () => {
    const stored = JSON.stringify(toBaseline(sample));
    for (const secret of [
      '架空',
      '経理',
      '広報',
      'secret-client',
      'accounting',
      'CLAUDE',
      'example/guild',
    ]) {
      expect(stored).not.toContain(secret);
    }
  });

  it('round-trips through JSON and parseBaseline', () => {
    const baseline = toBaseline(sample);
    expect(parseBaseline(JSON.parse(JSON.stringify(baseline)))).toEqual(baseline);
  });
});

describe('parseBaseline', () => {
  const valid = toBaseline(sample);

  it.each([
    ['null', null],
    ['a string', 'baseline'],
    ['an empty object', {}],
    ['another schemaVersion', { ...valid, schemaVersion: 2 }],
    ['a bad fetchedAt', { ...valid, fetchedAt: 'yesterday' }],
    ['a bad issue state', { ...valid, issues: [{ number: 1, state: 'merged', closedAt: null }] }],
    ['a non-positive number', { ...valid, prs: [{ number: 0, state: 'open', mergedAt: null }] }],
    [
      'an extra key such as a title',
      { ...valid, issues: [{ number: 1, state: 'open', closedAt: null, title: 'x' }] },
    ],
    ['an extra top-level key', { ...valid, repo: 'example/guild' }],
  ])('rejects %s', (_label, value) => {
    expect(parseBaseline(value)).toBeNull();
  });
});
