import { test, expect } from './fixtures';
import { ArticleSnapshot, WorkspaceInfo } from '@inkling/contracts';

test('ARTICLE-LOCAL-007 continuing the server version preserves an unchosen recovery copy', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('暂时不采用的离线观点');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/articles/*/content');
  await page.reload();
  await page
    .getByRole('button', { name: '保留副本，使用服务器版本', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: '待恢复草稿' }),
  ).not.toBeVisible();
  await expect(editor).toBeEmpty();
  await editor.fill('从服务器稿件继续形成的新想法');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  const panel = page.getByRole('region', { name: '待恢复草稿' });
  await expect(
    panel.getByRole('button', { name: '恢复此草稿', exact: true }),
  ).toHaveCount(1);
  await expect(panel).toContainText('暂时不采用的离线观点');
  await expect(editor).toHaveText('从服务器稿件继续形成的新想法');
});

test('ARTICLE-LOCAL-007 lost acknowledgement and newer typing recover without replaying a commit', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  let arrived = () => {},
    release = () => {};
  const committed = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route('**/api/articles/*/content', async (route) => {
    writes++;
    if (writes === 1) {
      await route.fetch();
      arrived();
      await gate;
      await route.abort('failed');
    } else await route.continue();
  });
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('已提交但还没有确认');
  await committed;
  await editor.fill('在等待期间继续形成的新观点');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(editor).toHaveText('在等待期间继续形成的新观点');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const info = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const article = ArticleSnapshot.parse(
    await (
      await page.request.get('/api/articles/' + info.currentArticleId)
    ).json(),
  );
  expect(article.headSeq).toBe(3);
  expect(writes).toBe(2);
});

test('ARTICLE-LOCAL-007 failed mutation lookup cannot authorize a replay', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  let writes = 0;
  await page.route('**/api/articles/*/content', async (route) => {
    writes++;
    await route.abort('failed');
  });
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('等待核对的草稿');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.route('**/api/mutations/*', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'STORAGE_UNAVAILABLE', message: '暂时不能核对' },
    }),
  );
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(page.getByRole('region', { name: '待恢复草稿' })).toContainText(
    '暂时不能核对',
  );
  await expect(editor).toBeEmpty();
  expect(writes).toBe(1);
  await page.unroute('**/api/mutations/*');
  await page.unroute('**/api/articles/*/content');
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(editor).toHaveText('等待核对的草稿');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});

test('WORKSPACE-AUTH-003 real service restart and new access link preserve offline typing', async ({
  page,
  workspace,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('停机前的稿件');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await workspace.stop();
  await editor.fill('服务停止后继续写下的洞见');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  const url = await workspace.restart();
  await page.goto(url);
  await expect(page).toHaveURL(workspace.origin + '/');
  await expect(page.getByText('工作空间已连接', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(editor).toHaveText('服务停止后继续写下的洞见');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toHaveText('服务停止后继续写下的洞见');
});

test('ARTICLE-LOCAL-007 a newer server head blocks recovered stale input from overwriting it', async ({
  page,
  workspace,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('离线时的个人观点');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  const info = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const path = '/api/articles/' + info.currentArticleId;
  const current = ArticleSnapshot.parse(
    await (await page.request.get(path)).json(),
  );
  const session = (await (
    await page.request.get('/api/auth/session')
  ).json()) as { csrfToken: string };
  const response = await page.request.put(path + '/content', {
    headers: { origin: workspace.origin, 'x-csrf-token': session.csrfToken },
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: current.headRevisionId,
      document: { ...current.document, title: '另一标签先更新的标题' },
    },
  });
  expect(response.ok()).toBe(true);
  await page.unroute('**/api/articles/*/content');
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(editor).toHaveText('离线时的个人观点');
  await expect(
    page.getByText(
      '服务器已有新版本。恢复草稿已保留，普通保存已暂停，请先比较两份内容。',
    ),
  ).toBeVisible();
  await editor.press('ControlOrMeta+s');
  const server = ArticleSnapshot.parse(
    await (await page.request.get(path)).json(),
  );
  expect(server.headSeq).toBe(2);
  expect(server.document.title).toBe('另一标签先更新的标题');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: '待恢复草稿' })).toContainText(
    '离线时的个人观点',
  );
});

test('ARTICLE-LOCAL-007 cloned client IDs retain two isolated recovery choices', async ({
  page,
  context,
  workspace,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const clientId = await page.evaluate(() =>
    sessionStorage.getItem('inkling-draft-client'),
  );
  const second = await context.newPage();
  second.on('dialog', (dialog) => dialog.accept());
  await second.addInitScript((id) => {
    if (id) sessionStorage.setItem('inkling-draft-client', id);
  }, clientId);
  await second.goto(workspace.origin);
  await expect(second.getByLabel('文章标题', { exact: true })).toBeEnabled();
  expect(
    await second.evaluate(() => sessionStorage.getItem('inkling-draft-client')),
  ).not.toBe(clientId);
  for (const [tab, text] of [
    [page, '第一标签的离线思考'],
    [second, '第二标签的独立思考'],
  ] as const) {
    await tab.route('**/api/articles/*/content', (route) =>
      route.abort('failed'),
    );
    await tab
      .getByRole('textbox', { name: '文章正文', exact: true })
      .fill(text);
    await expect(
      tab.getByText('浏览器恢复副本已更新', { exact: true }),
    ).toBeVisible();
  }
  await second.close();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(workspace.origin);
  const panel = reopened.getByRole('region', { name: '待恢复草稿' });
  await expect(
    panel.getByRole('button', { name: '恢复此草稿', exact: true }),
  ).toHaveCount(2);
  await expect(panel).toContainText('第一标签的离线思考');
  await expect(panel).toContainText('第二标签的独立思考');
  await panel
    .locator('.recovery-card')
    .filter({ hasText: '第一标签的离线思考' })
    .getByRole('button', { name: '恢复此草稿' })
    .click();
  await expect(
    reopened.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toHaveText('第一标签的离线思考');
  await expect(panel).not.toBeVisible();
  await expect(reopened.getByText('已保存', { exact: true })).toBeVisible();
  await reopened.reload();
  await expect(
    panel.getByRole('button', { name: '恢复此草稿', exact: true }),
  ).toHaveCount(1);
  await expect(panel).toContainText('第二标签的独立思考');
  await reopened.close();
});

test('ARTICLE-LOCAL-007 an offline draft survives reload and is restored only by choice', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('服务端已保存的起点');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  await editor.fill('断线后产生的新洞见');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/articles/*/content');
  await page.reload();
  await expect(page.getByRole('region', { name: '待恢复草稿' })).toBeVisible();
  await expect(editor).toHaveText('服务端已保存的起点');
  await expect(editor).not.toBeEditable();
  await page.screenshot({
    path: 'test-results/recovery-choices-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.locator('.app-header')).toHaveCount(1);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.getByRole('status').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'test-results/recovery-choices-mobile-bottom.png',
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.screenshot({ path: 'test-results/recovery-choices-mobile.png' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(editor).toHaveText('断线后产生的新洞见');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toHaveText('断线后产生的新洞见');
  await expect(
    page.getByRole('region', { name: '待恢复草稿' }),
  ).not.toBeVisible();
});
