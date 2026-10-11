import { describe, expect, it } from 'vitest';
import {
  BRANCH_PREFIX_RULES,
  DEPARTMENT_LABELS,
  DEPARTMENT_MEMBER,
  DONE_WINDOW_MS,
  EVENT_GAP_LIMIT_MS,
  MEMBERS,
  RECENT_REWARD_WINDOW_MS,
  STALE_AFTER_MS,
} from './guild.config';

describe('guild.config', () => {
  it('keeps the department labels in the fixed order', () => {
    expect(DEPARTMENT_LABELS).toEqual(['経理', '広報', '企画', '総務']);
  });

  it('uses the names the president fixed on 2026-10-12', () => {
    const names = Object.values(MEMBERS).map((m) => [m.role, m.name]);
    expect(Object.fromEntries(names)).toEqual({
      司令塔: 'かなめ',
      経理: 'みのり',
      広報: 'ひびき',
      企画: 'ひらめ',
      総務: 'ささえ',
      社長: 'ゆきひろ',
    });
  });

  it('maps each department label to the member whose role it is', () => {
    for (const label of DEPARTMENT_LABELS) {
      expect(MEMBERS[DEPARTMENT_MEMBER[label]].role).toBe(label);
    }
  });

  it('keys every member by its own id', () => {
    for (const [key, member] of Object.entries(MEMBERS)) expect(member.id).toBe(key);
  });

  it('only routes branch prefixes to known departments', () => {
    for (const rule of BRANCH_PREFIX_RULES) {
      expect(DEPARTMENT_LABELS).toContain(rule.department);
      expect(rule.prefix.length).toBeGreaterThan(0);
    }
  });

  it('sets the time windows from the design', () => {
    expect(DONE_WINDOW_MS).toBe(30 * 60_000);
    expect(RECENT_REWARD_WINDOW_MS).toBe(7 * 24 * 3_600_000);
    expect(STALE_AFTER_MS).toBe(5 * 60_000);
    expect(EVENT_GAP_LIMIT_MS).toBe(7 * 24 * 3_600_000);
  });
});
