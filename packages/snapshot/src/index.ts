import { z } from 'zod';

/** Bump when the snapshot shape changes; the web app refuses other versions. */
export const SNAPSHOT_SCHEMA_VERSION = 2;

const isoDateTime = z.iso.datetime({ offset: true });

export const snapshotIssueSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string(),
  labels: z.array(z.string()),
  state: z.enum(['open', 'closed']),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  closedAt: isoDateTime.nullable(),
});

export const snapshotPrSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  mergedAt: isoDateTime.nullable(),
  closedAt: isoDateTime.nullable(),
  headRef: z.string(),
  linkedIssues: z.array(z.number().int().positive()),
  // Paths only, and only for open PRs; closed PRs carry [].
  changedFiles: z.array(z.string()),
});

/** Departments that have a session of their own. かなめ (the 司令塔) is `null`. */
export const SESSION_DEPARTMENTS = ['経理', '広報', '企画', '総務'] as const;

/**
 * What a company session is doing right now, read from MulmoTerminal (docs/DESIGN.md 4.7):
 * awaiting-permission (asks to use a tool), working (in a turn), resting (finished a turn),
 * idle (nothing recorded).
 */
export const sessionStateSchema = z.enum(['awaiting-permission', 'working', 'resting', 'idle']);

export const snapshotSessionSchema = z.strictObject({
  department: z.enum(SESSION_DEPARTMENTS).nullable(),
  state: sessionStateSchema,
});

/**
 * The company sessions. Only the department and the state: no MulmoTerminal ids, no paths.
 * `checkedAt` is when the collector read them; it moves every few seconds, unlike `fetchedAt`.
 */
export const snapshotSessionsSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    checkedAt: isoDateTime,
    // Exactly one entry for かなめ and each department: the collector always writes all five.
    members: z
      .array(snapshotSessionSchema)
      .length(SESSION_DEPARTMENTS.length + 1)
      .refine(
        (members) => new Set(members.map((m) => m.department)).size === members.length,
        'one entry per department',
      ),
  }),
  z.strictObject({ status: z.literal('unavailable'), checkedAt: isoDateTime }),
]);

/** The GitHub part, written at most once a minute. `fetchedAt` is the time of that fetch. */
export const githubPartSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  fetchedAt: isoDateTime,
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  issues: z.array(snapshotIssueSchema),
  prs: z.array(snapshotPrSchema),
});

export const snapshotSchema = z.strictObject({
  ...githubPartSchema.shape,
  sessions: snapshotSessionsSchema,
});

export type SnapshotIssue = z.infer<typeof snapshotIssueSchema>;
export type SnapshotPr = z.infer<typeof snapshotPrSchema>;
export type SessionDepartment = (typeof SESSION_DEPARTMENTS)[number];
export type SessionState = z.infer<typeof sessionStateSchema>;
export type SnapshotSession = z.infer<typeof snapshotSessionSchema>;
export type SnapshotSessions = z.infer<typeof snapshotSessionsSchema>;
export type GithubPart = z.infer<typeof githubPartSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
