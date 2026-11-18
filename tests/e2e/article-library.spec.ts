import { test, expect } from './fixtures';
import { AuthSession, ArticleListPage } from '@inkling/contracts';
import type { Page } from '@playwright/test';
async function headers(page: Page, origin: string) {
  return {
    origin,
    'x-csrf-token': AuthSession.parse(
      await (await page.request.get('/api/auth/session')).json(),
    ).csrfToken,
  };
}
const library = (page: Page) =>
  page.getByRole('region', { name: '文章列表', exact: true });
test('LIBRARY-LIST-003 paginates real metadata and marks current article on desktop and narrow screens', async ({
  page,
  workspace,
}) => {
  const auth = await headers(page, workspace.origin);
  for (let i = 0; i < 22; i++)
    expect(
      (
        await page.request.post('/api/articles', {
          headers: auth,
          data: { mutationId: crypto.randomUUID(), title: '技术思考 ' + i },
        })
      ).ok(),
    ).toBe(true);
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await expect(library(page).getByRole('listitem')).toHaveCount(20);
  await page.getByRole('button', { name: '加载更多文章', exact: true }).click();
  await expect(library(page).getByRole('listitem')).toHaveCount(23);
  await expect(
    library(page).getByText('当前文章', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/article-library-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(
    page.getByRole('button', { name: '新建文章', exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/article-library-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '关闭文章库', exact: true }).click();
  await expect(library(page)).toBeHidden();
  await expect(
    page.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toBeVisible();
});
test('LIBRARY-CREATE-002 one-click creation protects the source and lost response retries without duplicate articles', async ({
  page,
}) => {
  const ids: string[] = [];
  let first = true;
  await page.route('**/api/articles{,?*}', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    ids.push(
      (route.request().postDataJSON() as { mutationId: string }).mutationId,
    );
    const response = await route.fetch();
    if (first) {
      first = false;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await page
    .getByRole('textbox', { name: '文章正文', exact: true })
    .fill('第一篇的个人洞见');
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page.getByRole('button', { name: '新建文章', exact: true }).click();
  await page.getByRole('button', { name: '保存后切换', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '重试切换', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toHaveText('第一篇的个人洞见');
  await page.getByRole('button', { name: '重试切换', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: '文章标题', exact: true }),
  ).toHaveValue('');
  await page
    .getByRole('textbox', { name: '文章标题', exact: true })
    .fill('缓存一致性的取舍');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(
    ArticleListPage.parse(
      await (await page.request.get('/api/articles')).json(),
    ).items,
  ).toHaveLength(2);
});
test('LIBRARY-FAILURE-013 list loading failure and retry preserve the draft; stale responses cannot replace refresh', async ({
  page,
}) => {
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let arrived = () => {};
  const waiting = new Promise<void>((r) => {
    arrived = r;
  });
  let first = true;
  await page.route('**/api/articles{,?*}', async (route) => {
    if (first) {
      first = false;
      const response = await route.fetch();
      arrived();
      await gate;
      await route.fulfill({ response });
    } else await route.abort('failed');
  });
  await page
    .getByRole('textbox', { name: '文章正文', exact: true })
    .fill('列表失败也不能消失');
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await waiting;
  await expect(page.getByText('正在读取文章…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '搜索选项' }).click();
  await page.getByRole('button', { name: '刷新文章库', exact: true }).click();
  await expect(
    page.getByText('文章库读取失败，请重试。', { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText('还没有文章，从一个问题开始写作。', { exact: true }),
  ).not.toBeVisible();
  await page.unroute('**/api/articles{,?*}');
  await page.getByRole('button', { name: '重试列表', exact: true }).click();
  await expect(library(page).getByRole('listitem')).toHaveCount(1);
  await expect(
    page.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toHaveText('列表失败也不能消失');
});
test.describe('empty library', () => {
  test.use({ autoCreateArticle: false });
  test('LIBRARY-CREATE-002 empty library creates an untitled draft explicitly', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '文章库', exact: true }).click();
    await expect(
      page.getByText('还没有文章，从一个问题开始写作。', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '新建文章', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: '文章标题', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '文章库', exact: true }).click();
    await expect(library(page).getByRole('listitem')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: '打开：未命名文章', exact: true }),
    ).toBeDisabled();
  });
});
test('LIBRARY-FAILURE-013 definitive rejection can be cancelled without abandoning the editor', async ({
  page,
  workspace,
}) => {
  await page.request.post('/api/articles', {
    headers: await headers(page, workspace.origin),
    data: { mutationId: crypto.randomUUID(), title: '暂不可打开' },
  });
  await page.route('**/api/articles/*/open', (route) =>
    route.fulfill({
      status: 409,
      json: {
        code: 'ARTICLE_NOT_ACTIVE',
        message: '文章当前不可编辑，请刷新文章库。',
      },
    }),
  );
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page
    .getByRole('button', { name: '打开：暂不可打开', exact: true })
    .click();
  await expect(
    page.getByText('文章当前不可编辑，请刷新文章库。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '取消切换', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: '文章标题', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: '新建文章', exact: true }),
  ).toBeEnabled();
});
test('LIBRARY-CREATE-002 invalid or composing rename cannot persist a title or create another article', async ({
  page,
}) => {
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page.getByRole('button', { name: '未命名文章的更多操作' }).click();
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: '标题',
    exact: true,
  });
  await input.fill('文'.repeat(201));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.getByText('标题不能超过 200 个字符。', { exact: true }),
  ).toBeVisible();
  await input.fill('候选中的标题');
  await input.dispatchEvent('compositionstart');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.getByText('请先完成标题选词。', { exact: true }),
  ).toBeVisible();
  expect(
    ArticleListPage.parse(
      await (await page.request.get('/api/articles')).json(),
    ).items,
  ).toHaveLength(1);
  await input.dispatchEvent('compositionend');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: '文章标题', exact: true }),
  ).toHaveValue('候选中的标题');
});
