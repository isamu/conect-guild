import { expect, expectNarration, test, waitForBaseline } from './fixtures.ts';
import { NOW, sampleSnapshot, withClosedIssues } from './sampleSnapshot.ts';

/** The collector's next write, a minute after the first (newer than the baseline). */
const LATER = NOW + 60_000;
/** One refresh (5 s) plus room for a scene that holds the next message. */
const EVENT_TIMEOUT = 20_000;

test('closing an Issue shows 「クリアした！」', async ({ page, snapshotServer }) => {
  await page.goto('/');
  await waitForBaseline(page);
  const message = page.getByRole('region', { name: 'メッセージ' });
  await expectNarration(page);

  snapshotServer.serve(withClosedIssues(await sampleSnapshot(LATER), [101], LATER));
  await expect(message).toContainText(
    'みのりは クエスト#101「架空商事への請求書を作る」を クリアした！',
    { timeout: EVENT_TIMEOUT },
  );
  await expect(page.getByRole('region', { name: 'クエスト掲示板' })).not.toContainText('#101');
});

test('a click on the message window goes to the next message, then closes it', async ({
  page,
  snapshotServer,
}) => {
  await page.goto('/');
  await waitForBaseline(page);
  const message = page.getByRole('region', { name: 'メッセージ' });

  snapshotServer.serve(withClosedIssues(await sampleSnapshot(LATER), [101, 102], LATER));
  await expect(message).toContainText('クエスト#101', { timeout: EVENT_TIMEOUT });
  await page.getByRole('button', { name: 'つぎへ（あと 1 件）' }).click();
  await expect(message).toContainText(
    'ひびきは クエスト#102「秋のお知らせ記事を書く」を クリアした！',
    {
      timeout: EVENT_TIMEOUT,
    },
  );
  await page.getByRole('button', { name: 'とじる' }).click();
  // Closed: the event message is gone and the window goes back to the narration.
  await expect(message).not.toContainText('クエスト#102');
  await expectNarration(page);
});
