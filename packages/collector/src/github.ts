import { z } from 'zod';
import { ghApiAll, parseOrThrow, type GhRunner } from './gh.ts';

// Only the fields the snapshot needs are kept; zod strips everything else.
const rawIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  labels: z.array(z.object({ name: z.string() })),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  closed_at: z.iso.datetime().nullable(),
  // Present only on pull requests mixed into the issues list.
  pull_request: z.unknown().optional(),
});

const rawPrSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  // Read only to find linked issue numbers; never stored.
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  merged_at: z.iso.datetime().nullable(),
  closed_at: z.iso.datetime().nullable(),
  head: z.object({ ref: z.string() }),
});

const rawFileSchema = z.object({ filename: z.string() });

export type RawIssue = z.infer<typeof rawIssueSchema>;
export type RawPr = z.infer<typeof rawPrSchema>;

const PER_PAGE = 'per_page=100';

/** Open issues (all) plus closed issues updated since `since` (PRs still included). */
export async function fetchIssues(gh: GhRunner, repo: string, since: Date): Promise<RawIssue[]> {
  const sinceParam = encodeURIComponent(since.toISOString());
  const [open, closed] = await Promise.all([
    ghApiAll(gh, `repos/${repo}/issues?state=open&${PER_PAGE}`),
    ghApiAll(gh, `repos/${repo}/issues?state=closed&since=${sinceParam}&${PER_PAGE}`),
  ]);
  return parseOrThrow(z.array(rawIssueSchema), [...open, ...closed]);
}

/** Every open PR and every closed PR (the pulls API has no `since`). */
export async function fetchPrs(gh: GhRunner, repo: string): Promise<RawPr[]> {
  const [open, closed] = await Promise.all([
    ghApiAll(gh, `repos/${repo}/pulls?state=open&${PER_PAGE}`),
    ghApiAll(gh, `repos/${repo}/pulls?state=closed&sort=updated&direction=desc&${PER_PAGE}`),
  ]);
  return parseOrThrow(z.array(rawPrSchema), [...open, ...closed]);
}

/** Paths of the files a PR changes (never the diff itself). */
export async function fetchChangedFiles(
  gh: GhRunner,
  repo: string,
  prNumber: number,
): Promise<string[]> {
  const files = await ghApiAll(gh, `repos/${repo}/pulls/${String(prNumber)}/files?${PER_PAGE}`);
  return parseOrThrow(z.array(rawFileSchema), files).map((file) => file.filename);
}
