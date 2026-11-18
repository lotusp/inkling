import { test, expect } from './fixtures';
import {
  ArticleSnapshot,
  WorkspaceInfo,
  AuthSession,
} from '@inkling/contracts';
import type { Page } from '@playwright/test';
async function setup(page: Page, origin: string) {
  const a = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  ).currentArticleId!;
  const session = AuthSession.parse(
    await (await page.request.get('/api/auth/session')).json(),
  );
  const headers = { origin, 'x-csrf-token': session.csrfToken };
  const b = ArticleSnapshot.parse(
    await (
      await page.request.post('/api/articles', {
        headers,
        data: { mutationId: crypto.randomUUID(), title: '第二篇' },
      })
    ).json(),
  );
  return { a, b, headers };
}
async function choose(page: Page, title = '第二篇') {
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page
    .getByRole('button', { name: '打开：' + title, exact: true })
    .click();
}
const title = (page: Page) =>
  page.getByRole('textbox', { name: '文章标题', exact: true });
const body = (page: Page) =>
  page.getByRole('textbox', { name: '文章正文', exact: true });
test('LIBRARY-OPEN-004 clean navigation is per tab and reload follows the last explicit open', async ({
  page,
  context,
  workspace,
}) => {
  const { a } = await setup(page, workspace.origin);
  const other = await context.newPage();
  await other.goto(workspace.origin);
  await expect(title(other)).toHaveValue('第二篇');
  await choose(page);
  await expect(title(page)).toHaveValue('第二篇');
  await choose(page, '未命名文章');
  await expect(title(page)).toHaveValue('');
  await expect(title(other)).toHaveValue('第二篇');
  expect(
    WorkspaceInfo.parse(await (await page.request.get('/api/workspace')).json())
      .currentArticleId,
  ).toBe(a);
  await page.reload();
  await expect(title(page)).toBeEnabled();
  await expect(title(page)).toHaveValue('');
});
test('LIBRARY-SWITCH-005 save before switching flushes the newest input', async ({
  page,
  workspace,
}) => {
  const { a } = await setup(page, workspace.origin);
  await body(page).fill('还没来得及自动保存的观点');
  await choose(page);
  await page.getByRole('button', { name: '保存后切换', exact: true }).click();
  await expect(title(page)).toHaveValue('第二篇');
  const saved = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + a)).json(),
  );
  expect(JSON.stringify(saved.document)).toContain('还没来得及自动保存的观点');
  await expect(body(page)).toHaveText('');
});
test('LIBRARY-SWITCH-005 late save waits before leaving and cannot replace the next editor', async ({
  page,
  workspace,
}) => {
  await setup(page, workspace.origin);
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let arrived = () => {};
  const waiting = new Promise<void>((r) => {
    arrived = r;
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
  await body(page).fill('请求中的旧输入');
  await waiting;
  await body(page).fill('响应前的新输入');
  await choose(page);
  await page
    .getByRole('button', { name: '保留草稿并切换', exact: true })
    .click();
  await expect(
    page.getByText('正在保存或核对，请等待结束后再切换。'),
  ).toBeVisible();
  await expect(body(page)).toHaveText('响应前的新输入');
  release();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存后切换', exact: true }).click();
  await expect(title(page)).toHaveValue('第二篇');
  await body(page).fill('第二篇独立内容');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect(body(page)).toHaveText('第二篇独立内容');
});
test('LIBRARY-SWITCH-005 unknown save stays recoverable across two navigations without duplicating its request', async ({
  page,
  workspace,
}) => {
  const { a } = await setup(page, workspace.origin);
  await page.route('**/api/articles/*/content', async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await body(page).fill('确认丢失但已经落盘');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await body(page).fill('确认丢失后继续思考');
  await choose(page);
  await page
    .getByRole('button', { name: '保留草稿并切换', exact: true })
    .click();
  await expect(title(page)).toHaveValue('第二篇');
  await page.unroute('**/api/articles/*/content');
  await choose(page, '未命名文章');
  await expect(page.getByRole('region', { name: '待恢复草稿' })).toBeVisible();
  // Leaving without selecting a recovery must retain it.
  await choose(page);
  await page
    .getByRole('button', { name: '保留草稿并切换', exact: true })
    .click();
  await expect(title(page)).toHaveValue('第二篇');
  await choose(page, '未命名文章');
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(body(page)).toHaveText('确认丢失后继续思考');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect(
    ArticleSnapshot.parse(
      await (await page.request.get('/api/articles/' + a)).json(),
    ).headSeq,
  ).toBe(3);
});
test('LIBRARY-SWITCH-005 failed draft protection prevents navigation and keeps rescue available', async ({
  page,
  workspace,
}) => {
  await setup(page, workspace.origin);
  await page.route('**/api/articles/*/content', (r) => r.abort('failed'));
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await body(page).fill('必须保留的输入');
  await choose(page);
  await page
    .getByRole('button', { name: '保留草稿并切换', exact: true })
    .click();
  await expect(
    page.getByText('恢复副本未能写入，已停止切换。请重试或下载救援稿。'),
  ).toBeVisible();
  await expect(body(page)).toHaveText('必须保留的输入');
  await expect(
    page.getByRole('button', { name: '下载备份', exact: true }),
  ).toBeVisible();
});
test('LIBRARY-SWITCH-005 composition blocks navigation and requires a fresh action after selection', async ({
  page,
  workspace,
}) => {
  await setup(page, workspace.origin);
  await body(page).dispatchEvent('compositionstart');
  await choose(page);
  await expect(
    page.getByText('请先完成中文选词，再重新切换文章。'),
  ).toBeVisible();
  await expect(title(page)).toHaveValue('');
  await body(page).dispatchEvent('compositionend');
  await expect(title(page)).toHaveValue('');
  await page.getByRole('button', { name: '取消切换', exact: true }).click();
  await page.getByRole('button', { name: '打开：第二篇', exact: true }).click();
  await expect(title(page)).toHaveValue('第二篇');
});
test('LIBRARY-SWITCH-005 lost open response retries the same operation and freezes input only during navigation', async ({
  page,
  workspace,
}) => {
  await setup(page, workspace.origin);
  const ids: string[] = [];
  let first = true;
  await page.route('**/api/articles/*/open', async (route) => {
    ids.push(
      (route.request().postDataJSON() as { mutationId: string }).mutationId,
    );
    const response = await route.fetch();
    if (first) {
      first = false;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await choose(page);
  await expect(
    page.getByRole('button', { name: '重试切换', exact: true }),
  ).toBeVisible();
  await expect(title(page)).toBeEnabled();
  await body(page).fill('失败后新输入');
  await page.getByRole('button', { name: '重试切换', exact: true }).click();
  await page.getByRole('button', { name: '保存后切换', exact: true }).click();
  await expect(title(page)).toHaveValue('第二篇');
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
test('LIBRARY-SWITCH-005 conflict draft survives switching and explicit recovery', async ({
  page,
  workspace,
}) => {
  const { a, headers } = await setup(page, workspace.origin);
  const original = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + a)).json(),
  );
  await page.request.put('/api/articles/' + a + '/content', {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: original.headRevisionId,
      document: { ...original.document, title: '服务器观点' },
    },
  });
  await body(page).fill('本地冲突观点');
  await expect(
    page.getByRole('button', { name: '查看冲突', exact: true }),
  ).toBeVisible();
  await choose(page);
  await page
    .getByRole('button', { name: '保留草稿并切换', exact: true })
    .click();
  await expect(title(page)).toHaveValue('第二篇');
  await choose(page, '服务器观点');
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(body(page)).toHaveText('本地冲突观点');
  await expect(
    page.getByRole('button', { name: '查看冲突', exact: true }),
  ).toBeVisible();
});
test('LIBRARY-SWITCH-005 failed target read retains the old editor and pending navigation locks mutations', async ({
  page,
  workspace,
}) => {
  const { b } = await setup(page, workspace.origin);
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let arrived = () => {};
  const waiting = new Promise<void>((r) => {
    arrived = r;
  });
  await page.route('**/api/articles/' + b.articleId, async (route) => {
    arrived();
    await gate;
    await route.abort('failed');
  });
  await choose(page);
  await waiting;
  await expect(title(page)).toBeDisabled();
  await expect(body(page)).toHaveAttribute('contenteditable', 'false');
  release();
  await expect(
    page.getByRole('button', { name: '重试切换', exact: true }),
  ).toBeVisible();
  await expect(title(page)).toBeEnabled();
  await expect(title(page)).toHaveValue('');
  await body(page).fill('打开失败后仍可继续写');
  await page.unroute('**/api/articles/' + b.articleId);
  await page.getByRole('button', { name: '重试切换', exact: true }).click();
  await page.getByRole('button', { name: '保存后切换', exact: true }).click();
  await expect(title(page)).toHaveValue('第二篇');
});
test('LIBRARY-SWITCH-005 offline navigation preserves the source and title composition blocks new article', async ({
  page,
  context,
  workspace,
}) => {
  await setup(page, workspace.origin);
  await title(page).dispatchEvent('compositionstart');
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: '新建文章', exact: true }).click();
  await expect(
    page.getByText('请先完成中文选词，再重新切换文章。'),
  ).toBeVisible();
  await title(page).dispatchEvent('compositionend');
  await page.getByRole('button', { name: '取消切换', exact: true }).click();
  await body(page).fill('离线观点');
  await context.setOffline(true);
  await page.getByRole('button', { name: '打开：第二篇', exact: true }).click();
  await page
    .getByRole('button', { name: '保留草稿并切换', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '重试切换', exact: true }),
  ).toBeVisible();
  await expect(body(page)).toHaveText('离线观点');
  await expect(title(page)).toBeEnabled();
  await context.setOffline(false);
});
