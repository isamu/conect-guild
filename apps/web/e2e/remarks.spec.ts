import type { Snapshot } from '@conect-guild/snapshot';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { NOW, sampleSnapshot } from './sampleSnapshot.ts';

/** The collector's next write, a minute after the first. */
const LATER = NOW + 60_000;
/** One refresh (5 s) plus room for the line to be drawn. */
const REMARK_TIMEOUT = 20_000;

/** ささえ's lines (render/lineBook.ts) on starting to wait for a permission. */
const SASAE_PERMISSION = ['いいかしら？', 'まってますね', 'どうかしら？'];
/** みのり's, who waits for a permission in the sample from the start. */
const MINORI_PERMISSION = ['よいですか？', 'きょか、まだ？', 'おうかがいを'];

/** The sample with ささえ's (総務) session now waiting for a permission. */
function withSasaeWaiting(snapshot: Snapshot): Snapshot {
  const { sessions } = snapshot;
  if (sessions.status !== 'ok') throw new Error('the sample has no sessions');
  const members = sessions.members.map((member) =>
    member.department === '総務' ? { ...member, state: 'awaiting-permission' as const } : member,
  );
  return { ...snapshot, sessions: { ...sessions, members } };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installCanvasTextRecorder);
  // Under the chance of a remark (render/metrics.ts LINES.remarkChance), so the line is said.
  await page.addInitScript(() => {
    Math.random = () => 0.1;
  });
});

test('a member who starts waiting for a permission says a line on the canvas', async ({
  page,
  snapshotServer,
}) => {
  await page.goto('/');
  await waitForRoom(page);
  snapshotServer.serve(withSasaeWaiting(await sampleSnapshot(LATER)));
  await expect
    .poll(async () => (await drawnTexts(page)).some((text) => SASAE_PERMISSION.includes(text)), {
      timeout: REMARK_TIMEOUT,
    })
    .toBe(true);
  // みのり was waiting at load: that is not a new wait.
  const texts = await drawnTexts(page);
  expect(texts.filter((text) => MINORI_PERMISSION.includes(text))).toEqual([]);
});

test('nobody says a line for a wait seen on the first load', async ({ page, snapshotServer }) => {
  snapshotServer.serve(withSasaeWaiting(await sampleSnapshot()));
  await page.goto('/');
  await waitForRoom(page);
  // Two more refreshes of the same snapshot (nothing new), then a couple of frames to draw them.
  for (let i = 0; i < 2; i += 1) {
    await page.waitForResponse((response) => new URL(response.url()).pathname === '/snapshot.json');
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  const texts = await drawnTexts(page);
  const waits = [...SASAE_PERMISSION, ...MINORI_PERMISSION];
  expect(texts.filter((text) => waits.includes(text))).toEqual([]);
});
