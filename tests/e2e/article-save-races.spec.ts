import { test, expect } from './fixtures';
import { ArticleSnapshot, WorkspaceInfo } from '@inkling/contracts';

test('ARTICLE-RACE-005 reconciliation preserves newer local input and blocks overwrite', async ({
  page,
  workspace,
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
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('已提交但确认未到达');
  await waiting;
  const info = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const article = ArticleSnapshot.parse(
    await (
      await page.request.get('/api/articles/' + info.currentArticleId)
    ).json(),
  );
  const session = (await (
    await page.request.get('/api/auth/session')
  ).json()) as { csrfToken: string };
  const remote = await page.request.put(
    '/api/articles/' + article.articleId + '/content',
    {
      headers: { origin: workspace.origin, 'x-csrf-token': session.csrfToken },
      data: {
        mutationId: crypto.randomUUID(),
        baseRevisionId: article.headRevisionId,
        document: { ...article.document, title: '另一页的新版本' },
      },
    },
  );
  expect(remote.ok()).toBe(true);
  await editor.fill('我在等待期间继续写的观点');
  release();
  const retry = page.getByRole('button', { name: '重试保存', exact: true });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(
    page.getByText('另一标签页已更新稿件，当前新输入已保留，请先比较。'),
  ).toBeVisible();
  await expect(editor).toHaveText('我在等待期间继续写的观点');
  await editor.press('ControlOrMeta+s');
  await expect(
    page.getByText('另一标签页已更新稿件，当前新输入已保留，请先比较。'),
  ).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).not.toBeVisible();
  const latest = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + article.articleId)).json(),
  );
  expect(latest.headSeq).toBe(3);
  expect(latest.document.title).toBe('另一页的新版本');
});
test('ARTICLE-RACE-005 late acknowledgement never replaces newer local input', async ({
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
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('第一次输入');
  await waiting;
  await editor.fill('保存期间继续输入的新想法');
  release();
  await expect(editor).toHaveText('保存期间继续输入的新想法');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toHaveText('保存期间继续输入的新想法');
});
test('ARTICLE-RETRY-003 lost response reconciles a newer remote head before claiming clean', async ({
  page,
  workspace,
}) => {
  let first = true;
  await page.route('**/api/articles/*/content', async (route) => {
    if (first) {
      first = false;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('第一次已提交但响应丢失');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  const workspaceInfo = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const article = ArticleSnapshot.parse(
    await (
      await page.request.get('/api/articles/' + workspaceInfo.currentArticleId)
    ).json(),
  );
  const session = (await (
    await page.request.get('/api/auth/session')
  ).json()) as { csrfToken: string };
  const response = await page.request.put(
    '/api/articles/' + article.articleId + '/content',
    {
      headers: { origin: workspace.origin, 'x-csrf-token': session.csrfToken },
      data: {
        mutationId: crypto.randomUUID(),
        baseRevisionId: article.headRevisionId,
        document: {
          ...article.document,
          doc: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '另一标签页已经保存的新版本' }],
              },
            ],
          },
        },
      },
    },
  );
  expect(response.ok()).toBe(true);
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(editor).toHaveText('另一标签页已经保存的新版本');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const final = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + article.articleId)).json(),
  );
  expect(final.headSeq).toBe(3);
});

test('ARTICLE-RETRY-003 failed mutation lookup keeps the request unresolved', async ({
  page,
}) => {
  let writes = 0;
  await page.route('**/api/articles/*/content', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('未能确认的输入');
  const retry = page.getByRole('button', { name: '重试保存', exact: true });
  await expect(retry).toBeVisible();
  await page.route('**/api/mutations/*', (route) => route.abort('failed'));
  await retry.click();
  await expect(retry).toBeVisible();
  expect(writes).toBe(1);
  await expect(editor).toHaveText('未能确认的输入');
  await expect(page.getByText('已保存', { exact: true })).not.toBeVisible();
  await page.unroute('**/api/mutations/*');
  await retry.click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});
