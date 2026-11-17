import { test, expect } from './fixtures';

test('REVISION-HISTORY-001 saves and names the clicked draft; REVISION-COMPARE-002 compares without changing the editor', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('独立思考的第一稿');
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await panel.getByLabel('版本名称', { exact: true }).fill('观点形成');
  await panel
    .getByRole('button', { name: '保存并命名当前稿', exact: true })
    .click();
  await expect(panel.getByRole('status')).toContainText('已命名版本 #2');
  await expect(
    panel.getByRole('listitem').filter({ hasText: '观点形成' }),
  ).toHaveCount(1);
  await editor.press('ControlOrMeta+a');
  await page.getByRole('button', { name: '加粗', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await panel.getByLabel('所有保存记录', { exact: true }).check();
  await panel.getByRole('button', { name: '刷新历史', exact: true }).click();
  await panel
    .getByLabel('比较左侧版本')
    .selectOption({ label: '#2 · 观点形成' });
  await panel.getByLabel('比较右侧版本').selectOption({ label: '#3' });
  await panel
    .getByRole('button', { name: '比较所选版本', exact: true })
    .click();
  await expect(panel.getByText(/格式或结构变化/)).toBeVisible();
  await expect(editor.locator('strong')).toHaveText('独立思考的第一稿');
  await editor.fill('比较期间继续写作的新判断');
  await expect(editor).toHaveText('比较期间继续写作的新判断');
  await panel.screenshot({ path: 'test-results/revisions-desktop.png' });
  await page.setViewportSize({ width: 375, height: 900 });
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: 'test-results/revisions-mobile.png' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('REVISION-HISTORY-001 a lost naming response retries the same revision and does not include later typing', async ({
  page,
}) => {
  let first = true;
  const ids: string[] = [];
  await page.route('**/api/articles/*/revisions/*/name', async (route) => {
    ids.push(route.request().postDataJSON().mutationId as string);
    const response = await route.fetch();
    if (first) {
      first = false;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('命名时的内容');
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await panel.getByLabel('版本名称', { exact: true }).fill('固定版本');
  await panel
    .getByRole('button', { name: '保存并命名当前稿', exact: true })
    .click();
  await expect(
    panel.getByRole('button', { name: '重试命名', exact: true }),
  ).toBeVisible();
  await editor.fill('命名后继续写的内容');
  await panel.getByRole('button', { name: '重试命名', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('已命名版本 #2');
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(editor).toHaveText('命名后继续写的内容');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toHaveText('命名后继续写的内容');
});
