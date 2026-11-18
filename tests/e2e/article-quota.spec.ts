import { openRevisionMenu } from './revision-menu';
import { test, expect } from './fixtures';
test.use({
  autoCreateArticle: false,
  serverEntry: 'tests/fixtures/storage-server.ts',
  serverEnv: { TEST_STORAGE_MODE: 'quota' },
});
test('ARTICLE-QUOTA-013 warns before the limit and retains refused input and named history', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await expect(editor).toBeEditable();
  await editor.fill('第一份需要保留的技术判断'.repeat(5));
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: '历史容量' })).toContainText(
    '历史占用较多',
  );
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await openRevisionMenu(panel, 2);
  await panel.getByRole('button', { name: '命名版本 #2', exact: true }).click();
  await panel.getByLabel('版本名称', { exact: true }).fill('保留的命名版');
  await panel.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('已命名版本 #2');
  await editor.fill('新的判断'.repeat(200));
  await expect(page.getByText(/历史容量已达上限/)).toBeVisible();
  await expect(editor).toHaveText('新的判断'.repeat(200));
  await expect(page.getByText('已保存', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: '关闭版本历史' }).click();
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  await expect(panel.locator('.revision-list > li')).toHaveCount(2);
  await expect(panel).toContainText('保留的命名版');
  await page
    .getByRole('status', { name: '历史容量' })
    .screenshot({ path: 'test-results/history-capacity.png' });
});
