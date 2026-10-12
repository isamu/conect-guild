import type { Snapshot } from '@conect-guild/snapshot';
import {
  COMMANDER_ID,
  DEPARTMENT_MEMBER_IDS,
  memberIdSchema,
  PRESIDENT_ID,
} from '@conect-guild/snapshot/settings';
import { z } from 'zod';
import { DEPARTMENT_LABELS, DEPARTMENT_MEMBER, type DepartmentLabel } from '../guild.config';
import { countXp, levelOf, MAX_LEVEL, NO_XP } from './xp';

/**
 * Level-ups (docs/DESIGN.md 4.4 and 4.6, Issue #19): the levels the diff baseline keeps, and who
 * went up since. Pure. The king has no level, so he is never in here.
 */

/** Members with a level: かなめ and the four department members. */
export const levelMemberSchema = memberIdSchema.exclude([PRESIDENT_ID]);
export type LevelMember = z.infer<typeof levelMemberSchema>;

/** Every member with a level, かなめ first, then the department members in their fixed order. */
export const LEVEL_MEMBERS: readonly LevelMember[] = [COMMANDER_ID, ...DEPARTMENT_MEMBER_IDS];

/** Each member's level: numbers only, as the baseline keeps them. */
export const memberLevelsSchema = z.record(
  levelMemberSchema,
  z.number().int().min(1).max(MAX_LEVEL),
);
export type MemberLevels = z.infer<typeof memberLevelsSchema>;

/** Each member's level from the snapshot's history (domain/xp.ts); 1 for a member with no desk. */
export function memberLevels(snapshot: Pick<Snapshot, 'issues' | 'history'>): MemberLevels {
  const xp = countXp(snapshot);
  const levelOfMember = (member: LevelMember): number => {
    if (member === COMMANDER_ID) return levelOf(xp.kaname.xp).level;
    const department = departmentOf(member);
    const tally = department === null ? NO_XP : (xp.departments.get(department) ?? NO_XP);
    return levelOf(tally.xp).level;
  };
  return {
    kaname: levelOfMember('kaname'),
    minori: levelOfMember('minori'),
    hibiki: levelOfMember('hibiki'),
    hirame: levelOfMember('hirame'),
    sasae: levelOfMember('sasae'),
  };
}

export interface LevelUp {
  /** Who acts: null is かなめ (as GuildEvent.department). */
  readonly department: DepartmentLabel | null;
  /** The level reached; two or more at once are told once, with the highest. */
  readonly level: number;
}

/** The department a member works; null for かなめ (or a member the settings give no desk). */
function departmentOf(member: LevelMember): DepartmentLabel | null {
  return DEPARTMENT_LABELS.find((label) => DEPARTMENT_MEMBER[label] === member) ?? null;
}

/**
 * Members whose level is higher than in `before`, in LEVEL_MEMBERS' order. A level that went down (a label moved, an Issue reopened) tells nothing.
 */
export function levelUps(before: MemberLevels, after: MemberLevels): LevelUp[] {
  return LEVEL_MEMBERS.filter((member) => after[member] > before[member]).map((member) => ({
    department: departmentOf(member),
    level: after[member],
  }));
}
