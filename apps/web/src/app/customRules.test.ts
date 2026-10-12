import { describe, expect, it, vi } from 'vitest';
import { T0, at, pr, snapshot } from '../domain/fixtures.test-util';
import { buildParty } from './guildView';

// Another team's rule change paths: none of the conect.llc defaults.
vi.mock('@conect-guild/snapshot/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@conect-guild/snapshot/settings')>();
  const ruleChangePaths = [{ match: 'prefix', path: 'policy/' }] as const;
  return {
    ...original,
    GUILD_SETTINGS: original.checkGuildSettings({ ...original.GUILD_SETTINGS, ruleChangePaths }),
  };
});

describe('the king with custom rule change paths', () => {
  it('waits for a PR under the configured path and explains it without the default paths', () => {
    const snap = snapshot({ prs: [pr(1, { changedFiles: ['policy/a.md'] })] });
    const king = buildParty(snap, at(T0)).at(-1);
    expect(king?.state).toBe('awaiting-president');
    expect(king?.tooltip).toBe('ルールを変える PR は社長がマージします');
  });

  it('does not wait for a CLAUDE.md change', () => {
    const snap = snapshot({ prs: [pr(1, { changedFiles: ['CLAUDE.md'] })] });
    expect(buildParty(snap, at(T0)).at(-1)?.state).toBe('idle');
  });
});
