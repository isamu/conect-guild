import { describe, expect, it } from 'vitest';
import { extractLinkedIssues } from './links.ts';

const REPO = 'owner/repo';

describe('extractLinkedIssues', () => {
  it('picks #number from the title and body', () => {
    expect(extractLinkedIssues('Invoice draft (#101)', 'see #7 and #101', REPO)).toEqual([7, 101]);
  });

  it('accepts owner/name#number for the same repository, ignoring case', () => {
    expect(extractLinkedIssues('x', 'Owner/Repo#12', REPO)).toEqual([12]);
  });

  it('ignores references to another repository', () => {
    expect(extractLinkedIssues('x', 'other/repo#5 and owner/other#6 and #8', REPO)).toEqual([8]);
  });

  it('uses only closing-keyword references when any exist', () => {
    expect(extractLinkedIssues('Refactor (#3)', 'Closes #4\nRelated #9', REPO)).toEqual([4]);
  });

  it.each([
    'close',
    'closes',
    'closed',
    'fix',
    'fixes',
    'fixed',
    'resolve',
    'resolves',
    'resolved',
    'CLOSES',
    'Fixes:',
  ])('treats "%s" as a closing keyword', (keyword) => {
    expect(extractLinkedIssues('#1', `${keyword} #2`, REPO)).toEqual([2]);
  });

  it('collects several closing references and same-repo long form after a keyword', () => {
    expect(extractLinkedIssues('Fixes #5', 'resolves owner/repo#6, closes #5', REPO)).toEqual([
      5, 6,
    ]);
  });

  it('falls back to plain references when the closing reference is to another repository', () => {
    expect(extractLinkedIssues('x', 'Closes other/repo#4, see #9', REPO)).toEqual([9]);
  });

  it('ignores # glued to a word, URLs fragments and #0', () => {
    expect(extractLinkedIssues('abc#1 a/b/c#2', 'page.html#3 #0 ##4', REPO)).toEqual([]);
  });

  it('does not treat words that merely start with a keyword as closing', () => {
    expect(extractLinkedIssues('#1', 'prefix #2 fixture #3', REPO)).toEqual([1, 2, 3]);
  });

  it('handles a null body and no references', () => {
    expect(extractLinkedIssues('No refs', null, REPO)).toEqual([]);
  });
});
