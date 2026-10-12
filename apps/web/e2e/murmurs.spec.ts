import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { LINE_BOOK, SHARED_LINES } from '../src/render/lineBook.ts';

/** Every murmur in the book (render/murmurs.ts): at the desk, idle, at play, dozing, asleep. */
const MURMURS: ReadonlySet<string> = new Set([
  ...Object.values(SHARED_LINES).flat(),
  ...Object.values(LINE_BOOK).flatMap((book) => [
    ...('work' in book ? book.work : []),
    ...('idle' in book ? book.idle : []),
    ...('sleepTalk' in book ? book.sleepTalk : []),
  ]),
]);

/** How much faster the stage clock runs here, so the first murmur (40 s) comes in seconds. */
const SPEED = 10;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installCanvasTextRecorder);
  // The shortest wait between murmurs (render/metrics.ts LINES.murmurGapMinMs).
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  // The stage clock (render/clock.ts) reads performance.now; Date stays fixed (fixtures.ts).
  await page.addInitScript((speed: number) => {
    const real = performance.now.bind(performance);
    performance.now = () => real() * speed;
  }, SPEED);
});

test('someone murmurs on the canvas while nothing happens', async ({ page }) => {
  await page.goto('/');
  await waitForRoom(page);
  await expect
    .poll(async () => (await drawnTexts(page)).filter((text) => MURMURS.has(text)).length, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
});
