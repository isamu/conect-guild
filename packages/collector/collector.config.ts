import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SessionDepartment } from '@conect-guild/snapshot';

/** Where a company session is started: the directory MulmoTerminal records for its grid cell. */
export interface CompanySeat {
  /** null is かなめ (the 司令塔). */
  readonly department: SessionDepartment | null;
  readonly cwd: string;
}

const HOME = homedir();
const COMPANY_ROOT = join(HOME, 'conect-management');
const MULMOTERMINAL_HOME = join(HOME, '.mulmoterminal');

// Fixed on purpose: the target repository, the company sessions, intervals and paths must not be
// changeable from command-line arguments or environment variables (docs/DESIGN.md 4.1, 4.7).
export const COLLECTOR_CONFIG = {
  repo: 'yukihiroyamaguchi569/conect-management',
  intervalMs: 60_000,
  // Outside apps/web/public so real data never enters a build (docs/DESIGN.md 5).
  snapshotPath: resolve(import.meta.dirname, '../../apps/web/.data/snapshot.json'),
  sessions: {
    intervalMs: 5_000,
    seats: [
      { department: null, cwd: COMPANY_ROOT },
      { department: '経理', cwd: join(COMPANY_ROOT, 'accounting') },
      { department: '広報', cwd: join(COMPANY_ROOT, 'pr') },
      { department: '企画', cwd: join(COMPANY_ROOT, 'planning') },
      { department: '総務', cwd: join(COMPANY_ROOT, 'general-affairs') },
    ] satisfies readonly CompanySeat[],
    // MulmoTerminal's own files. Read only: never written or locked.
    cwdLogPath: join(MULMOTERMINAL_HOME, 'dev-terminal-cwds.json'),
    activityStatePath: join(MULMOTERMINAL_HOME, 'activity-state.json'),
  },
} as const;
