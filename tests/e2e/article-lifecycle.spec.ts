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
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '保存并命名当前稿', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '查看并恢复版本 #1', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('比较左侧版本').selectOption({ label: '#1' });
  await page.getByLabel('比较右侧版本').selectOption({ label: '#2' });
  await page.getByRole('button', { name: '比较所选版本', exact: true }).click();
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
    page.getByRole('button', { name: '下载救援稿', exact: true }),
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
  await page.getByRole('button', { name: '核对文章状态', exact: true }).click();
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
