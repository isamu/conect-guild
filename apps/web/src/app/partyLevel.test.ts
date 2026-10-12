import type { SnapshotHistory } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { at, issue, snapshot, T0 } from '../domain/fixtures.test-util';
import { xpForLevel } from '../domain/xp';
import { buildParty } from './guildView';
import { buildPartyLevels, KING_LEVEL } from './partyLevel';

const history: SnapshotHistory = {
  openedIssueCount: 6,
  completedIssues: [
    { number: 1, departments: ['経理'] },
    { number: 2, departments: ['経理', '総務'] },
    { number: 3, departments: [] },
  ],
  mergedPrs: [
    { number: 10, linkedIssues: [1], branchDepartment: null },
    { number: 11, linkedIssues: [], branchDepartment: '企画' },
  ],
};

describe('buildPartyLevels', () => {
  it('gives each department member their level, gauge and breakdown', () => {
    const levels = buildPartyLevels(snapshot({ history }));
    // 経理: 2 clears + 1 merge = 25 → Lv 2 (10), 15 of the 20 to Lv 3.
    expect(levels.minori).toEqual({
      level: 2,
      label: 'Lv 2',
      progress: 0.75,
      detail: 'けいけんち 25・つぎのレベルまで 5（クリア 2 件・マージ 1 件）',
    });
    expect(levels.hirame).toMatchObject({ level: 1, label: 'Lv 1', progress: 0.5 });
    expect(levels.hibiki).toMatchObject({ level: 1, progress: 0 });
  });

  it('measures かなめ by the scrolls and the clears with no department', () => {
    // 6 × 3 + 1 × 10 = 28 → Lv 2, 18 of 20.
    expect(buildPartyLevels(snapshot({ history })).kaname).toEqual({
      level: 2,
      label: 'Lv 2',
      progress: 0.9,
      detail: 'けいけんち 28・つぎのレベルまで 2（受付の巻物 6 件・担当なしのクリア 1 件）',
    });
  });

  it('gives the king no level', () => {
    expect(buildPartyLevels(snapshot({ history })).yukihiro).toBe(KING_LEVEL);
    expect(KING_LEVEL).toMatchObject({ level: null, label: 'おうさま', progress: null });
  });

  it('says the level is at the top at 99, with a full gauge', () => {
    const openedIssueCount = Math.ceil(xpForLevel(99) / 3);
    const top = buildPartyLevels(snapshot({ history: { ...history, openedIssueCount } })).kaname;
    expect(top).toMatchObject({ level: 99, label: 'Lv 99', progress: 1 });
    expect(top.detail).toContain('レベルは さいこう');
  });

  it('never puts a title in the breakdown', () => {
    const levels = buildPartyLevels(
      snapshot({ issues: [issue(1, { title: 'ひみつの題名', labels: ['経理'] })], history }),
    );
    expect(
      Object.values(levels)
        .map((l) => l.detail)
        .join(),
    ).not.toContain('ひみつ');
  });
});

describe('buildParty levels', () => {
  it('attaches each member their level, the king おうさま, and keeps 成果', () => {
    const rows = buildParty(snapshot({ history }), at(T0));
    expect(rows.map((r) => r.level.label)).toEqual([
      'Lv 2',
      'Lv 2',
      'Lv 1',
      'Lv 1',
      'Lv 1',
      'おうさま',
    ]);
    expect(rows.map((r) => r.rewards)).toEqual([null, 0, 0, 0, 0, null]);
  });
});
