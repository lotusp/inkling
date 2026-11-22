import type { Page } from '@playwright/test';
import {
  ArticleListPage,
  ArticleSnapshot,
  WorkspaceInfo,
} from '@inkling/contracts';
import { test, expect } from './fixtures';
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });
const library = async (page: Page) =>
  ArticleListPage.parse(await (await page.request.get('/api/articles')).json());
async function pick(page: Page, name: string, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await button(page, '从文件导入').click();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer });
  return page.getByRole('dialog', { name: '导入文章' });
}
test('EDITOR-IMPORT-007 文本可预览和取消，创建回包丢失后只导入一次，原稿可找回', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const body = page.getByRole('textbox', { name: '文章正文', exact: true });
  const original = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  ).currentArticleId!;
  await body.fill('保留原来的思路');
  await button(page, '文章库').click();
  await expect(button(page, '从文件导入')).toBeVisible({ timeout: 2200 });
  const text = Buffer.from(
    '\uFEFF第一段：观察。\r\n\r\n  第二段保留缩进。\r\n结尾。',
  );
  let dialog = await pick(page, '复盘.txt', text);
  await expect(dialog).toContainText('第二段保留缩进。');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect((await library(page)).total).toBe(1);
  await button(page, '关闭文章库').click();
  await expect(body).toHaveText('保留原来的思路');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await button(page, '文章库').click();
  dialog = await pick(page, '复盘.txt', text);
  const ids: string[] = [];
  await page.route('**/api/articles', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    ids.push(route.request().postDataJSON().mutationId);
    const response = await route.fetch();
    if (ids.length === 1) return route.abort('failed');
    await route.fulfill({ response });
  });
  await dialog.getByRole('button', { name: '确认导入' }).click();
  await button(page, '重试切换').click();
  await expect(page.getByLabel('文章标题', { exact: true })).toHaveValue(
    '复盘',
  );
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const entries = await library(page);
  expect(entries.total).toBe(2);
  const id = entries.items.find((i) => i.title === '复盘')!.articleId;
  const read = async (id: string) =>
    ArticleSnapshot.parse(
      await (await page.request.get('/api/articles/' + id)).json(),
    );
  expect((await read(id)).headSeq).toBe(1);
  expect(
    (await read(id)).document.doc.content?.map(
      (p) => p.content?.[0]?.text ?? '',
    ),
  ).toEqual(['第一段：观察。', '', '  第二段保留缩进。', '结尾。']);
  expect(
    (await read(original)).document.doc.content?.[0]?.content?.[0]?.text,
  ).toBe('保留原来的思路');
  await page.reload();
  await expect(body.locator('.mu-paragraph-content').last()).toHaveText(
    '结尾。',
  );
});

test('EDITOR-IMPORT-007 保留未能提交的原稿后导入，重开原稿仍可恢复', async ({
  page,
}) => {
  const body = page.getByRole('textbox', { name: '文章正文', exact: true });
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  await body.fill('断开时的原稿');
  await expect(button(page, '重试保存')).toBeVisible();
  await button(page, '文章库').click();
  const dialog = await pick(page, '新文章.txt', Buffer.from('独立稿件'));
  await dialog.getByRole('button', { name: '确认导入' }).click();
  await button(page, '保留草稿并切换').click();
  await expect(body).toHaveText('独立稿件');
  await page.unroute('**/api/articles/*/content');
  await button(page, '文章库').click();
  await button(page, '打开：未命名文章').click();
  await button(page, '恢复此草稿').click();
  await expect(body).toHaveText('断开时的原稿');
});

test('EDITOR-IMPORT-007 导入纯文本时 Markdown 标记和图片链接保持为文字', async ({
  page,
}) => {
  await button(page, '文章库').click();
  const raw = '**照录** 与 ![图](https://example.invalid/proof.png)';
  const dialog = await pick(page, '笔记.txt', Buffer.from(raw));
  await expect(dialog.getByLabel('正文预览')).toHaveText(raw);
  await dialog.getByRole('button', { name: '确认导入' }).click();
  const body = page.getByRole('textbox', { name: '文章正文', exact: true });
  await expect(page.getByLabel('文章标题', { exact: true })).toHaveValue(
    '笔记',
  );
  await expect(body.locator('strong,img')).toHaveCount(0);
  await page.reload();
  await expect(body.locator('.mu-paragraph-content')).toContainText('照录');
  await expect(body.locator('strong,img')).toHaveCount(0);
});
