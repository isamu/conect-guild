/**
 * Guild settings: who sits where, which GitHub label maps to which member, and the time windows
 * the domain uses. Names were fixed by the president on 2026-10-12 (docs/DESIGN.md chapter 1).
 */

/** Department labels on GitHub, in the fixed priority order used when an Issue has several. */
export const DEPARTMENT_LABELS = ['経理', '広報', '企画', '総務'] as const;
export type DepartmentLabel = (typeof DEPARTMENT_LABELS)[number];

export type MemberId = 'kaname' | 'minori' | 'hibiki' | 'hirame' | 'sasae' | 'yukihiro';

export interface Seat {
  readonly x: number;
  readonly y: number;
}

export interface MemberConfig {
  readonly id: MemberId;
  /** Display name. */
  readonly name: string;
  /** Role shown next to the name. */
  readonly role: string;
  /** Accent colour for the name plate and speech bubble. */
  readonly color: string;
  /** Seat on the office map. Provisional pixel coordinates until the M2 tile map exists. */
  readonly seat: Seat;
}

export const MEMBERS: Readonly<Record<MemberId, MemberConfig>> = {
  kaname: {
    id: 'kaname',
    name: 'かなめ',
    role: '司令塔',
    color: '#e0b040',
    seat: { x: 320, y: 220 },
  },
  minori: {
    id: 'minori',
    name: 'みのり',
    role: '経理',
    color: '#4caf50',
    seat: { x: 120, y: 120 },
  },
  hibiki: {
    id: 'hibiki',
    name: 'ひびき',
    role: '広報',
    color: '#e91e63',
    seat: { x: 220, y: 120 },
  },
  hirame: {
    id: 'hirame',
    name: 'ひらめ',
    role: '企画',
    color: '#2196f3',
    seat: { x: 420, y: 120 },
  },
  sasae: { id: 'sasae', name: 'ささえ', role: '総務', color: '#9c6b3f', seat: { x: 520, y: 120 } },
  yukihiro: {
    id: 'yukihiro',
    name: 'ゆきひろ',
    role: '社長',
    color: '#8e44ad',
    seat: { x: 320, y: 40 },
  },
};

/** Department label → the member who works it. */
export const DEPARTMENT_MEMBER: Readonly<Record<DepartmentLabel, MemberId>> = {
  経理: 'minori',
  広報: 'hibiki',
  企画: 'hirame',
  総務: 'sasae',
};

export interface BranchPrefixRule {
  readonly prefix: string;
  readonly department: DepartmentLabel;
}

/**
 * Branch name prefix → department, used only when a PR links no labelled Issue.
 * Checked top to bottom; the first rule whose prefix the branch starts with wins.
 * 要調整: guessed from the folder names of conect-management (accounting / pr / planning /
 * general-affairs) and the `docs/<topic>-...` habit. Revisit once real PRs show up on screen.
 */
export const BRANCH_PREFIX_RULES: readonly BranchPrefixRule[] = [
  { prefix: 'accounting/', department: '経理' },
  { prefix: 'docs/accounting-', department: '経理' },
  { prefix: 'pr/', department: '広報' },
  { prefix: 'docs/pr-', department: '広報' },
  { prefix: 'planning/', department: '企画' },
  { prefix: 'docs/planning-', department: '企画' },
  { prefix: 'general-affairs/', department: '総務' },
  { prefix: 'docs/general-affairs-', department: '総務' },
];

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A member counts as done when one of their Issues closed within this window. */
export const DONE_WINDOW_MS = 30 * MINUTE_MS;
/** "Recent rewards" counts PRs merged within this window (matches the collector's range). */
export const RECENT_REWARD_WINDOW_MS = 7 * DAY_MS;
/** A snapshot older than this gets the "information is old" mark. */
export const STALE_AFTER_MS = 5 * MINUTE_MS;
/** A gap between baselines longer than this may have lost events (the collector keeps 7 days). */
export const EVENT_GAP_LIMIT_MS = 7 * DAY_MS;
