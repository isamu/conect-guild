import { STALE_AFTER_MS } from '../guild.config';

/** True when the snapshot's `fetchedAt` is more than `staleAfterMs` before `now` (epoch ms). */
export function isSnapshotStale(
  fetchedAt: string,
  now: number,
  staleAfterMs: number = STALE_AFTER_MS,
): boolean {
  return now - Date.parse(fetchedAt) > staleAfterMs;
}
