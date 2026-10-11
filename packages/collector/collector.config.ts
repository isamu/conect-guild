import { resolve } from 'node:path';

// Fixed on purpose: the target repository, interval and output path must not be
// changeable from command-line arguments or environment variables (docs/DESIGN.md 4.1).
export const COLLECTOR_CONFIG = {
  repo: 'yukihiroyamaguchi569/conect-management',
  intervalMs: 60_000,
  // Outside apps/web/public so real data never enters a build (docs/DESIGN.md 5).
  snapshotPath: resolve(import.meta.dirname, '../../apps/web/.data/snapshot.json'),
} as const;
