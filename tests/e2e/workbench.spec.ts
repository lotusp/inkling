import { test, expect } from './fixtures';
test('WORKBENCH-START-001 opens the workbench with real service status', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '写作工作台' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('本地服务已连接');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'test-results/workbench-desktop.png',
    fullPage: true,
  });
});
test('WORKBENCH-EDIT-004 edits Chinese text and basic formatting and preserves it after reload', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: '文章正文' });
  await page.getByLabel('文章标题').fill('我的第一篇技术文章');
  await editor.fill('从一次具体的技术选择开始。');
  await page.getByRole('button', { name: '二级标题', exact: true }).click();
  await expect(editor.locator('h2')).toContainText('技术选择');
  await page.getByRole('button', { name: '二级标题', exact: true }).click();
  await editor.press('ControlOrMeta+A');
  await page.getByRole('button', { name: '加粗', exact: true }).click();
  await expect(editor.locator('strong')).toContainText('技术选择');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('文章标题')).toHaveValue('我的第一篇技术文章');
  await expect(
    page.getByRole('textbox', { name: '文章正文' }).locator('strong'),
  ).toContainText('技术选择');
});
test('WORKBENCH-EDIT-004 composition events do not submit or reset text', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: '文章正文' });
  await editor.click();
  await editor.dispatchEvent('compositionstart', { data: '' });
  await page.keyboard.insertText('中文输入过程');
  await editor.dispatchEvent('compositionend', { data: '中文输入过程' });
  await expect(editor).toContainText('中文输入过程');
});
test('WORKBENCH-CHAT-005 focus mode keeps text and never enables AI sending', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: '文章正文' });
  await editor.fill('保留我的判断。');
  await expect(page.getByRole('button', { name: '发送消息' })).toBeDisabled();
  await expect(page.getByText('AI 尚未接入', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '专注写作' }).click();
  await expect(
    page.getByRole('complementary', { name: '写作讨论' }),
  ).toBeHidden();
  await page.getByRole('button', { name: '显示讨论' }).click();
  await expect(
    page.getByRole('complementary', { name: '写作讨论' }),
  ).toBeVisible();
  await expect(editor).toContainText('保留我的判断');
});
for (const kind of ['network', 'invalid'] as const) {
  test(`WORKBENCH-HEALTH-006 handles ${kind} failure and retry without losing draft`, async ({
    page,
  }) => {
    await page.route('**/api/health', (route) =>
      kind === 'network'
        ? route.abort()
        : route.fulfill({ json: { status: 'ok' } }),
    );
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText('本地服务未连接');
    const editor = page.getByRole('textbox', { name: '文章正文' });
    await editor.fill('状态变化不能覆盖这句话。');
    await page.unroute('**/api/health');
    await page.getByRole('button', { name: '重新连接' }).click();
    await expect(page.getByRole('status')).toContainText('本地服务已连接');
    await expect(editor).toContainText('状态变化不能覆盖这句话');
  });
}
test('WORKBENCH-EDIT-004 fits narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: '文章正文' })).toBeVisible();
  await page.screenshot({
    path: 'test-results/workbench-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('WORKBENCH-EDIT-004 supports lists and code blocks', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: '文章正文' });
  await editor.fill('const insight = true;');
  await page.getByRole('button', { name: '无序列表', exact: true }).click();
  await expect(editor.locator('ul li')).toContainText('const insight');
  await page.getByRole('button', { name: '无序列表', exact: true }).click();
  await page.getByRole('button', { name: '代码块', exact: true }).click();
  await expect(editor.locator('pre code')).toHaveText('const insight = true;');
});
