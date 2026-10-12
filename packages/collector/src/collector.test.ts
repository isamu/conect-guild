import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLLECTOR_CONFIG, expandHome } from '../collector.config.ts';
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

describe('COLLECTOR_CONFIG.sessions', () => {
  it('fixes the five company directories under the home directory', () => {
    const root = `${homedir()}/conect-management`;
    expect(COLLECTOR_CONFIG.sessions.seats).toEqual([
      { department: null, cwd: root },
      { department: '経理', cwd: `${root}/accounting` },
      { department: '広報', cwd: `${root}/pr` },
      { department: '企画', cwd: `${root}/planning` },
      { department: '総務', cwd: `${root}/general-affairs` },
    ]);
  });

  it('reads MulmoTerminal files every 5 seconds', () => {
    expect(COLLECTOR_CONFIG.sessions.intervalMs).toBe(5_000);
    expect(COLLECTOR_CONFIG.sessions.cwdLogPath).toBe(
      `${homedir()}/.mulmoterminal/dev-terminal-cwds.json`,
    );
    expect(COLLECTOR_CONFIG.sessions.activityStatePath).toBe(
      `${homedir()}/.mulmoterminal/activity-state.json`,
    );
  });
});

describe('expandHome', () => {
  it.each([
    ['~', '/home/me'],
    ['~/conect-management', '/home/me/conect-management'],
    ['~/a/b c', '/home/me/a/b c'],
    ['/srv/company', '/srv/company'],
    ['/srv/~/x', '/srv/~/x'],
  ])('turns %j into %j', (dir, expected) => {
    expect(expandHome(dir, '/home/me')).toBe(expected);
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
