/**
 * Like Promise.all over `items.map(fn)`, but with at most `limit` calls in flight.
 * Results keep the order of `items`; the first rejection rejects the whole call.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  // One iterator shared by all workers hands each item to exactly one of them.
  const entries = items.entries();
  async function worker(): Promise<void> {
    for (const [index, item] of entries) {
      results[index] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
