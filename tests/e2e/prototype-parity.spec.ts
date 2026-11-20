import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixtures';

for (const target of ['V3', '工作台'] as const) {
  test.describe(target, () => {
    test.beforeEach(async ({ page }) => {
      if (target === 'V3')
        await page.goto(
          pathToFileURL(resolve('docs/prototypes/inkling-writing-desk-v3.html'))
            .href,
        );
    });
    test('LIBRARY-DESK-014 大纲添加章节、返回正文并跳转', async ({ page }) => {
      const button = (name: string) =>
        page.getByRole('button', { name, exact: true });
      await button('大纲').click();
      await button('添加章节…').click();
      await page.getByLabel('章节标题').fill('一次接口复盘');
      await button('添加').click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.activeElement instanceof HTMLElement &&
              document.activeElement.isContentEditable,
          ),
        )
        .toBe(true);
      await button('大纲').click();
      await button('一次接口复盘').click();
    });
    test('LIBRARY-DESK-014 选区的段落格式可加粗整段，清除无结果搜索', async ({
      page,
    }) => {
      const button = (name: string) =>
        page.getByRole('button', { name, exact: true });
      const body = page
        .locator(target === 'V3' ? '#blocks [contenteditable]' : '.mu-editor')
        .first();
      await body.fill('针对一段文字');
      await body.press('Home');
      await body.press('Shift+ArrowRight');
      await button('段落格式…').click();
      await button('整段加粗').click();
      if (target === 'V3') await expect(body).toHaveClass(/strong/);
      else await expect(body.locator('strong')).toHaveText('针对一段文字');
      await button('文章库').click();
      await page.getByLabel('搜标题或标签').fill('不存在的检索XYZ');
      await button('清除搜索').click();
      await expect(page.getByLabel('搜标题或标签')).toHaveValue('');
    });
    for (const width of [1280, 900, 375]) {
      test(`LIBRARY-DESK-014 两侧面板与专注返回 ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const button = (name: string) =>
          page.getByRole('button', { name, exact: true });
        await button('文章库').click();
        await button('文章菜单').click();
        await button('版本历史').click();
        await expect(button('文章库')).toHaveAttribute(
          'aria-expanded',
          String(width > 1100),
        );
        await expect(button('保存版本')).toBeVisible();
        await button('文章菜单').click();
        await button('专注写作').click();
        await expect(button('保存版本')).toBeHidden();
        await button('退出专注').click();
        await expect(button('保存版本')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(button('保存版本')).toBeHidden();
        await expect(button('文章库')).toHaveAttribute(
          'aria-expanded',
          String(width > 820),
        );
      });
    }
    test('LIBRARY-DESK-014 新建一步进入空白正文，重命名与标签各自保存', async ({
      page,
    }) => {
      const button = (name: string) =>
        page.getByRole('button', { name, exact: true });
      await button('文章库').click();
      await button('新建文章').click();
      await expect(button('文章库')).toHaveAttribute('aria-expanded', 'false');
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.activeElement instanceof HTMLElement &&
              document.activeElement.isContentEditable,
          ),
        )
        .toBe(true);
      await button('文章库').click();
      await button('未命名文章的更多操作').first().click();
      await page.locator(':popover-open').screenshot({
        path: 'test-results/article-actions-' + target + '.png',
      });
      await button('重命名').click();
      const title = page.getByLabel('标题', { exact: true });
      await expect(title).toBeFocused();
      await page
        .getByRole('dialog')
        .screenshot({ path: 'test-results/rename-actions-' + target + '.png' });
      await expect(page.getByLabel('每行一个标签')).toHaveCount(0);
      await title.fill('交互核对稿');
      await button('保存').click();
      await button('交互核对稿的更多操作').click();
      await button('编辑标签').click();
      await expect(title).toHaveCount(0);
      await page.getByLabel('每行一个标签').fill('写作\n\n实测');
      await button('保存标签').click();
      await button('交互核对稿的更多操作').click();
      await button('编辑标签').click();
      await expect(page.getByLabel('每行一个标签')).toHaveValue(/实测/);
      await page.getByLabel('每行一个标签').fill('取消的输入');
      await page.keyboard.press('Escape');
      await button('交互核对稿的更多操作').click();
      await button('编辑标签').click();
      await expect(page.getByLabel('每行一个标签')).not.toHaveValue(
        /取消的输入/,
      );
    });
    test('LIBRARY-DESK-014 比较固定来源、单一目标、结束返回列表', async ({
      page,
    }) => {
      const button = (name: string) =>
        page.getByRole('button', { name, exact: true });
      const paper = page
        .locator(target === 'V3' ? '#blocks [contenteditable]' : '.mu-editor')
        .first();
      const title = page.getByLabel('文章标题', { exact: true });
      await title.fill('核对比较方向');
      await paper.fill('先记下当时的判断。');
      await button('文章菜单').click();
      await button('版本历史').click();
      await button('保存版本').click();
      const savedRow = page
        .locator(target === 'V3' ? '.version-row' : '.revision-list li')
        .filter({ hasText: '手动保存' })
        .first();
      await expect(savedRow).toBeVisible();
      await paper.fill('先记下修订的判断。');
      await savedRow.getByRole('button', { name: '比较', exact: true }).click();
      const comparison = page.locator(
        target === 'V3' ? '.revision-picks' : '.version-compare',
      );
      await expect(
        comparison.getByText('比较改动', { exact: true }),
      ).toBeVisible();
      const select = comparison.getByRole('combobox');
      await expect(select).toHaveCount(1);
      await expect(select.locator('option:checked')).toHaveText('当前稿');
      await expect(comparison.locator('.diff-line.removed')).toContainText(
        '当时',
      );
      await expect(comparison.locator('.diff-line.added')).toContainText(
        '修订',
      );
      await comparison.screenshot({
        path: 'test-results/compare-actions-' + target + '.png',
      });
      await paper.fill('比较期间继续记录的新观点。');
      await expect(comparison.locator('.diff-line.added')).toContainText(
        '继续记录',
      );
      await select.selectOption({ index: 1 });
      await expect(select.locator('option:checked')).not.toHaveText('当前稿');
      await expect(paper).toContainText('继续记录');
      await button('结束比较').click();
      await expect(comparison).toBeHidden();
      await expect(button('保存版本')).toBeVisible();
    });
  });
}
