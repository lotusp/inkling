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
      await button('重命名').click();
      const title = page.getByLabel('标题', { exact: true });
      await expect(title).toBeFocused();
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
      await button('文章菜单').click();
      await button('版本历史').click();
      await button('比较').first().click();
      await expect(page.getByText('比较改动', { exact: true })).toBeVisible();
      const select = page.getByRole('combobox');
      await expect(select).toHaveCount(1);
      await expect(select.locator('option:checked')).toHaveText('当前稿');
      await button('结束比较').click();
      await expect(select).toHaveCount(0);
      await expect(button('保存版本')).toBeVisible();
    });
  });
}
