import { describe, expect, it } from 'vitest';
import { closedIssue, issue } from './fixtures.test-util';
import { departmentLabelsOf, pickDepartment, toQuest, toQuests } from './quest';

describe('departmentLabelsOf', () => {
  it('keeps only department labels, in the fixed order, without repeats', () => {
    expect(departmentLabelsOf(['総務', 'bug', '経理', '総務'])).toEqual(['経理', '総務']);
  });

  it('returns nothing for no labels or only unknown labels', () => {
    expect(departmentLabelsOf([])).toEqual([]);
    expect(departmentLabelsOf(['bug', '経理部', ' 経理'])).toEqual([]);
  });
});

describe('pickDepartment', () => {
  it('sends an Issue without department labels to かなめの受付', () => {
    expect(pickDepartment([])).toEqual({ department: null, multiDepartment: false });
    expect(pickDepartment(['enhancement'])).toEqual({ department: null, multiDepartment: false });
  });

  it('uses the single department label', () => {
    expect(pickDepartment(['企画', 'question'])).toEqual({
      department: '企画',
      multiDepartment: false,
    });
  });

  it.each([
    [['総務', '経理'], '経理'],
    [['企画', '広報'], '広報'],
    [['総務', '企画'], '企画'],
    [['総務', '企画', '広報', '経理'], '経理'],
  ] as const)('picks the first of %j in the fixed order and marks it multi', (labels, expected) => {
    expect(pickDepartment(labels)).toEqual({ department: expected, multiDepartment: true });
  });

  it('does not mark a repeated single label as multi', () => {
    expect(pickDepartment(['広報', '広報'])).toEqual({
      department: '広報',
      multiDepartment: false,
    });
  });
});

describe('toQuest', () => {
  it('carries number, title, state and closedAt and adds the department', () => {
    const source = closedIssue(7, '2026-10-12T01:00:00Z', ['広報']);
    expect(toQuest(source)).toEqual({
      number: 7,
      title: source.title,
      state: 'closed',
      closedAt: '2026-10-12T01:00:00Z',
      department: '広報',
      multiDepartment: false,
    });
  });

  it('maps a list in order', () => {
    const quests = toQuests([issue(1, { labels: ['経理', '総務'] }), issue(2)]);
    expect(quests.map((q) => [q.number, q.department, q.multiDepartment])).toEqual([
      [1, '経理', true],
      [2, null, false],
    ]);
  });
});
