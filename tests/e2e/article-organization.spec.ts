import { test, expect } from './fixtures';
import {
  ArticleSnapshot,
  ArticleListItem,
  AuthSession,
  WorkspaceInfo,
} from '@inkling/contracts';
import type { Page } from '@playwright/test';
const body = (page: Page) =>
  page.getByRole('textbox', { name: '文章正文', exact: true });
const title = (page: Page) =>
  page.getByRole('textbox', { name: '文章标题', exact: true });
const tags = (page: Page) =>
  page.getByRole('textbox', { name: '文章标签（一行一个）', exact: true });
async function info(page: Page, origin: string) {
  const workspace = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  return {
    id: workspace.currentArticleId!,
    headers: {
      origin,
      'x-csrf-token': AuthSession.parse(
        await (await page.request.get('/api/auth/session')).json(),
      ).csrfToken,
    },
  };
}
async function organize(page: Page, name = '未命名文章') {
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page
    .getByRole('button', { name: '整理：' + name, exact: true })
    .click();
  await expect(tags(page)).toBeEnabled();
}
test('LIBRARY-RENAME-006 rename preserves unsaved body in the same article and survives reload', async ({
  page,
  workspace,
}) => {
  const { id } = await info(page, workspace.origin);
  await organize(page);
  await body(page).fill('还未自动保存的个人判断');
  await page
    .getByRole('textbox', { name: '新标题', exact: true })
    .fill('架构取舍复盘');
  await page.getByRole('button', { name: '保存标题', exact: true }).click();
  await expect(title(page)).toHaveValue('架构取舍复盘');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const saved = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + id)).json(),
  );
  expect(saved.document.title).toBe('架构取舍复盘');
  expect(JSON.stringify(saved.document.doc)).toContain(
    '还未自动保存的个人判断',
  );
  await page.reload();
  await expect(title(page)).toHaveValue('架构取舍复盘');
  await expect(body(page)).toHaveText('还未自动保存的个人判断');
});
test('LIBRARY-RENAME-006 stale rename keeps the local proposal and never overwrites remote body', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await info(page, workspace.origin);
  await organize(page);
  const original = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + id)).json(),
  );
  await page.request.put('/api/articles/' + id + '/content', {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: original.headRevisionId,
      document: { ...original.document, title: '远端新标题' },
    },
  });
  await body(page).fill('本页观点');
  await page
    .getByRole('textbox', { name: '新标题', exact: true })
    .fill('本页拟议标题');
  await page.getByRole('button', { name: '保存标题', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '查看冲突', exact: true }),
  ).toBeVisible();
  await expect(body(page)).toHaveText('本页观点');
  await expect(title(page)).toHaveValue('本页拟议标题');
  expect(
    ArticleSnapshot.parse(
      await (await page.request.get('/api/articles/' + id)).json(),
    ).document.title,
  ).toBe('远端新标题');
});
test('LIBRARY-RENAME-006 late rename acknowledgement preserves newer title and body', async ({
  page,
}) => {
  await organize(page);
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let arrived = () => {};
  const waiting = new Promise<void>((r) => (arrived = r));
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
  await page
    .getByRole('textbox', { name: '新标题', exact: true })
    .fill('提交中的标题');
  await page.getByRole('button', { name: '保存标题', exact: true }).click();
  await waiting;
  await title(page).fill('等待期间的新标题');
  await body(page).fill('等待期间的新段落');
  release();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect(title(page)).toHaveValue('等待期间的新标题');
  await expect(body(page)).toHaveText('等待期间的新段落');
});
test('LIBRARY-TAGS-007 normalize tags without creating content revisions and render on narrow screens', async ({
  page,
  workspace,
}) => {
  const { id } = await info(page, workspace.origin);
  await organize(page);
  const before = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + id)).json(),
  );
  await tags(page).fill(' 技术 \né\ne\u0301\n技术\nAPI');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(page.getByText('标签已保存。', { exact: true })).toBeVisible();
  await expect(tags(page)).toHaveValue('API\né\n技术');
  expect(
    ArticleSnapshot.parse(
      await (await page.request.get('/api/articles/' + id)).json(),
    ),
  ).toEqual(before);
  await page.screenshot({
    path: 'test-results/article-organization-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/article-organization-mobile.png',
    fullPage: true,
  });
  await page.reload();
  await organize(page);
  await expect(tags(page)).toHaveValue('API\né\n技术');
});
test('LIBRARY-TAGS-007 unknown response is reconciled without duplicate writes or replacing newer tag input', async ({
  page,
  workspace,
}) => {
  const { id } = await info(page, workspace.origin);
  await organize(page);
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let arrived = () => {};
  const waiting = new Promise<void>((r) => (arrived = r));
  let writes = 0;
  await page.route('**/api/articles/*/metadata', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    writes++;
    await route.fetch();
    arrived();
    await gate;
    await route.abort('failed');
  });
  await tags(page).fill('第一批');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await waiting;
  await tags(page).fill('等待期间的新标签');
  release();
  await expect(
    page.getByRole('button', { name: '核对并重试标签', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '核对并重试标签', exact: true })
    .click();
  await expect(
    page.getByText('已确认提交，较新的标签输入仍未保存。', { exact: true }),
  ).toBeVisible();
  await expect(tags(page)).toHaveValue('等待期间的新标签');
  expect(writes).toBe(1);
  await page.unroute('**/api/articles/*/metadata');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(page.getByText('标签已保存。', { exact: true })).toBeVisible();
  expect(
    ArticleListItem.parse(
      await (
        await page.request.get('/api/articles/' + id + '/metadata')
      ).json(),
    ).metadataVersion,
  ).toBe(3);
});
test('LIBRARY-TAGS-007 conflicting tags require explicit reload and keep navigation blocked while organizing', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await info(page, workspace.origin);
  await organize(page);
  await tags(page).fill('我的标签');
  await page.request.put('/api/articles/' + id + '/metadata', {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseMetadataVersion: 1,
      tags: ['他页标签'],
    },
  });
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(
    page.getByText('服务器最新标签：他页标签', { exact: true }),
  ).toBeVisible();
  await expect(tags(page)).toHaveValue('我的标签');
  await expect(
    page.getByRole('button', { name: '新建文章', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: '放弃输入并载入最新标签', exact: true })
    .click();
  await expect(tags(page)).toHaveValue('他页标签');
  await tags(page).fill('他页标签\n我的标签');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(page.getByText('标签已保存。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭整理', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '新建文章', exact: true }),
  ).toBeEnabled();
});
test('LIBRARY-RENAME-006 organizing another article uses safe navigation before editing its title', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await info(page, workspace.origin);
  await page.request.post('/api/articles', {
    headers,
    data: { mutationId: crypto.randomUUID(), title: '第二篇' },
  });
  await body(page).fill('原稿尚未保存');
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page.getByRole('button', { name: '整理：第二篇', exact: true }).click();
  await page.getByRole('button', { name: '保存后切换', exact: true }).click();
  await expect(title(page)).toHaveValue('第二篇');
  await expect(tags(page)).toBeEnabled();
  await page
    .getByRole('textbox', { name: '新标题', exact: true })
    .fill('第二篇改名');
  await page.getByRole('button', { name: '保存标题', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const old = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + id)).json(),
  );
  expect(old.document.title).toBe('');
  expect(JSON.stringify(old.document.doc)).toContain('原稿尚未保存');
});
for (const field of ['新标题', '文章标签（一行一个）'])
  test(`LIBRARY-TAGS-007 ${field} composition blocks submit and closing the organizer`, async ({
    page,
  }) => {
    await organize(page);
    const input = page.getByRole('textbox', { name: field, exact: true });
    await input.dispatchEvent('compositionstart');
    await page
      .getByRole('button', {
        name: field === '新标题' ? '保存标题' : '保存标签',
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        field === '新标题' ? '请先完成标题选词。' : '请先完成标签选词。',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: '关闭整理', exact: true }).click();
    await expect(
      page.getByRole('region', { name: '整理文章', exact: true }),
    ).toBeVisible();
    await input.dispatchEvent('compositionend');
    await page.getByRole('button', { name: '关闭整理', exact: true }).click();
    await expect(
      page.getByRole('region', { name: '整理文章', exact: true }),
    ).toBeHidden();
  });
test('LIBRARY-TAGS-007 definitive write rejection unlocks explicit abandonment of tag input', async ({
  page,
}) => {
  await organize(page);
  await page.route('**/api/articles/*/metadata', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({
        status: 409,
        json: {
          code: 'ARTICLE_NOT_ACTIVE',
          message: '文章当前不可编辑，请刷新文章库。',
        },
      });
    else await route.continue();
  });
  await tags(page).fill('待提交标签');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(
    page.getByText('文章当前不可编辑，请刷新文章库。', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '放弃未提交输入并关闭', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: '整理文章', exact: true }),
  ).toBeHidden();
});
test('LIBRARY-TAGS-007 failed mutation lookup does not resend and a later lookup reconciles', async ({
  page,
}) => {
  await organize(page);
  let writes = 0;
  await page.route('**/api/articles/*/metadata', async (route) => {
    if (route.request().method() === 'PUT') {
      writes++;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await tags(page).fill('已落盘但无确认');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '核对并重试标签', exact: true }),
  ).toBeEnabled();
  await page.route('**/api/mutations/*', (route) => route.abort('failed'));
  await page
    .getByRole('button', { name: '核对并重试标签', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '核对并重试标签', exact: true }),
  ).toBeEnabled();
  expect(writes).toBe(1);
  await expect(
    page.getByRole('button', { name: '放弃未提交输入并关闭', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/api/mutations/*');
  await page
    .getByRole('button', { name: '核对并重试标签', exact: true })
    .click();
  await expect(page.getByText('标签已保存。', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});
test('LIBRARY-TAGS-007 explicit reload cannot replace text entered while metadata is loading', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await info(page, workspace.origin);
  await organize(page);
  await tags(page).fill('保留我的输入');
  await page.request.put('/api/articles/' + id + '/metadata', {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseMetadataVersion: 1,
      tags: ['远端'],
    },
  });
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(
    page.getByText('服务器最新标签：远端', { exact: true }),
  ).toBeVisible();
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let arrived = () => {};
  const waiting = new Promise<void>((r) => (arrived = r));
  await page.route('**/api/articles/*/metadata', async (route) => {
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await page
    .getByRole('button', { name: '放弃输入并载入最新标签', exact: true })
    .click();
  await waiting;
  await tags(page).fill('读取期间的新输入');
  release();
  await expect(
    page.getByText('读取期间输入已变化，原标签输入已保留，请重新确认载入。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(tags(page)).toHaveValue('读取期间的新输入');
  await expect(
    page.getByRole('button', { name: '保存标签', exact: true }),
  ).toBeDisabled();
});
test('LIBRARY-TAGS-007 a missing mutation retries the original immutable command before saving newer input', async ({
  page,
  workspace,
}) => {
  const { id } = await info(page, workspace.origin);
  await organize(page);
  let first = true;
  const commands: unknown[] = [];
  await page.route('**/api/articles/*/metadata', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    commands.push(route.request().postDataJSON());
    if (first) {
      first = false;
      await route.abort('failed');
    } else await route.continue();
  });
  await tags(page).fill('原请求');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '核对并重试标签', exact: true }),
  ).toBeEnabled();
  await tags(page).fill('后续标签');
  await page
    .getByRole('button', { name: '核对并重试标签', exact: true })
    .click();
  await expect(
    page.getByText('已确认提交，较新的标签输入仍未保存。', { exact: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
  await expect(tags(page)).toHaveValue('后续标签');
  expect(
    ArticleListItem.parse(
      await (
        await page.request.get('/api/articles/' + id + '/metadata')
      ).json(),
    ).tags,
  ).toEqual(['原请求']);
});
test('LIBRARY-TAGS-007 a rejected retry cannot erase the earlier unknown tag operation', async ({
  page,
}) => {
  await organize(page);
  let first = true;
  await page.route('**/api/articles/*/metadata', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    if (first) {
      first = false;
      await route.abort('failed');
    } else
      await route.fulfill({
        status: 403,
        json: { code: 'REQUEST_DENIED', message: '此次重试被拒绝' },
      });
  });
  await tags(page).fill('结果未知的标签');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '核对并重试标签', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: '核对并重试标签', exact: true })
    .click();
  await expect(page.getByText('此次重试被拒绝', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '核对并重试标签', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: '放弃未提交输入并关闭', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/api/articles/*/metadata');
  await page
    .getByRole('button', { name: '核对并重试标签', exact: true })
    .click();
  await expect(page.getByText('标签已保存。', { exact: true })).toBeVisible();
});
test('LIBRARY-TAGS-007 later remote metadata wins without silently adopting its baseline for local text', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await info(page, workspace.origin);
  await organize(page);
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let arrived = () => {};
  const waiting = new Promise<void>((r) => (arrived = r));
  await page.route('**/api/articles/*/metadata', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await tags(page).fill('本次提交');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await waiting;
  await page.request.put('/api/articles/' + id + '/metadata', {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseMetadataVersion: 2,
      tags: ['更晚的远端标签'],
    },
  });
  release();
  await expect(
    page.getByText('服务器最新标签：更晚的远端标签', { exact: true }),
  ).toBeVisible();
  await expect(tags(page)).toHaveValue('本次提交');
  await expect(
    page.getByRole('button', { name: '保存标签', exact: true }),
  ).toBeDisabled();
});
