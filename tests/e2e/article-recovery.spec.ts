import { test, expect } from './fixtures';

test('ARTICLE-LOCAL-007 cloned client IDs retain two isolated recovery choices', async ({
  page,
  context,
  workspace,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const clientId = await page.evaluate(() =>
    sessionStorage.getItem('inkling-draft-client'),
  );
  const second = await context.newPage();
  second.on('dialog', (dialog) => dialog.accept());
  await second.addInitScript((id) => {
    if (id) sessionStorage.setItem('inkling-draft-client', id);
  }, clientId);
  await second.goto(workspace.origin);
  await expect(second.getByLabel('文章标题', { exact: true })).toBeEnabled();
  expect(
    await second.evaluate(() => sessionStorage.getItem('inkling-draft-client')),
  ).not.toBe(clientId);
  for (const [tab, text] of [
    [page, '第一标签的离线思考'],
    [second, '第二标签的独立思考'],
  ] as const) {
    await tab.route('**/api/articles/*/content', (route) =>
      route.abort('failed'),
    );
    await tab
      .getByRole('textbox', { name: '文章正文', exact: true })
      .fill(text);
    await expect(
      tab.getByText('浏览器恢复副本已更新', { exact: true }),
    ).toBeVisible();
  }
  await second.close();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(workspace.origin);
  const panel = reopened.getByRole('region', { name: '待恢复草稿' });
  await expect(
    panel.getByRole('button', { name: '恢复此草稿', exact: true }),
  ).toHaveCount(2);
  await expect(panel).toContainText('第一标签的离线思考');
  await expect(panel).toContainText('第二标签的独立思考');
  await panel
    .locator('.recovery-card')
    .filter({ hasText: '第一标签的离线思考' })
    .getByRole('button', { name: '恢复此草稿' })
    .click();
  await expect(
    reopened.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toHaveText('第一标签的离线思考');
  await expect(panel).not.toBeVisible();
  await expect(reopened.getByText('已保存', { exact: true })).toBeVisible();
  await reopened.reload();
  await expect(
    panel.getByRole('button', { name: '恢复此草稿', exact: true }),
  ).toHaveCount(1);
  await expect(panel).toContainText('第二标签的独立思考');
  await reopened.close();
});

test('ARTICLE-LOCAL-007 an offline draft survives reload and is restored only by choice', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('服务端已保存的起点');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  await editor.fill('断线后产生的新洞见');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/articles/*/content');
  await page.reload();
  await expect(page.getByRole('region', { name: '待恢复草稿' })).toBeVisible();
  await expect(editor).toHaveText('服务端已保存的起点');
  await expect(editor).not.toBeEditable();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(editor).toHaveText('断线后产生的新洞见');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toHaveText('断线后产生的新洞见');
  await expect(
    page.getByRole('region', { name: '待恢复草稿' }),
  ).not.toBeVisible();
});
