import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';

test('ARTICLE-CONFLICT-006 identifies a format-only difference', async ({
  page,
  context,
  workspace,
}) => {
  const other = await conflictingTabs(page, context, workspace.origin);
  await other
    .getByRole('textbox', { name: '文章正文', exact: true })
    .fill('先提交的实践依据');
  await other.getByRole('button', { name: '查看冲突', exact: true }).click();
  const summary = other.getByRole('list', { name: '差异摘要' });
  await expect(summary).toContainText('第 1 段：格式或结构不同');
  await expect(summary).not.toContainText('文字不同');
  await other.close();
});

test('ARTICLE-CONFLICT-006 cannot compare from an unresolved failed mutation lookup', async ({
  page,
  context,
  workspace,
}) => {
  const other = await conflictingTabs(page, context, workspace.origin);
  await other.route('**/api/mutations/*', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'STORAGE_UNAVAILABLE', message: '保存结果暂时无法核对' },
    }),
  );
  await other.getByRole('button', { name: '查看冲突', exact: true }).click();
  await expect(other.getByRole('alert')).toHaveText('保存结果暂时无法核对');
  await expect(
    other.getByRole('region', { name: '冲突比较' }),
  ).not.toBeVisible();
  await expect(
    other.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toHaveText('本页尚未保存的判断');
  await other.unroute('**/api/mutations/*');
  await other.getByRole('button', { name: '查看冲突', exact: true }).click();
  await expect(other.getByRole('region', { name: '冲突比较' })).toBeVisible();
  await other.close();
});

async function conflictingTabs(
  page: Page,
  context: BrowserContext,
  origin: string,
) {
  const other = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  other.on('dialog', (dialog) => dialog.accept());
  await other.goto(origin);
  await expect(other.getByLabel('文章标题', { exact: true })).toBeEnabled();
  await page
    .getByRole('textbox', { name: '文章正文', exact: true })
    .fill('先提交的实践依据');
  await page
    .getByRole('textbox', { name: '文章正文', exact: true })
    .press('ControlOrMeta+a');
  await page.getByRole('button', { name: '加粗', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await other
    .getByRole('textbox', { name: '文章正文', exact: true })
    .fill('本页尚未保存的判断');
  await expect(
    other.getByText('稿件已有新版本，请先比较两份内容。'),
  ).toBeVisible();
  return other;
}

test('ARTICLE-CONFLICT-006 compares two real tab versions without replacing the editor', async ({
  page,
  context,
  workspace,
}) => {
  const other = await conflictingTabs(page, context, workspace.origin);
  const editor = other.getByRole('textbox', { name: '文章正文', exact: true });
  await expect(
    other.getByRole('button', { name: '查看冲突', exact: true }),
  ).toBeVisible();
  await other.getByRole('button', { name: '查看冲突', exact: true }).click();
  const panel = other.getByRole('region', { name: '冲突比较' });
  await expect(
    panel.getByRole('region', { name: '服务器版本预览' }).locator('strong'),
  ).toHaveText('先提交的实践依据');
  await expect(
    panel.getByRole('region', { name: '本页草稿预览' }),
  ).toContainText('本页尚未保存的判断');
  await expect(panel).toContainText('第 1 段：文字不同');
  await expect(editor).toHaveText('本页尚未保存的判断');
  await editor.fill('比较时仍能继续思考');
  await expect(
    panel.getByRole('region', { name: '本页草稿预览' }),
  ).toContainText('比较时仍能继续思考');
  await expect(
    page.getByRole('textbox', { name: '文章正文', exact: true }),
  ).toHaveText('先提交的实践依据');
  await other.close();
});
