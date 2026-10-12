import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles .vue files so components can be rendered to strings in tests.
  plugins: [vue()],
  test: {
    include: ['apps/web/src/**/*.test.ts', 'apps/web/*.test.ts', 'packages/**/*.test.ts'],
  },
});
