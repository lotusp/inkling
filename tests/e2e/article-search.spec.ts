import { test, expect } from './fixtures';
import { ArticleSnapshot, AuthSession } from '@inkling/contracts';
import type { Page } from '@playwright/test';
const list = (page: Page) =>
  page.getByRole('region', { name: '文章列表', exact: true });
const q = (page: Page) =>
  page.getByRole('textbox', { name: '按标题查找', exact: true });
const tag = (page: Page) =>
  page.getByRole('textbox', { name: '精确标签', exact: true });
async function create(
  page: Page,
  origin: string,
  title: string,
  tags: string[] = [],
) {
  const headers = {
    origin,
    'x-csrf-token': AuthSession.parse(
      await (await page.request.get('/api/auth/session')).json(),
    ).csrfToken,
  };
  const article = ArticleSnapshot.parse(
    await (
      await page.request.post('/api/articles', {
        headers,
        data: { mutationId: crypto.randomUUID(), title },
      })
    ).json(),
  );
  if (tags.length)
    expect(
      (
        await page.request.put(
          '/api/articles/' + article.articleId + '/metadata',
          {
            headers,
            data: {
              mutationId: crypto.randomUUID(),
              baseMetadataVersion: 1,
              tags,
            },
          },
        )
      ).ok(),
    ).toBe(true);
  return article;
}
async function search(page: Page, title: string, label = '') {
  await q(page).fill(title);
  await tag(page).fill(label);
  await page.getByRole('button', { name: '查找文章', exact: true }).click();
}
test('LIBRARY-FIND-008 literal title and exact tag combine without altering current input', async ({
  page,
  workspace,
}) => {
  await create(page, workspace.origin, 'SQLite 100%_ 复盘', ['数据库']);
  await create(page, workspace.origin, 'SQLite 100abc 复盘', ['数据库']);
  await create(page, workspace.origin, 'SQLite 100%_ 扩展', ['数据库扩展']);
  await page
    .getByRole('textbox', { name: '文章正文', exact: true })
    .fill('筛选不能改变正在写的观点');
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await search(page, '%_', '数据库');
  await expect(list(page).getByRole('listitem')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: '打开：SQLite 100%_ 复盘', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toHaveText('筛选不能改变正在写的观点');
  await search(page, '不存在');
  await expect(
    page.getByText('没有匹配的文章，试试其他标题或标签。', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('还没有文章，从一个问题开始写作。', { exact: true }),
  ).toBeHidden();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(4);
});
test('LIBRARY-FIND-008 changing filters resets pagination and retains applied filters on refresh', async ({
  page,
  workspace,
}) => {
  for (let i = 0; i < 22; i++)
    await create(page, workspace.origin, '前组 ' + i, ['系列']);
  await create(page, workspace.origin, '后组 唯一', ['系列']);
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await search(page, '前组', '系列');
  await expect(list(page).getByRole('listitem')).toHaveCount(20);
  await page.getByRole('button', { name: '加载更多文章', exact: true }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(22);
  const request = page.waitForRequest((r) => {
    const url = new URL(r.url());
    return (
      url.pathname === '/api/articles' && url.searchParams.get('q') === '后组'
    );
  });
  await search(page, '后组', '系列');
  const url = new URL((await request).url());
  expect(url.searchParams.has('beforeId')).toBe(false);
  await expect(list(page).getByRole('listitem')).toHaveCount(1);
  await q(page).fill('还没有提交的条件');
  await page.getByRole('button', { name: '刷新文章库', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '打开：后组 唯一', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('当前筛选：标题“后组” · 标签“系列”', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/article-search-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/article-search-mobile.png',
    fullPage: true,
  });
});
test('LIBRARY-FIND-008 a late page from the old query cannot append into a new query', async ({
  page,
  workspace,
}) => {
  for (let i = 0; i < 21; i++)
    await create(page, workspace.origin, '旧查询 ' + i);
  await create(page, workspace.origin, '新查询');
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await search(page, '旧查询');
  await expect(list(page).getByRole('listitem')).toHaveCount(20);
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let arrived = () => {};
  const waiting = new Promise<void>((r) => (arrived = r));
  let finished = () => {};
  const done = new Promise<void>((r) => (finished = r));
  await page.route('**/api/articles?*', async (route) => {
    if (new URL(route.request().url()).searchParams.has('beforeId')) {
      const response = await route.fetch();
      arrived();
      await gate;
      await route.fulfill({ response });
      finished();
    } else await route.continue();
  });
  await page.getByRole('button', { name: '加载更多文章', exact: true }).click();
  await waiting;
  await search(page, '新查询');
  await expect(
    page.getByRole('button', { name: '打开：新查询', exact: true }),
  ).toBeVisible();
  release();
  await done;
  await expect(list(page).getByRole('listitem')).toHaveCount(1);
  await expect(
    list(page).getByText('当前筛选：标题“新查询”', { exact: true }),
  ).toBeVisible();
});
test('LIBRARY-FIND-008 query failure retries the same filter and invalid input leaves applied results intact', async ({
  page,
  workspace,
}) => {
  await create(page, workspace.origin, '待查找文章');
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(2);
  await page.route('**/api/articles?*', (route) => route.abort('failed'));
  await search(page, '待查找');
  await expect(
    page.getByText('文章库读取失败，请重试。', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('没有匹配的文章，试试其他标题或标签。', { exact: true }),
  ).toBeHidden();
  await expect(list(page).getByRole('listitem')).toHaveCount(0);
  await page.unroute('**/api/articles?*');
  await page.getByRole('button', { name: '重试列表', exact: true }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(1);
  await q(page).fill('文'.repeat(101));
  await page.getByRole('button', { name: '查找文章', exact: true }).click();
  await expect(
    page.getByText('标题查找最多 100 个字符；标签最多 30 个字符且不能换行。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '打开：待查找文章', exact: true }),
  ).toBeVisible();
});
for (const field of ['按标题查找', '精确标签'])
  test(`LIBRARY-FIND-008 ${field} composition blocks search and clear until a fresh action`, async ({
    page,
    workspace,
  }) => {
    await create(page, workspace.origin, '输入法文章', ['标签']);
    await page.getByRole('button', { name: '文章库', exact: true }).click();
    await expect(list(page).getByRole('listitem')).toHaveCount(2);
    let requests = 0;
    await page.route('**/api/articles?*', async (route) => {
      requests++;
      await route.continue();
    });
    const input = page.getByRole('textbox', { name: field, exact: true });
    await input.fill(field === '按标题查找' ? '输入法' : '标签');
    await input.dispatchEvent('compositionstart');
    await page.getByRole('button', { name: '查找文章', exact: true }).click();
    await expect(
      page.getByText('请先完成选词，再查找或清除筛选。', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    expect(requests).toBe(0);
    await input.dispatchEvent('compositionend');
    expect(requests).toBe(0);
    await page.getByRole('button', { name: '查找文章', exact: true }).click();
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    expect(requests).toBe(1);
  });
