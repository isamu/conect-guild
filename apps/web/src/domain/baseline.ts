import { z } from 'zod';
import type { Snapshot } from '@conect-guild/snapshot';

/** Bump when the stored shape changes; a stored baseline with another version counts as absent. */
export const BASELINE_SCHEMA_VERSION = 1;

const isoDateTime = z.iso.datetime({ offset: true });
const state = z.enum(['open', 'closed']);
const issueNumber = z.number().int().positive();

/**
 * The diff baseline kept in localStorage. Numbers, states and times only: no titles, labels or
 * branch names, because Issue titles can carry client names.
 */
export const baselineSchema = z.strictObject({
  schemaVersion: z.literal(BASELINE_SCHEMA_VERSION),
  fetchedAt: isoDateTime,
  issues: z.array(z.strictObject({ number: issueNumber, state, closedAt: isoDateTime.nullable() })),
  prs: z.array(z.strictObject({ number: issueNumber, state, mergedAt: isoDateTime.nullable() })),
});

export type Baseline = z.infer<typeof baselineSchema>;

/** Validates a value read from storage. Anything malformed or from another version → null. */
export function parseBaseline(value: unknown): Baseline | null {
  const result = baselineSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function toBaseline(snapshot: Snapshot): Baseline {
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    fetchedAt: snapshot.fetchedAt,
    issues: snapshot.issues.map(({ number, state, closedAt }) => ({ number, state, closedAt })),
    prs: snapshot.prs.map(({ number, state, mergedAt }) => ({ number, state, mergedAt })),
  };
}
