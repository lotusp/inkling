import { test, expect } from './fixtures';

for (const field of ['文章标题', '文章正文']) {
  test(`ARTICLE-RACE-005 ${field} composition survives a late acknowledgement without submitting candidates`, async ({
    page,
  }) => {
    let release = () => {};
    let arrived = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    let writes = 0;
    await page.route('**/api/articles/*/content', async (route) => {
      writes++;
      const response = await route.fetch();
      if (writes === 1) {
        arrived();
        await gate;
      }
      await route.fulfill({ response });
    });
    const input = page.getByRole('textbox', { name: field, exact: true });
    await input.fill('提交前的观点');
    await waiting;
    await page.clock.install();
    await input.focus();
    await input.dispatchEvent('compositionstart', { data: '' });
    await page.keyboard.insertText('候选中的判断');
    const acknowledged = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        /\/api\/articles\/[^/]+$/.test(r.url()),
    );
    release();
    await acknowledged;
    await page.clock.runFor(1600);
    await input.press('ControlOrMeta+s');
    await page.request.get('/api/workspace');
    expect(writes).toBe(1);
    await expect(input).toBeFocused();
    await expect(page.getByText('已保存', { exact: true })).not.toBeVisible();
    if (field === '文章标题') await expect(input).toHaveValue(/候选中的判断/);
    else await expect(input).toContainText('候选中的判断');
    await input.dispatchEvent('compositionend', { data: '候选中的判断' });
    await page.clock.runFor(1600);
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    expect(writes).toBe(2);
    await page.reload();
    if (field === '文章标题') await expect(input).toHaveValue(/候选中的判断/);
    else await expect(input).toContainText('候选中的判断');
  });
}

test('ARTICLE-LOCAL-007 stopped service explains refresh limitation while preserving input', async ({
  page,
  workspace,
}) => {
  page.on('dialog', (d) => d.accept());
  await workspace.stop();
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('服务停止后继续保留的判断');
  await expect(
    page.getByText(/服务停止期间刷新页面无法打开工作台/),
  ).toBeVisible();
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page
    .locator('.writing-sheet')
    .screenshot({ path: 'test-results/ime-offline-desktop.png' });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.locator('.save-notice').scrollIntoViewIfNeeded();
  await page
    .locator('.writing-sheet')
    .screenshot({ path: 'test-results/ime-offline-mobile.png' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  const url = await workspace.restart();
  await page.goto(url);
  await expect(page.getByText('工作空间已连接', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(editor).toHaveText('服务停止后继续保留的判断');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});
