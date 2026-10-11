import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CollectorError } from './errors.ts';
import { ghApiProjected, parseJsonLines, parseOrThrow, type GhRunner } from './gh.ts';

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof CollectorError ? error.kind : 'other';
  }
  return undefined;
}

describe('parseJsonLines', () => {
  it('parses one JSON value per line across pages', () => {
    expect(parseJsonLines('{"a":1}\n"x.md"\n{"a":2}\n')).toEqual([{ a: 1 }, 'x.md', { a: 2 }]);
  });

  it('keeps escaped newlines inside a value', () => {
    expect(parseJsonLines('"line1\\nline2"\n')).toEqual(['line1\nline2']);
  });

  it('returns [] for empty output (no items on any page)', () => {
    expect(parseJsonLines('')).toEqual([]);
  });

  it.each([
    ['a broken line', '{"a":1}\n{"a":\n'],
    ['raw text', 'not json\n'],
  ])('rejects %s as validation-failed', (_label, stdout) => {
    expect(kindOf(() => parseJsonLines(stdout))).toBe('validation-failed');
  });
});

describe('ghApiProjected', () => {
  it('projects each item inside gh with --paginate --jq and no --slurp', async () => {
    const calls: (readonly string[])[] = [];
    const gh: GhRunner = (args) => {
      calls.push(args);
      return Promise.resolve('"a.md"\n"b.md"\n');
    };
    await expect(ghApiProjected(gh, 'repos/o/n/pulls/1/files', '.filename')).resolves.toEqual([
      'a.md',
      'b.md',
    ]);
    expect(calls).toEqual([
      ['api', '--paginate', '--jq', '.[] | .filename | @json', 'repos/o/n/pulls/1/files'],
    ]);
  });

  it('passes a gh failure through unchanged', async () => {
    const gh: GhRunner = () => Promise.reject(new CollectorError('gh-failed'));
    await expect(ghApiProjected(gh, 'x', '.')).rejects.toMatchObject({ kind: 'gh-failed' });
  });
});

describe('parseOrThrow', () => {
  it('returns parsed data or throws validation-failed', () => {
    expect(parseOrThrow(z.number(), 1)).toBe(1);
    expect(kindOf(() => parseOrThrow(z.number(), 'x'))).toBe('validation-failed');
  });
});
