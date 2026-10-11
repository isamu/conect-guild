// Fixed on purpose: the target repository and interval must not be changeable
// from command-line arguments or environment variables (docs/DESIGN.md 4.1).
export const COLLECTOR_CONFIG = {
  repo: 'yukihiroyamaguchi569/conect-management',
  intervalMs: 60_000,
} as const;
