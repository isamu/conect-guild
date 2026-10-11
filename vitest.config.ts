import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/web/src/**/*.test.ts', 'apps/web/*.test.ts', 'packages/**/*.test.ts'],
  },
});
