import { z } from 'zod';

/** Bump when the snapshot shape changes; the web app refuses other versions. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

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

export const snapshotSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  fetchedAt: isoDateTime,
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  issues: z.array(snapshotIssueSchema),
  prs: z.array(snapshotPrSchema),
});

export type SnapshotIssue = z.infer<typeof snapshotIssueSchema>;
export type SnapshotPr = z.infer<typeof snapshotPrSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
