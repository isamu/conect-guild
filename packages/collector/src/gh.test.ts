import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CollectorError } from './errors.ts';
import { flattenPages, ghApiAll, parseOrThrow, type GhRunner } from './gh.ts';

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof CollectorError ? error.kind : 'other';
  }
  return undefined;
}

describe('flattenPages', () => {
  it('joins the items of every slurped page in order', () => {
    expect(flattenPages(JSON.stringify([[1, 2], [3], []]))).toEqual([1, 2, 3]);
  });

  it('returns [] for no pages', () => {
    expect(flattenPages('[]')).toEqual([]);
  });

  it.each([
    ['broken JSON', '[[1,'],
    ['a single page that is not slurped', '[1, 2]'],
    ['an object', '{"message":"Not Found"}'],
    ['empty output', ''],
  ])('rejects %s as validation-failed', (_label, stdout) => {
    expect(kindOf(() => flattenPages(stdout))).toBe('validation-failed');
  });
});

describe('ghApiAll', () => {
  it('calls gh api with --paginate --slurp and the path as separate arguments', async () => {
    const calls: (readonly string[])[] = [];
    const gh: GhRunner = (args) => {
      calls.push(args);
      return Promise.resolve('[[{"a":1}],[{"a":2}]]');
    };
    await expect(ghApiAll(gh, 'repos/o/n/issues?state=open')).resolves.toEqual([
      { a: 1 },
      { a: 2 },
    ]);
    expect(calls).toEqual([['api', '--paginate', '--slurp', 'repos/o/n/issues?state=open']]);
  });

  it('passes a gh failure through unchanged', async () => {
    const gh: GhRunner = () => Promise.reject(new CollectorError('gh-failed'));
    await expect(ghApiAll(gh, 'x')).rejects.toMatchObject({ kind: 'gh-failed' });
  });
});

describe('parseOrThrow', () => {
  it('returns parsed data or throws validation-failed', () => {
    expect(parseOrThrow(z.number(), 1)).toBe(1);
    expect(kindOf(() => parseOrThrow(z.number(), 'x'))).toBe('validation-failed');
  });
});
