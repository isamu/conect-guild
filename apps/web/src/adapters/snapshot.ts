import { SNAPSHOT_SCHEMA_VERSION, snapshotSchema, type Snapshot } from '@conect-guild/snapshot';
import { z } from 'zod';

/** Why a snapshot could not be loaded. The adapter never throws; it returns one of these. */
export type SnapshotLoadFailure =
  'network' | 'timeout' | 'http' | 'parse' | 'schema-version' | 'invalid';

export type SnapshotLoadResult =
  | { readonly ok: true; readonly snapshot: Snapshot }
  | { readonly ok: false; readonly reason: 'http'; readonly status: number }
  | { readonly ok: false; readonly reason: Exclude<SnapshotLoadFailure, 'http'> };

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface LoadSnapshotOptions {
  /** Defaults to {@link defaultSnapshotUrl}. */
  readonly url?: string;
  /** Defaults to the global fetch. Injected by tests. */
  readonly fetchFn?: FetchFn;
  /** Covers both the request and reading the body. */
  readonly timeoutMs?: number;
}

export const DEFAULT_SNAPSHOT_TIMEOUT_MS = 10_000;

/**
 * The dev server serves the real data at /snapshot.json (vite-plugin-snapshot.ts).
 * A production build only ever reads the fictional sample (docs/DESIGN.md 5).
 */
export function defaultSnapshotUrl(): string {
  const file = import.meta.env.DEV ? 'snapshot.json' : 'snapshot.sample.json';
  return `${import.meta.env.BASE_URL}${file}`;
}

const versionProbeSchema = z.looseObject({ schemaVersion: z.number() });

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

/** Validates already-parsed JSON. Exported for tests and for callers that read JSON elsewhere. */
export function validateSnapshot(value: unknown): SnapshotLoadResult {
  const probe = versionProbeSchema.safeParse(value);
  if (probe.success && probe.data.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema-version' };
  }
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? { ok: true, snapshot: parsed.data } : { ok: false, reason: 'invalid' };
}

async function fetchText(
  url: string,
  fetchFn: FetchFn,
  signal: AbortSignal,
): Promise<{ ok: true; text: string } | Exclude<SnapshotLoadResult, { ok: true }>> {
  const failure = () => ({ ok: false, reason: signal.aborted ? 'timeout' : 'network' }) as const;
  let response: Response;
  try {
    response = await fetchFn(url, { cache: 'no-store', signal });
  } catch {
    return failure();
  }
  if (!response.ok) return { ok: false, reason: 'http', status: response.status };
  try {
    return { ok: true, text: await response.text() };
  } catch {
    return failure();
  }
}

/** Fetches the snapshot with no-store and a timeout, then validates it. Never throws. */
export async function loadSnapshot(options: LoadSnapshotOptions = {}): Promise<SnapshotLoadResult> {
  const url = options.url ?? defaultSnapshotUrl();
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS);
  try {
    const fetched = await fetchText(url, fetchFn, controller.signal);
    if (!fetched.ok) return fetched;
    const json = parseJson(fetched.text);
    return json.ok ? validateSnapshot(json.value) : { ok: false, reason: 'parse' };
  } finally {
    clearTimeout(timer);
  }
}
