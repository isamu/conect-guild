import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './limit.ts';

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('mapWithConcurrency', () => {
  it('never runs more than the limit at once and keeps the order', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const result = await mapWithConcurrency(items, 4, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // Later items finish first to prove the order is kept.
      for (let i = 0; i < 20 - n; i += 1) await tick();
      inFlight -= 1;
      return n * 2;
    });
    expect(result).toEqual(items.map((n) => n * 2));
    expect(peak).toBe(4);
  });

  it('returns [] for no items without calling fn', async () => {
    let calls = 0;
    await expect(
      mapWithConcurrency([], 4, () => {
        calls += 1;
        return Promise.resolve(0);
      }),
    ).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  it('rejects when any call rejects', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, (n) =>
        n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(n),
      ),
    ).rejects.toThrow('boom');
  });
});
