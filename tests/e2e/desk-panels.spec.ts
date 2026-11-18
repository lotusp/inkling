import { test, expect } from './fixtures';

for (const width of [1280, 375]) {
  test(`LIBRARY-DESK-014 prototype library and retained versions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.getByLabel('文章标题', { exact: true }).fill('写作台验收');
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '文章库', exact: true }).click();
    const library = page.getByRole('region', { name: '文章列表' });
    await expect(
      library.getByRole('searchbox', { name: '搜标题或标签' }),
    ).toBeVisible();
    await expect(
      library.getByRole('button', { name: '素材', exact: true }),
    ).toBeDisabled();
    const scope = library.getByLabel('文章范围');
    await expect(scope.locator('option')).toHaveText([
      '写作中',
      '全部文章',
      '已发表',
      '已归档',
      '回收站',
    ]);
    await scope.selectOption({ label: '全部文章' });
    await expect(library.getByText('1 篇', { exact: true })).toBeVisible();
    await scope.selectOption({ label: '写作中' });
    await expect(library.getByText('1 篇', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/v3-library-${width}.png` });
    await page.getByRole('button', { name: '关闭文章库' }).click();
    const menu = page.getByRole('button', { name: '文章菜单' });
    await menu.click();
    for (const name of ['导出文件…', '发布到博客…', '写作偏好'])
      await expect(
        page.getByRole('button', { name, exact: true }),
      ).toBeDisabled();
    await expect(page.getByRole('button', { name: '保存状态' })).toHaveCount(0);
    await page.getByRole('button', { name: '版本历史', exact: true }).click();
    const history = page.getByRole('region', { name: '版本历史', exact: true });
    await history
      .getByRole('button', { name: '保存版本', exact: true })
      .click();
    await expect(history.getByText('手动保存', { exact: true })).toBeVisible();
    await expect(history.getByLabel('稿次名称', { exact: true })).toBeHidden();
    const search = history.getByRole('searchbox', {
      name: '查找日期、名称或版本号',
    });
    await search.fill('#2');
    await expect(history.getByText('初稿', { exact: true })).toBeHidden();
    await search.fill('今天');
    await expect(history.getByText('初稿', { exact: true })).toBeVisible();
    await search.fill('');
    await expect(history.getByRole('status')).toBeHidden();
    await menu.click();
    await page.screenshot({ path: `test-results/v3-history-${width}.png` });
    await page.keyboard.press('Escape');
    await history
      .getByRole('listitem')
      .filter({ hasText: '初稿' })
      .getByRole('button', { name: '比较', exact: true })
      .click();
    await expect(
      history.getByRole('region', { name: '版本差异' }),
    ).toBeVisible();
  });
}
