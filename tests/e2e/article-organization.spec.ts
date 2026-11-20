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
  page.getByRole('textbox', { name: '每行一个标签', exact: true });
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
async function organize(
  page: Page,
  mode: '编辑标签' | '重命名' = '编辑标签',
  name = '未命名文章',
) {
  const library = page.getByRole('button', { name: '文章库', exact: true });
  if ((await library.getAttribute('aria-expanded')) !== 'true')
    await library.click();
  await page
    .getByRole('button', { name: name + '的更多操作', exact: true })
    .click();
  await page.getByRole('button', { name: mode, exact: true }).click();
  await expect(
    page.getByLabel(mode === '重命名' ? '标题' : '每行一个标签', {
      exact: true,
    }),
  ).toBeEnabled();
}
test('LIBRARY-RENAME-006 rename preserves unsaved body in the same article and survives reload', async ({
  page,
  workspace,
}) => {
  const { id } = await info(page, workspace.origin);
  await body(page).fill('还未自动保存的个人判断');
  await organize(page, '重命名');
  await page
    .getByRole('textbox', { name: '标题', exact: true })
    .fill('架构取舍复盘');
  await page.getByRole('button', { name: '保存', exact: true }).click();
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
  await body(page).fill('本页观点');
  await organize(page, '重命名');
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
  await page
    .getByRole('textbox', { name: '标题', exact: true })
    .fill('本页拟议标题');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
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
  await organize(page, '重命名');
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
    .getByRole('textbox', { name: '标题', exact: true })
    .fill('提交中的标题');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await waiting;
  // Deliver queued editor input programmatically while the modal owns keyboard focus.
  await page.locator('.article-title').evaluate((el) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, '等待期间的新标题');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page
    .locator('.mu-paragraph-content')
    .first()
    .evaluate((el) => {
      el.textContent = '等待期间的新段落';
    });
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
  await organize(page);
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
    page.getByRole('button', {
      name: '文章库',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: '放弃输入并载入最新标签', exact: true })
    .click();
  await expect(tags(page)).toHaveValue('他页标签');
  await tags(page).fill('他页标签\n我的标签');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(page.getByText('标签已保存。', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '文章库', exact: true }),
  ).toBeEnabled();
});
test('LIBRARY-RENAME-006 organizing another article preserves the open draft and filtered list', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await info(page, workspace.origin);
  const other = ArticleSnapshot.parse(
    await (
      await page.request.post('/api/articles', {
        headers,
        data: { mutationId: crypto.randomUUID(), title: '第二篇' },
      })
    ).json(),
  );
  await body(page).fill('我在写的原稿');
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜标题或标签' }).fill('第二篇');
  await page.getByRole('searchbox', { name: '搜标题或标签' }).press('Enter');
  await page.getByRole('button', { name: '第二篇的更多操作' }).click();
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await page.getByLabel('标题', { exact: true }).fill('第二篇修订');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await organize(page, '编辑标签', '第二篇修订');
  await tags(page).fill('复盘');
  await page.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(page.getByText('标签已保存。', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '打开：第二篇修订', exact: true }),
  ).toContainText('复盘');
  await expect(
    page.getByRole('searchbox', { name: '搜标题或标签' }),
  ).toHaveValue('第二篇');
  await expect(title(page)).toHaveValue('');
  await expect(body(page)).toHaveText('我在写的原稿');
  const saved = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + other.articleId)).json(),
  );
  expect(saved.document.title).toBe('第二篇修订');
  expect(saved.document.doc).toEqual(other.document.doc);
  await expect
    .poll(async () =>
      JSON.stringify(
        ArticleSnapshot.parse(
          await (await page.request.get('/api/articles/' + id)).json(),
        ).document.doc,
      ),
    )
    .toContain('我在写的原稿');
});
test('LIBRARY-RENAME-006 library rename reconciles a lost reply and protects a newer remote body', async ({
  page,
  workspace,
}) => {
  const { headers } = await info(page, workspace.origin);
  const other = ArticleSnapshot.parse(
    await (
      await page.request.post('/api/articles', {
        headers,
        data: { mutationId: crypto.randomUUID(), title: '旁稿' },
      })
    ).json(),
  );
  const path = '/api/articles/' + other.articleId;
  await organize(page, '重命名', '旁稿');
  let writes = 0;
  await page.route('**' + path + '/content', async (route) => {
    writes++;
    await route.fetch();
    await route.abort();
  });
  const input = page.getByLabel('标题', { exact: true });
  await input.fill('改过的旁稿');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '核对并重试标题' }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: '关闭面板' })).toBeDisabled();
  await page.getByRole('button', { name: '核对并重试标题' }).click();
  await expect(page.getByText('标题已保存。', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
  await page.unroute('**' + path + '/content');
  await organize(page, '重命名', '改过的旁稿');
  const latest = ArticleSnapshot.parse(
    await (await page.request.get(path)).json(),
  );
  const remote = {
    ...latest.document,
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '另一窗口写下的新段落' }],
        },
      ],
    },
  };
  expect(
    (
      await page.request.put(path + '/content', {
        headers,
        data: {
          mutationId: crypto.randomUUID(),
          baseRevisionId: latest.headRevisionId,
          document: remote,
        },
      })
    ).ok(),
  ).toBe(true);
  await input.fill('另一份标题提议');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.getByText('文章已变化。请关闭窗口，重新打开后核对最新标题。'),
  ).toBeVisible();
  await expect(input).toHaveValue('另一份标题提议');
  expect(
    ArticleSnapshot.parse(await (await page.request.get(path)).json()).document,
  ).toEqual(remote);
  await page.getByRole('button', { name: '关闭面板' }).click();
  await expect(title(page)).toHaveValue('');
});
for (const field of ['标题', '每行一个标签'])
  test(`LIBRARY-TAGS-007 ${field} composition blocks submit and closing the organizer`, async ({
    page,
  }) => {
    await organize(page, field === '标题' ? '重命名' : '编辑标签');
    const input = page.getByRole('textbox', { name: field, exact: true });
    await input.dispatchEvent('compositionstart');
    await page
      .getByRole('button', {
        name: field === '标题' ? '保存' : '保存标签',
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        field === '标题' ? '请先完成标题选词。' : '请先完成标签选词。',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: '关闭面板', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await input.dispatchEvent('compositionend');
    await page.getByRole('button', { name: '关闭面板', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
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
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
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
    page.getByRole('button', { name: '关闭面板', exact: true }),
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
    page.getByRole('button', { name: '关闭面板', exact: true }),
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
