import { describe, expect, it } from 'vitest';
import { COLLECTOR_CONFIG } from '../collector.config.ts';
import { parseCliArgs } from './args.ts';
import { runCollector, type RunDeps } from './run.ts';

function fakeDeps(): RunDeps & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    now: () => new Date('2026-10-12T00:00:00.000Z'),
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
  };
}

describe('COLLECTOR_CONFIG', () => {
  it('targets the fixed repository every 60 seconds', () => {
    expect(COLLECTOR_CONFIG.repo).toBe('yukihiroyamaguchi569/conect-management');
    expect(COLLECTOR_CONFIG.intervalMs).toBe(60_000);
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

describe('runCollector', () => {
  it('--once logs counts and time only, and exits 0', () => {
    const deps = fakeDeps();
    expect(runCollector(['--once'], deps)).toBe(0);
    expect(deps.logs).toEqual([
      '[collector] 2026-10-12T00:00:00.000Z once: issues=0 prs=0 (M0: GitHub not contacted)',
    ]);
    expect(deps.errors).toEqual([]);
  });

  it('continuous mode is not implemented yet and exits non-zero', () => {
    const deps = fakeDeps();
    expect(runCollector([], deps)).toBe(1);
    expect(deps.logs).toEqual([]);
    expect(deps.errors).toHaveLength(1);
  });

  it('unknown arguments exit non-zero without echoing them', () => {
    const deps = fakeDeps();
    expect(runCollector(['--repo', 'other/repo'], deps)).toBe(2);
    expect(deps.logs).toEqual([]);
    expect(deps.errors.join('\n')).not.toContain('other/repo');
  });
});
