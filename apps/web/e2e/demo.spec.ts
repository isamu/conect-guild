// The demo mode (Issue #49) on its own: not the shared fixtures, which serve /snapshot.json and
// expect it to be read. Here any request for it fails the test.
import { expect, test } from '@playwright/test';
import { installFakeAudio } from './fakeAudio.ts';

/** The first scroll is handed out about 5 s after はじめる (domain/demoScript.ts). */
const FIRST_EVENT_TIMEOUT = 15_000;

test('?demo=1 plays the fictional script with sound, never reading /snapshot.json', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`page: ${error.message}`);
  });
  // Answered here (never by the dev server, which would read apps/web/.data) and counted.
  const snapshotRequests: string[] = [];
  await context.route('**/snapshot*.json', (route) => {
    snapshotRequests.push(route.request().url());
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(installFakeAudio);

  await page.goto('/?demo=1');
  const start = page.getByRole('button', { name: '▶ はじめる' });
  await expect(start).toBeVisible();
  const fetchStatus = page.getByRole('region', { name: '取得のようす' });
  await expect(fetchStatus).toContainText('デモ（架空のデータ）');
  await expect(fetchStatus).not.toContainText('情報が古い');

  await start.click();
  await expect(start).toBeHidden();
  const message = page.getByRole('region', { name: 'メッセージ' });
  await expect(message).toContainText('「10 月分の請求書を作る」', {
    timeout: FIRST_EVENT_TIMEOUT,
  });
  await expect(page.getByRole('region', { name: 'クエスト掲示板' })).toContainText(
    '10 月分の請求書を作る',
  );
  // The click let the browser play: the scroll's sound rang.
  await expect.poll(() => page.evaluate(() => window.e2eStartedTones)).toBeGreaterThan(0);

  // Nothing of the demo is kept in localStorage.
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter((key) => key.startsWith('conect-guild:'))).toEqual([]);
  await expect(fetchStatus).not.toContainText('情報が古い');
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});
