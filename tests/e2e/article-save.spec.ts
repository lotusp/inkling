import { test, expect } from './fixtures';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
test.use({ autoConnect: false, autoCreateArticle: false });
test('ARTICLE-SAVE-002 Chinese draft is saved and reopened with formatting', async ({
  page,
  request,
  workspace,
}) => {
  const dir = workspace.dir;
  if (!dir) throw new Error('Missing isolated workspace');
  const info = JSON.parse(
    readFileSync(join(dir, 'runtime-access.json'), 'utf8'),
  ) as { secret: string };
  const response = await request.post('/api/local/access', {
    headers: { 'x-inkling-local-secret': info.secret },
    data: {},
  });
  const access = (await response.json()) as { url: string };
  await page.goto(access.url);
  await expect(page.getByText('工作空间已连接', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始写作', exact: true }).click();
  await page
    .getByRole('textbox', { name: '文章标题', exact: true })
    .fill('可靠保存我的想法');
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('中文正文必须保留。');
  await page.getByRole('button', { name: '段落格式…', exact: true }).click();
  await page.getByRole('button', { name: '小标题', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: '文章标题', exact: true }),
  ).toHaveValue('可靠保存我的想法');
  await expect(
    page.getByRole('textbox', { name: '文章正文', exact: true }).locator('h2'),
  ).toHaveText('## 中文正文必须保留。');
});
