import { test, expect } from './fixtures';
import { ArticleSnapshot, WorkspaceInfo } from '@inkling/contracts';
import { formattedArticle } from '../fixtures/article-document';

test('ARTICLE-SCHEMA-011 every supported format survives editor load and another save', async ({
  page,
  workspace,
}) => {
  const info = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const path = '/api/articles/' + info.currentArticleId;
  const initial = ArticleSnapshot.parse(
    await (await page.request.get(path)).json(),
  );
  const session = (await (
    await page.request.get('/api/auth/session')
  ).json()) as { csrfToken: string };
  const response = await page.request.put(path + '/content', {
    headers: { origin: workspace.origin, 'x-csrf-token': session.csrfToken },
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: initial.headRevisionId,
      document: formattedArticle,
    },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  for (const [selector, value] of [
    ['h2', '二级标题'],
    ['h3', '三级标题'],
    ['strong em s u', '组合强调'],
    ['p code', 'inline_code'],
    ['a[href="https://example.com/reference"]', '参考链接'],
    ['blockquote', '引文与边界'],
    ['ul > li > p', '无序条目'],
    ['ol[start="3"][type="a"]', '嵌套有序条目'],
    ['pre code', 'const insight = true;\nconsole.log(insight);'],
  ])
    await expect(editor.locator(selector!)).toContainText(value!);
  await expect(editor.locator('br')).toHaveCount(1);
  await expect(editor.locator('hr')).toHaveCount(1);
  const title = '🧠'.repeat(200);
  await page.getByLabel('文章标题', { exact: true }).fill(title);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const saved = ArticleSnapshot.parse(
    await (await page.request.get(path)).json(),
  );
  expect(saved.document.title).toBe(title);
  expect(saved.document.doc).toEqual(formattedArticle.doc);
  await page.reload();
  await expect(page.getByLabel('文章标题', { exact: true })).toHaveValue(title);
});

test('ARTICLE-SCHEMA-011 an overlong title cannot be acknowledged by an older save', async ({
  page,
}) => {
  let arrived = () => {};
  const waiting = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  await page.route('**/api/articles/*/content', async (route) => {
    const response = await route.fetch();
    if (first) {
      first = false;
      arrived();
      await gate;
    }
    await route.fulfill({ response });
  });
  const title = page.getByLabel('文章标题', { exact: true });
  await title.fill('合法标题');
  await waiting;
  await title.fill('中'.repeat(201));
  const reconciled = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/api\/articles\/[^/]+$/.test(response.url()),
  );
  release();
  await reconciled;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(
    page.getByText('正文结构或标题长度不符合保存要求。'),
  ).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).not.toBeVisible();
  await expect(title).toHaveValue('中'.repeat(201));
  await title.fill('已修正标题');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('文章标题', { exact: true })).toHaveValue(
    '已修正标题',
  );
});

test('WORKBENCH-EDIT-004 title composition defers saves until composition ends', async ({
  page,
}) => {
  await page.clock.install();
  const title = page.getByLabel('文章标题', { exact: true });
  let writes = 0;
  await page.route('**/api/articles/*/content', async (route) => {
    writes++;
    await route.continue();
  });
  await title.focus();
  await title.dispatchEvent('compositionstart', { data: '' });
  await page.keyboard.insertText('尚在选词');
  await page.clock.runFor(1500);
  await title.press('ControlOrMeta+s');
  // A server read drains earlier browser events without a timing-based sleep.
  await page.request.get('/api/workspace');
  expect(writes).toBe(0);
  await expect(page.getByText('已保存', { exact: true })).not.toBeVisible();
  await title.dispatchEvent('compositionend', { data: '尚在选词' });
  await page.clock.runFor(1500);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('文章标题', { exact: true })).toHaveValue(
    '尚在选词',
  );
});
