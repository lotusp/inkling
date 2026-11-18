import { test, expect } from './fixtures';
import {
  ArticleListItem,
  ArticleSnapshot,
  AuthSession,
  WorkspaceInfo,
} from '@inkling/contracts';
import type { Page } from '@playwright/test';
const title = (page: Page) =>
  page.getByRole('textbox', { name: '文章标题', exact: true });
const body = (page: Page) =>
  page.getByRole('textbox', { name: '文章正文', exact: true });
async function context(page: Page, origin: string) {
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
async function transition(
  page: Page,
  origin: string,
  id: string,
  action: string,
) {
  const { headers } = await context(page, origin);
  const metadata = ArticleListItem.parse(
    await (await page.request.get(`/api/articles/${id}/metadata`)).json(),
  );
  const response = await page.request.post(`/api/articles/${id}/lifecycle`, {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseMetadataVersion: metadata.metadataVersion,
      action,
    },
  });
  expect(response.status()).toBe(200);
}
test('LIBRARY-ARCHIVE-009 archived reopening is read-only with readable history and disabled version mutations', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await context(page, workspace.origin);
  await title(page).fill('只读归档');
  await body(page).fill('保留判断与依据');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await transition(page, workspace.origin, id, 'archive');
  expect(
    (
      await page.request.post(`/api/articles/${id}/open`, {
        headers,
        data: { mutationId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(title(page)).toHaveValue('只读归档');
  await expect(title(page)).toBeDisabled();
  await expect(body(page)).toHaveAttribute('contenteditable', 'false');
  await expect(
    page.getByText('文章已归档，当前为只读。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '保存版本', exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: '版本 #1的更多操作' }),
  ).toBeHidden();
  await page
    .getByRole('listitem')
    .filter({ hasText: '初稿' })
    .getByRole('button', { name: '比较', exact: true })
    .click();
  await page.getByLabel('比较右侧版本').selectOption({ label: '#2' });
  await expect(
    page.getByRole('region', { name: '版本差异', exact: true }),
  ).toBeVisible();
  await transition(page, workspace.origin, id, 'unarchive');
  await page.getByRole('button', { name: '核对文章状态', exact: true }).click();
  await expect(title(page)).toBeEnabled();
  await expect(body(page)).toHaveText('保留判断与依据');
});
test('LIBRARY-ARCHIVE-009 another tab archives while typing; refused save keeps draft and resumes only after explicit state check', async ({
  page,
  workspace,
}) => {
  const { id } = await context(page, workspace.origin);
  await transition(page, workspace.origin, id, 'archive');
  await body(page).fill('另一标签变化之后仍应保留的洞见');
  await expect(
    page.getByText('文章已归档，当前为只读。', { exact: true }),
  ).toBeVisible();
  await expect(body(page)).toHaveText('另一标签变化之后仍应保留的洞见');
  await expect(body(page)).toHaveAttribute('contenteditable', 'false');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '下载备份', exact: true }),
  ).toBeVisible();
  await transition(page, workspace.origin, id, 'unarchive');
  await page.getByRole('button', { name: '核对文章状态', exact: true }).click();
  await expect(title(page)).toBeEnabled();
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const saved = ArticleSnapshot.parse(
    await (await page.request.get(`/api/articles/${id}`)).json(),
  );
  expect(JSON.stringify(saved.document.doc)).toContain(
    '另一标签变化之后仍应保留的洞见',
  );
});
test('LIBRARY-ARCHIVE-009 failed state check pauses writes without replacing input, then can retry', async ({
  page,
}) => {
  await body(page).fill('核对失败仍在本页');
  await page.route('**/api/articles/*/metadata', (route) => route.abort());
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page.getByRole('button', { name: '搜索选项' }).click();
  await page.getByRole('button', { name: '刷新文章库' }).click();
  await page.getByRole('button', { name: '关闭文章库' }).click();
  await expect(
    page.getByText('文章状态尚未确认，已暂停编辑。', { exact: true }),
  ).toBeVisible();
  await expect(body(page)).toHaveText('核对失败仍在本页');
  await expect(title(page)).toBeDisabled();
  await page.unroute('**/api/articles/*/metadata');
  await page.getByRole('button', { name: '核对文章状态', exact: true }).click();
  await expect(title(page)).toBeEnabled();
  await expect(body(page)).toHaveText('核对失败仍在本页');
});

test('LIBRARY-ARCHIVE-009 a late rejection preserves composition until commit and retains recoveries on archived reopening', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await context(page, workspace.origin);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const sent = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/api/articles/*/content', async (route) => {
    requested();
    await held;
    await route.continue();
  });
  await body(page).fill('先发出的内容');
  await sent;
  await body(page).dispatchEvent('compositionstart');
  await body(page).fill('尚在选词的个人判断');
  await transition(page, workspace.origin, id, 'archive');
  release();
  await expect(
    page.getByText('文章已归档，当前为只读。', { exact: true }),
  ).toBeVisible();
  await expect(body(page)).toHaveAttribute('contenteditable', 'true');
  await body(page).dispatchEvent('compositionend');
  await expect(body(page)).toHaveAttribute('contenteditable', 'false');
  await expect(body(page)).toHaveText('尚在选词的个人判断');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page.request.post(`/api/articles/${id}/open`, {
    headers,
    data: { mutationId: crypto.randomUUID() },
  });
  const other = await page.context().newPage();
  try {
    await other.goto(workspace.origin);
    await expect(
      other.getByRole('region', { name: '待恢复草稿' }),
    ).toBeVisible();
    await expect(
      other.getByRole('button', { name: '恢复此草稿', exact: true }),
    ).toBeDisabled();
    await expect(
      other.getByRole('button', { name: '下载此副本', exact: true }),
    ).toBeEnabled();
    await expect(
      other.getByText('尚在选词的个人判断', { exact: true }),
    ).toBeVisible();
    await expect(title(other)).toBeDisabled();
  } finally {
    await other.close();
  }
});

const confirmation = (page: Page) =>
  page.getByRole('region', { name: '文章状态操作确认', exact: true });
async function library(page: Page, state: string) {
  if (
    !(await page
      .getByRole('region', { name: '文章列表', exact: true })
      .isVisible())
  )
    await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page
    .getByLabel('文章范围')
    .selectOption({ label: state === '活动文章' ? '写作中' : state });
}
async function currentAction(page: Page, action: string) {
  await library(page, action === '取消归档' ? '已归档' : '活动文章');
  await page
    .getByRole('listitem')
    .filter({ has: page.locator('[aria-current="page"]') })
    .getByRole('button', { name: /的更多操作$/ })
    .click();
  await page.getByRole('button', { name: action, exact: true }).click();
}
test('LIBRARY-ARCHIVE-009/TRASH-010/RESTORE-011 author archives, unarchives, cancels trash, trashes last draft and restores without losing history', async ({
  page,
  workspace,
}, testInfo) => {
  const { id } = await context(page, workspace.origin);
  await title(page).fill('数据库取舍');
  await body(page).fill('用自己的实践检验设计');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const original = await (
    await page.request.get(`/api/articles/${id}/revisions?all=true`)
  ).json();
  await currentAction(page, '归档');
  await confirmation(page)
    .getByRole('button', { name: '确认归档', exact: true })
    .click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(
    page.getByText('文章已归档，当前为只读。', { exact: true }),
  ).toBeVisible();
  await expect(title(page)).toBeDisabled();
  await library(page, '已归档');
  await expect(
    page.getByRole('list', { name: '已归档', exact: true }),
  ).toContainText('数据库取舍');
  await currentAction(page, '取消归档');
  await confirmation(page)
    .getByRole('button', { name: '确认取消归档', exact: true })
    .click();
  await expect(title(page)).toBeEnabled();
  await currentAction(page, '移入回收站');
  await confirmation(page)
    .getByRole('button', { name: '取消操作', exact: true })
    .click();
  expect(
    ArticleListItem.parse(
      await (await page.request.get(`/api/articles/${id}/metadata`)).json(),
    ).state,
  ).toBe('active');
  await currentAction(page, '移入回收站');
  await expect(confirmation(page)).toContainText(
    '保留正文、历史和浏览器恢复副本',
  );
  await page.screenshot({
    path: testInfo.outputPath('lifecycle-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    confirmation(page).getByRole('button', {
      name: '确认移入回收站',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('lifecycle-mobile.png'),
    fullPage: true,
  });
  await confirmation(page)
    .getByRole('button', { name: '确认移入回收站', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '开始写作', exact: true }),
  ).toBeVisible();
  await library(page, '回收站');
  await expect(
    page.getByRole('button', { name: '打开：数据库取舍', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: '恢复：数据库取舍', exact: true })
    .click();
  await confirmation(page)
    .getByRole('button', { name: '确认恢复文章', exact: true })
    .click();
  await expect(confirmation(page)).toHaveCount(0);
  await library(page, '活动文章');
  await page
    .getByRole('button', { name: '打开：数据库取舍', exact: true })
    .click();
  await expect(body(page)).toHaveText('用自己的实践检验设计');
  expect(
    await (
      await page.request.get(`/api/articles/${id}/revisions?all=true`)
    ).json(),
  ).toEqual(original);
});
test('LIBRARY-ARCHIVE-009 explicit keep preserves an unsaved draft across archive and unarchive', async ({
  page,
}) => {
  await page.route('**/api/articles/*/content', (route) => route.abort());
  await body(page).fill('尚未提交的个人判断');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await currentAction(page, '归档');
  await confirmation(page)
    .getByRole('button', { name: '保留草稿并归档', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: '待恢复草稿', exact: true }),
  ).toContainText('尚未提交的个人判断');
  await expect(
    page.getByRole('button', { name: '恢复此草稿', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/api/articles/*/content');
  await currentAction(page, '取消归档');
  await confirmation(page)
    .getByRole('button', { name: '保留草稿并取消归档', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '恢复此草稿', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(body(page)).toHaveText('尚未提交的个人判断');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});
test('LIBRARY-TRASH-010 a stale confirmation cannot adopt newer metadata or discard current typing', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await context(page, workspace.origin);
  await currentAction(page, '移入回收站');
  await expect(
    confirmation(page).getByRole('button', {
      name: '确认移入回收站',
      exact: true,
    }),
  ).toBeEnabled();
  const current = ArticleListItem.parse(
    await (await page.request.get(`/api/articles/${id}/metadata`)).json(),
  );
  await page.request.put(`/api/articles/${id}/metadata`, {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseMetadataVersion: current.metadataVersion,
      tags: ['另页修改'],
    },
  });
  await body(page).fill('确认框打开后继续写的观点');
  await confirmation(page)
    .getByRole('button', { name: '保存并移入回收站', exact: true })
    .click();
  await expect(confirmation(page)).toContainText('文章状态或标签已被更新');
  await expect(body(page)).toHaveText('确认框打开后继续写的观点');
  expect(
    ArticleListItem.parse(
      await (await page.request.get(`/api/articles/${id}/metadata`)).json(),
    ).state,
  ).toBe('active');
  await confirmation(page)
    .getByRole('button', { name: '取消操作', exact: true })
    .click();
  await expect(title(page)).toBeEnabled();
});
test('LIBRARY-ARCHIVE-009 unknown lifecycle result is queried before retry; failed lookup never sends a second command', async ({
  page,
}) => {
  let writes = 0;
  await page.route('**/api/articles/*/lifecycle', async (route) => {
    writes++;
    await route.fetch();
    await route.abort();
  });
  await currentAction(page, '归档');
  await confirmation(page)
    .getByRole('button', { name: '确认归档', exact: true })
    .click();
  await expect(
    confirmation(page).getByText('结果尚未确认，请核对同一次操作。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    confirmation(page).getByRole('button', { name: '取消操作', exact: true }),
  ).toHaveCount(0);
  await page.route('**/api/mutations/*', (route) => route.abort());
  await confirmation(page)
    .getByRole('button', { name: '核对并重试', exact: true })
    .click();
  await expect(
    confirmation(page).getByRole('button', { name: '核对并重试', exact: true }),
  ).toBeEnabled();
  expect(writes).toBe(1);
  await page.unroute('**/api/mutations/*');
  await confirmation(page)
    .getByRole('button', { name: '核对并重试', exact: true })
    .click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(
    page.getByText('文章已归档，当前为只读。', { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test('LIBRARY-TRASH-010 lifecycle cannot interrupt title composition or execute from an obsolete confirmation', async ({
  page,
  workspace,
}) => {
  const { id } = await context(page, workspace.origin);
  await title(page).dispatchEvent('compositionstart');
  await currentAction(page, '移入回收站');
  await expect(confirmation(page)).toHaveCount(0);
  await title(page).dispatchEvent('compositionend');
  await currentAction(page, '移入回收站');
  await expect(
    confirmation(page).getByRole('button', {
      name: '确认移入回收站',
      exact: true,
    }),
  ).toBeEnabled();
  await body(page).dispatchEvent('compositionstart');
  await confirmation(page)
    .getByRole('button', { name: /^(确认|保存并)移入回收站$/ })
    .click();
  await expect(confirmation(page)).toContainText('请先完成中文选词');
  expect(
    ArticleListItem.parse(
      await (await page.request.get(`/api/articles/${id}/metadata`)).json(),
    ).state,
  ).toBe('active');
  await body(page).dispatchEvent('compositionend');
  await confirmation(page)
    .getByRole('button', { name: '取消操作', exact: true })
    .click();
  await expect(body(page)).toHaveAttribute('contenteditable', 'true');
});

test('LIBRARY-RESTORE-011 restoring a previously archived article keeps it read-only and does not switch the active draft', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await context(page, workspace.origin);
  await transition(page, workspace.origin, id, 'archive');
  await transition(page, workspace.origin, id, 'trash');
  const other = ArticleSnapshot.parse(
    await (
      await page.request.post('/api/articles', {
        headers,
        data: { mutationId: crypto.randomUUID(), title: '仍在写的稿件' },
      })
    ).json(),
  );
  await page.reload();
  await expect(title(page)).toHaveValue('仍在写的稿件');
  await library(page, '回收站');
  await page
    .getByRole('button', { name: '恢复：未命名文章', exact: true })
    .click();
  await confirmation(page)
    .getByRole('button', { name: '确认恢复文章', exact: true })
    .click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(title(page)).toHaveValue('仍在写的稿件');
  expect((await context(page, workspace.origin)).id).toBe(other.articleId);
  await library(page, '已归档');
  await page
    .getByRole('button', { name: '打开：未命名文章', exact: true })
    .click();
  await expect(
    page.getByText('文章已归档，当前为只读。', { exact: true }),
  ).toBeVisible();
  await expect(title(page)).toBeDisabled();
});
test('LIBRARY-TRASH-010 failed browser draft protection prevents lifecycle writes and preserves the rescue', async ({
  page,
}) => {
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/lifecycle')) writes++;
  });
  await page.route('**/api/articles/*/content', (route) => route.abort());
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('test full', 'QuotaExceededError');
    };
  });
  await body(page).fill('不能因删除而丢弃的输入');
  await currentAction(page, '移入回收站');
  await confirmation(page)
    .getByRole('button', { name: '保留草稿并移入回收站', exact: true })
    .click();
  await expect(confirmation(page)).toContainText(
    '恢复副本未能写入，已停止切换',
  );
  expect(writes).toBe(0);
  await expect(body(page)).toHaveText('不能因删除而丢弃的输入');
  await expect(
    page.getByRole('button', { name: '下载备份', exact: true }),
  ).toBeVisible();
});
test('LIBRARY-ARCHIVE-009 an uncommitted unknown operation retries its original payload and a rejected retry cannot erase it', async ({
  page,
}) => {
  const commands: string[] = [];
  let queries = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/mutations/')) queries++;
  });
  await page.route('**/api/articles/*/lifecycle', async (route) => {
    commands.push(route.request().postData()!);
    if (commands.length === 1) await route.abort();
    else if (commands.length === 2)
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'FORBIDDEN', message: '测试拒绝重试' }),
      });
    else await route.continue();
  });
  await currentAction(page, '归档');
  await confirmation(page)
    .getByRole('button', { name: '确认归档', exact: true })
    .click();
  await expect(
    confirmation(page).getByRole('button', { name: '核对并重试', exact: true }),
  ).toBeEnabled();
  await confirmation(page)
    .getByRole('button', { name: '核对并重试', exact: true })
    .click();
  await expect(confirmation(page)).toContainText('测试拒绝重试');
  await expect(
    confirmation(page).getByRole('button', { name: '取消操作', exact: true }),
  ).toHaveCount(0);
  await confirmation(page)
    .getByRole('button', { name: '核对并重试', exact: true })
    .click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(title(page)).toBeDisabled();
  expect(commands).toHaveLength(3);
  expect(new Set(commands).size).toBe(1);
  expect(queries).toBe(2);
});
test('LIBRARY-ARCHIVE-009 a failed handoff retries opening without repeating the committed lifecycle command', async ({
  page,
}) => {
  let writes = 0;
  const opens: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/lifecycle')) writes++;
  });
  await page.route('**/api/articles/*/open', async (route) => {
    opens.push(route.request().postData()!);
    const response = await route.fetch();
    if (opens.length === 1) await route.abort();
    else await route.fulfill({ response });
  });
  await currentAction(page, '归档');
  await confirmation(page)
    .getByRole('button', { name: '确认归档', exact: true })
    .click();
  await expect(confirmation(page)).toContainText(
    '操作已提交，正在核对最新状态与打开结果',
  );
  await expect(
    confirmation(page).getByRole('button', { name: '核对并重试', exact: true }),
  ).toBeEnabled();
  await body(page).fill('操作已提交后继续思考的输入');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await confirmation(page)
    .getByRole('button', { name: '保留草稿并核对', exact: true })
    .click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(title(page)).toBeDisabled();
  await expect(
    page.getByRole('region', { name: '待恢复草稿', exact: true }),
  ).toContainText('操作已提交后继续思考的输入');
  expect(writes).toBe(1);
  expect(opens).toHaveLength(2);
  expect(opens[0]).toBe(opens[1]);
});
test('LIBRARY-FIND-008 switching state discards a late archived list and renders the trash safely', async ({
  page,
  workspace,
}, testInfo) => {
  const { headers } = await context(page, workspace.origin);
  const archived = ArticleSnapshot.parse(
    await (
      await page.request.post('/api/articles', {
        headers,
        data: { mutationId: crypto.randomUUID(), title: '已归档的判断' },
      })
    ).json(),
  );
  await transition(page, workspace.origin, archived.articleId, 'archive');
  const trashed = ArticleSnapshot.parse(
    await (
      await page.request.post('/api/articles', {
        headers,
        data: { mutationId: crypto.randomUUID(), title: '回收站中的复盘' },
      })
    ).json(),
  );
  await transition(page, workspace.origin, trashed.articleId, 'trash');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const received = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let finished!: () => void;
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  await page.route('**/api/articles?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('state') !== 'archived')
      return route.continue();
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response });
    finished();
  });
  await library(page, '已归档');
  await received;
  await library(page, '回收站');
  await expect(
    page.getByRole('list', { name: '回收站', exact: true }),
  ).toContainText('回收站中的复盘');
  release();
  await done;
  await expect(
    page.getByRole('list', { name: '回收站', exact: true }),
  ).not.toContainText('已归档的判断');
  await expect(
    page.getByRole('button', { name: '打开：回收站中的复盘', exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('trash-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: '恢复：回收站中的复盘', exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath('trash-mobile.png'),
    fullPage: true,
  });
});

test('LIBRARY-TRASH-010 a missing unknown mutation with a newer metadata baseline requires a fresh confirmation', async ({
  page,
  workspace,
}) => {
  const { id, headers } = await context(page, workspace.origin);
  let writes = 0;
  await page.route('**/api/articles/*/lifecycle', async (route) => {
    writes++;
    await route.abort();
  });
  await currentAction(page, '移入回收站');
  await confirmation(page)
    .getByRole('button', { name: '确认移入回收站', exact: true })
    .click();
  await expect(
    confirmation(page).getByRole('button', { name: '核对并重试', exact: true }),
  ).toBeEnabled();
  const metadata = ArticleListItem.parse(
    await (await page.request.get(`/api/articles/${id}/metadata`)).json(),
  );
  await page.request.put(`/api/articles/${id}/metadata`, {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseMetadataVersion: metadata.metadataVersion,
      tags: ['已经更新'],
    },
  });
  await confirmation(page)
    .getByRole('button', { name: '核对并重试', exact: true })
    .click();
  await expect(confirmation(page)).toContainText('请取消后重新查看并确认');
  await expect(
    confirmation(page).getByRole('button', { name: '取消操作', exact: true }),
  ).toBeEnabled();
  await expect(
    confirmation(page).getByRole('button', {
      name: '确认移入回收站',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
  expect(
    ArticleListItem.parse(
      await (await page.request.get(`/api/articles/${id}/metadata`)).json(),
    ).state,
  ).toBe('active');
});
