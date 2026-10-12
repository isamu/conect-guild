import { defineConfig, devices } from '@playwright/test';

/** A port of its own, so the tests never meet a dev server already running (5173 etc.). */
const PORT = 5196;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const ON_CI = process.env.CI !== undefined;

export default defineConfig({
  testDir: './e2e',
  // All tests share one dev server and one .data/snapshot.json, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: ON_CI,
  retries: ON_CI ? 1 : 0,
  reporter: ON_CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/globalSetup.ts',
  globalTeardown: './e2e/globalTeardown.ts',
  use: {
    baseURL: BASE_URL,
    headless: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The host stays 127.0.0.1 from vite.config.ts; never pass --host.
    command: `npx vite --port ${String(PORT)} --strictPort`,
    cwd: import.meta.dirname,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
