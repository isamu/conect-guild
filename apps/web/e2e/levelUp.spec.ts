import type { Snapshot } from '@conect-guild/snapshot';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, expectNarration, test, waitForBaseline, waitForRoom } from './fixtures.ts';
import { NOW, sampleSnapshot } from './sampleSnapshot.ts';

/** The collector's next write, a minute after the first (newer than the baseline). */
const LATER = NOW + 60_000;
/** One refresh (5 s) plus room for the scene of the message before. */
const EVENT_TIMEOUT = 20_000;

/** Two more Issues of 経理 completed: みのり goes from 45 (Lv 3) to 65 experience (Lv 4). */
function withMinoriLevel4(snapshot: Snapshot): Snapshot {
  const { history } = snapshot;
  return {
    ...snapshot,
    history: {
      ...history,
      openedIssueCount: history.openedIssueCount + 2,
      completedIssues: [
        ...history.completedIssues,
        { number: 300, departments: ['経理'] },
        { number: 301, departments: ['経理'] },
      ],
    },
  };
}

test('a level-up shows in the message window and on the canvas, not on the first load', async ({
  page,
  snapshotServer,
}) => {
  await page.addInitScript(installCanvasTextRecorder);
  await page.goto('/');
  await waitForBaseline(page);
  await waitForRoom(page);
  const message = page.getByRole('region', { name: 'メッセージ' });
  // The first load only stores the levels: no level-up for anyone.
  await expectNarration(page);
  await expect(message).not.toContainText('あがった');

  snapshotServer.serve(withMinoriLevel4(await sampleSnapshot(LATER)));
  await expect(message).toContainText('みのりは レベル 4 に あがった！', {
    timeout: EVENT_TIMEOUT,
  });
  await expect.poll(() => drawnTexts(page)).toContain('LEVEL UP');
  await expect(
    page.getByRole('region', { name: 'パーティのようす' }).getByRole('listitem').nth(1),
  ).toContainText('Lv 4');
});
