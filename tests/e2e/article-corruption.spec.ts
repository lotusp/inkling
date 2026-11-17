import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
test.use({
  autoCreateArticle: false,
  serverEntry: 'tests/fixtures/storage-server.ts',
  serverEnv: { TEST_STORAGE_MODE: 'corrupt' },
});
test('ARTICLE-CORRUPT-012 offers only verified old revision downloads while the damaged current draft stays blocked', async ({
  page,
}) => {
  const panel = page.getByRole('region', { name: '损坏稿件救援' });
  await expect(panel).toBeVisible();
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await expect(editor).not.toBeEditable();
  await panel
    .getByRole('button', { name: '查看可救援版本', exact: true })
    .click();
  await panel.getByRole('button', { name: '下载版本 #3', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('校验失败');
  const downloading = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载版本 #2', exact: true }).click();
  const download = await downloading,
    path = await download.path();
  expect(path).not.toBeNull();
  const data = JSON.parse(await readFile(path!, 'utf8')) as {
    format: string;
    document: { title: string };
    seq: number;
  };
  expect(data).toMatchObject({
    format: 'inkling-verified-revision',
    seq: 2,
    document: { title: '可以救援的旧稿' },
  });
  await panel.screenshot({ path: 'test-results/damaged-article-desktop.png' });
  await page.setViewportSize({ width: 375, height: 900 });
  await panel.screenshot({ path: 'test-results/damaged-article-mobile.png' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(editor).toBeEmpty();
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(editor).toBeEmpty();
});
