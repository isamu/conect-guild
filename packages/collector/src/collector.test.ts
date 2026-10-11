import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLLECTOR_CONFIG } from '../collector.config.ts';
import { parseCliArgs } from './args.ts';

describe('COLLECTOR_CONFIG', () => {
  it('targets the fixed repository every 60 seconds', () => {
    expect(COLLECTOR_CONFIG.repo).toBe('yukihiroyamaguchi569/conect-management');
    expect(COLLECTOR_CONFIG.intervalMs).toBe(60_000);
  });

  it('writes to apps/web/.data/snapshot.json resolved from the repository root', () => {
    expect(COLLECTOR_CONFIG.snapshotPath).toBe(
      fileURLToPath(new URL('../../../apps/web/.data/snapshot.json', import.meta.url)),
    );
  });
});

describe('parseCliArgs', () => {
  it('returns once for exactly --once', () => {
    expect(parseCliArgs(['--once'])).toBe('once');
  });

  it('returns loop with no arguments', () => {
    expect(parseCliArgs([])).toBe('loop');
  });

  it.each([
    [['--once', '--once']],
    [['--repo', 'other/repo']],
    [['--once', 'extra']],
    [['once']],
    [['--ONCE']],
  ])('rejects %j', (args) => {
    expect(parseCliArgs(args)).toBe('invalid');
  });
});
