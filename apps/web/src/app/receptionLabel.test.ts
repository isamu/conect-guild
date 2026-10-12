import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { issue, snapshot } from '../domain/fixtures.test-util';
import { buildBoard } from './guildView';

// A team whose first department label happens to be "reception".
vi.mock('@conect-guild/snapshot/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@conect-guild/snapshot/settings')>();
  const departments = original.GUILD_SETTINGS.departments.map((d, i) =>
    i === 0 ? { ...d, label: 'reception' } : d,
  );
  const labels = departments.map((d) => d.label);
  return {
    ...original,
    GUILD_SETTINGS: original.checkGuildSettings({
      ...original.GUILD_SETTINGS,
      departments,
      branchPrefixes: [],
    }),
    DEPARTMENT_LABELS: labels,
    departmentLabelSchema: z.enum(labels),
  };
});

describe('board keys', () => {
  it('keeps the reception and a department labelled reception apart', () => {
    const board = buildBoard(snapshot({ issues: [issue(1), issue(2, { labels: ['reception'] })] }));
    expect(board.map((g) => g.quests.map((q) => q.number))).toEqual([[1], [2]]);
    expect(new Set(board.map((g) => g.key)).size).toBe(2);
  });
});
