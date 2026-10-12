import { expect, test, waitForRoom } from './fixtures.ts';

/**
 * Cumulative levels (Issue #19) from the sample's history: 経理 45, 広報 25, 企画 25, 総務 35 and
 * かなめ 24 scrolls × 3 + 2 clears with no department × 10 = 92 experience.
 */
test('the party window shows each level with its gauge, and おうさま for the king', async ({
  page,
}) => {
  await page.goto('/');
  const party = page.getByRole('region', { name: 'パーティのようす' });
  const rows = party.getByRole('listitem');
  await expect(rows).toHaveCount(6);
  const expected = ['Lv 4', 'Lv 3', 'Lv 2', 'Lv 2', 'Lv 3', 'おうさま'];
  for (const [i, label] of expected.entries()) await expect(rows.nth(i)).toContainText(label);
  // 成果 stays beside the level.
  await expect(rows.nth(1)).toContainText('成果 0');

  // A gauge for everyone but the king: 経理 is halfway from Lv 3 (30) to Lv 4 (60).
  const gauges = party.getByRole('meter', { name: 'つぎのレベルまで' });
  await expect(gauges).toHaveCount(5);
  await expect(gauges.nth(1)).toHaveAttribute('aria-valuenow', '50');
  await expect(rows.nth(5).getByRole('meter')).toHaveCount(0);

  // The breakdown is in the tooltip: counts only.
  await expect(rows.nth(1).getByText('Lv 3')).toHaveAttribute(
    'title',
    'けいけんち 45・つぎのレベルまで 15（クリア 3 件・マージ 3 件）',
  );
  await expect(rows.nth(0).getByText('Lv 4')).toHaveAttribute(
    'title',
    'けいけんち 92・つぎのレベルまで 8（受付の巻物 24 件・担当なしのクリア 2 件）',
  );
});

test('the levels do not make the party column taller than the room keeps free', async ({
  page,
}) => {
  // At 1024 px wide the stage is the canvas's logical size (render/map.ts WINDOW_EXTENTS: 340).
  await page.setViewportSize({ width: 1024, height: 576 });
  await page.goto('/');
  await waitForRoom(page);
  // The fetch status sits under the party window: its bottom is the column's.
  const side = await page.getByRole('region', { name: '取得のようす' }).boundingBox();
  if (side === null) throw new Error('the fetch status has no box');
  expect(side.y + side.height).toBeLessThanOrEqual(340);
});
