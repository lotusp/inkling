import { test, expect } from './fixtures';
import {
  ArticleSnapshot,
  AuthSession,
  WorkspaceInfo,
} from '@inkling/contracts';
import type { Page } from '@playwright/test';
const body = (page: Page) =>
  page.getByRole('textbox', { name: '文章正文', exact: true });
const title = (page: Page) =>
  page.getByRole('textbox', { name: '文章标题', exact: true });
async function seed(page: Page, origin: string) {
  const workspace = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const id = workspace.currentArticleId!;
  const headers = {
    origin,
    'x-csrf-token': AuthSession.parse(
      await (await page.request.get('/api/auth/session')).json(),
    ).csrfToken,
  };
  const initial = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + id)).json(),
  );
  await page.request.put(`/api/articles/${id}/content`, {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: initial.headRevisionId,
      document: {
        ...initial.document,
        title: '长文复盘',
        doc: {
          type: 'doc',
          content: Array.from({ length: 70 }, (_, i) => ({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `段落${i}：通过实际经验验证技术判断，记录适用条件和取舍。`,
              },
            ],
          })),
        },
      },
    },
  });
  await page.reload();
  await expect(title(page)).toHaveValue('长文复盘');
  await expect(title(page)).toBeEnabled();
  return {
    id,
    headers,
    key: `inkling:position:v1:${workspace.workspaceId}:${id}`,
  };
}
async function place(page: Page) {
  await body(page).focus();
  await body(page).evaluate((element) => {
    const text = element.querySelectorAll('p')[14]!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 16, text, 5);
  });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('通过实际经验验证技术判');
  await body(page).evaluate((element) =>
    window.scrollTo(
      0,
      element.getBoundingClientRect().top + window.scrollY + 480,
    ),
  );
}
async function offset(page: Page) {
  return body(page).evaluate((element) => -element.getBoundingClientRect().top);
}
async function choose(page: Page, name: string) {
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page
    .getByRole('button', { name: '打开：' + name, exact: true })
    .click();
  await expect(title(page)).toHaveValue(name);
  await expect(title(page)).toBeEnabled();
}
test('LIBRARY-POSITION-012 same-revision reload restores backward selection and relative scroll without a revision', async ({
  page,
  workspace,
}) => {
  const { id, key } = await seed(page, workspace.origin);
  const before = await (
    await page.request.get(`/api/articles/${id}/revisions?all=true`)
  ).json();
  await place(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .not.toBeNull();
  await page.reload();
  await expect(title(page)).toBeEnabled();
  await expect.poll(() => offset(page)).toBeCloseTo(480, 0);
  await body(page).evaluate((element) =>
    element.focus({ preventScroll: true }),
  );
  await expect
    .poll(() =>
      page.evaluate(() => ({
        text: window.getSelection()?.anchorNode?.textContent,
        anchor: window.getSelection()?.anchorOffset,
        head: window.getSelection()?.focusOffset,
      })),
    )
    .toMatchObject({
      text: '段落14：通过实际经验验证技术判断，记录适用条件和取舍。',
      anchor: 16,
      head: 5,
    });
  expect(
    await (
      await page.request.get(`/api/articles/${id}/revisions?all=true`)
    ).json(),
  ).toEqual(before);
});
test('LIBRARY-POSITION-012 navigation isolates articles and restores the previous reading position', async ({
  page,
  workspace,
}) => {
  const { headers, id, key } = await seed(page, workspace.origin);
  await page.request.post('/api/articles', {
    headers,
    data: { mutationId: crypto.randomUUID(), title: '第二篇' },
  });
  // Keep the live tab on the first article; the global pointer is not its session.
  await place(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .not.toBeNull();
  await choose(page, '第二篇');
  await expect(body(page)).toBeInViewport();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await choose(page, '长文复盘');
  await expect.poll(() => offset(page)).toBeCloseTo(480, 0);
  expect(
    WorkspaceInfo.parse(await (await page.request.get('/api/workspace')).json())
      .currentArticleId,
  ).toBe(id);
});
test('LIBRARY-POSITION-012 stale, invalid and cross-article positions fall back to the start', async ({
  page,
  workspace,
}) => {
  const { id, key, headers } = await seed(page, workspace.origin);
  await place(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .not.toBeNull();
  const raw = await page.evaluate((key) => localStorage.getItem(key)!, key);
  const snapshot = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + id)).json(),
  );
  await page.request.put(`/api/articles/${id}/content`, {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: snapshot.headRevisionId,
      document: { ...snapshot.document, title: '新修订' },
    },
  });
  await page.reload();
  await expect(title(page)).toHaveValue('新修订');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(title(page)).toBeInViewport();
  const latest = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + id)).json(),
  );
  await page.addInitScript(() => {
    const pending = sessionStorage.getItem('position-fixture');
    if (pending) {
      const fixture = JSON.parse(pending);
      localStorage.setItem(fixture.key, fixture.raw);
      sessionStorage.removeItem('position-fixture');
    }
  });
  for (const patch of [
    { anchor: 999999 },
    { scrollTop: -1 },
    { articleId: crypto.randomUUID() },
    { head: 0 },
  ]) {
    await page.evaluate(
      ({ key, raw, revisionId, patch }) =>
        sessionStorage.setItem(
          'position-fixture',
          JSON.stringify({
            key,
            raw: JSON.stringify({ ...JSON.parse(raw), revisionId, ...patch }),
          }),
        ),
      { key, raw, revisionId: latest.headRevisionId, patch },
    );
    // pagehide must not replace the deliberately invalid fixture with a new position.
    await page.reload();
    await expect(title(page)).toBeEnabled();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect(title(page)).toBeInViewport();
  }
});
test('LIBRARY-POSITION-012 unavailable position storage does not block body saving or navigation', async ({
  page,
  workspace,
}) => {
  const { headers } = await seed(page, workspace.origin);
  await page.request.post('/api/articles', {
    headers,
    data: { mutationId: crypto.randomUUID(), title: '仍能打开' },
  });
  await page.evaluate(() => {
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('inkling:position:'))
        throw new DOMException('blocked', 'SecurityError');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('inkling:position:'))
        throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await place(page);
  await expect(
    page.getByText('编辑位置无法保留，正文保存不受影响。', { exact: true }),
  ).toBeVisible();
  await title(page).fill('正文照常保存');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await choose(page, '仍能打开');
  await expect(title(page)).toHaveValue('仍能打开');
});

test('LIBRARY-POSITION-012 a confirmed save advances the position baseline without adding an extra revision', async ({
  page,
  workspace,
}) => {
  const { id, key } = await seed(page, workspace.origin);
  await place(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .not.toBeNull();
  await title(page).fill('已确认的新标题');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const snapshot = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + id)).json(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).revisionId,
        key,
      ),
    )
    .toBe(snapshot.headRevisionId);
  await page.reload();
  await expect(title(page)).toHaveValue('已确认的新标题');
  await expect.poll(() => offset(page)).toBeCloseTo(480, 0);
  expect(
    ArticleSnapshot.parse(
      await (await page.request.get('/api/articles/' + id)).json(),
    ).headSeq,
  ).toBe(snapshot.headSeq);
});
test('LIBRARY-POSITION-012 unselected recovery copies do not receive a saved server position', async ({
  page,
  workspace,
}) => {
  const { key } = await seed(page, workspace.origin);
  await place(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .not.toBeNull();
  await page.route('**/api/articles/*/content', (route) => route.abort());
  await body(page).fill('未保存且不应套用旧长文坐标的输入');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByRole('region', { name: '待恢复草稿', exact: true }),
  ).toContainText('未保存且不应套用旧长文坐标的输入');
  await expect(body(page)).toHaveAttribute('contenteditable', 'false');
  expect(await offset(page)).not.toBeCloseTo(480, 0);
});
test('LIBRARY-POSITION-012 user input before a delayed restoration frame cancels the jump', async ({
  page,
  workspace,
}) => {
  const { key } = await seed(page, workspace.origin);
  await place(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .not.toBeNull();
  await page.addInitScript(() => {
    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 500);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  });
  await page.reload();
  await expect(title(page)).toBeEnabled();
  await title(page).click();
  await title(page).fill('打开后立即输入');
  const before = await page.evaluate(() => window.scrollY);
  // External frame scheduling is deliberately delayed; observe beyond that boundary.
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(before, 0);
  await expect(title(page)).toBeFocused();
  await expect(title(page)).toHaveValue('打开后立即输入');
});

test('LIBRARY-DESK-014 closing the narrow library returns to the same paragraph', async ({
  page,
  workspace,
}) => {
  await page.setViewportSize({ width: 375, height: 860 });
  await seed(page, workspace.origin);
  await place(page);
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await expect(body(page)).toBeHidden();
  await page.getByRole('button', { name: '关闭文章库' }).press('Escape');
  await expect(body(page)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(before, 0);
  await expect.poll(() => offset(page)).toBeCloseTo(480, 0);
});
