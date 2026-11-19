import { readFile } from 'node:fs/promises';
import {
  ArticleDocument,
  ArticleSnapshot,
  WorkspaceInfo,
} from '@inkling/contracts';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { formattedArticle } from '../fixtures/article-document';

async function snapshot(page: Page) {
  const info = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  return ArticleSnapshot.parse(
    await (
      await page.request.get('/api/articles/' + info.currentArticleId)
    ).json(),
  );
}
const editor = (page: Page) =>
  page.getByRole('textbox', { name: '文章正文', exact: true });
async function tableAction(page: Page, name: string) {
  await page
    .getByRole('button', {
      name: name === '插入表格' ? '段落格式…' : '表格操作…',
    })
    .click();
  const action = page
    .getByRole('dialog')
    .getByRole('button', { name, exact: true });
  await expect(action).toBeVisible();
  await action.click();
}

test('EDITOR-TABLE-003 edits rows, columns and headers at 375px and keeps V2 after removal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await editor(page).fill('原稿');
  await editor(page).press('End');
  await editor(page).press('Shift+Home');
  await tableAction(page, '插入表格');
  await expect(editor(page).locator('p').first()).toHaveText('原稿');
  const grid = editor(page).getByRole('table');
  const rows = grid.getByRole('row');
  await expect(rows).toHaveCount(2);
  const header = grid.getByRole('columnheader');
  await expect(header).toHaveCount(2);
  await header.first().click();
  await page.keyboard.insertText('指标');
  await grid.getByRole('cell').first().click();
  await page.keyboard.insertText('原始数据');
  await tableAction(page, '在下方插入行');
  await expect(rows).toHaveCount(3);
  await rows.last().getByRole('cell').last().click();
  await tableAction(page, '在右侧插入列');
  await expect(rows.last().getByRole('cell')).toHaveCount(3);
  await expect(header).toHaveCount(3);
  await rows.last().getByRole('cell').last().click();
  await page.keyboard.insertText('待删除');
  await tableAction(page, '删除当前列');
  await expect(header).toHaveCount(2);
  await editor(page).press('ControlOrMeta+z');
  await expect(rows.last().getByRole('cell').last()).toHaveText('待删除');
  await rows.last().getByRole('cell').last().click();
  await tableAction(page, '删除当前行');
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect((await snapshot(page)).document.schemaVersion).toBe(2);
  await page.reload();
  await expect(header.first()).toHaveText('指标');
  await expect(rows.nth(1).getByRole('cell').first()).toHaveText('原始数据');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await header.first().click();
  await tableAction(page, '删除表格');
  await expect(grid).toHaveCount(0);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect((await snapshot(page)).document.schemaVersion).toBe(2);
});

for (const version of [1, 2])
  test(`EDITOR-ROUNDTRIP-010 restores a pre-table IndexedDB v${version} outbox copy and keeps rich text as V1`, async ({
    page,
  }) => {
    const ack = await snapshot(page);
    const { workspaceId } = WorkspaceInfo.parse(
      await (await page.request.get('/api/workspace')).json(),
    );
    await page.evaluate(
      async ({ workspaceId, ack, document, version }) => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('inkling-drafts', 1);
          request.onupgradeneeded = () => {
            const store = request.result.createObjectStore('outbox', {
              keyPath: ['workspaceId', 'articleId', 'clientId'],
            });
            store.createIndex('article', ['workspaceId', 'articleId']);
          };
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction('outbox', 'readwrite');
            tx.objectStore('outbox').put({
              version,
              workspaceId,
              articleId: ack.articleId,
              clientId: crypto.randomUUID(),
              ack,
              draft: { document, seq: 1 },
              pending: null,
              updatedAt: Date.now(),
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
          request.onerror = () => reject(request.error);
        });
      },
      { workspaceId, ack, document: formattedArticle, version },
    );
    await page.reload();
    await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
    await expect(editor(page).locator('blockquote')).toContainText(
      '引文与边界',
    );
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    expect((await snapshot(page)).document).toEqual(formattedArticle);
    await page.reload();
    await expect(editor(page).locator('pre code')).toContainText(
      'const insight',
    );
    expect((await snapshot(page)).document.schemaVersion).toBe(1);
  });

test('EDITOR-ROUNDTRIP-010 recovers a table written offline against a V1 baseline and reopens it after service restart', async ({
  page,
  workspace,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const before = await snapshot(page);
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  await editor(page).focus();
  await tableAction(page, '插入表格');
  const cell = editor(page).getByRole('cell').first();
  await cell.click();
  await page.keyboard.insertText('离线表格');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).headRevisionId).toBe(before.headRevisionId);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载备份', exact: true }).click();
  const download = await downloading;
  const file = await download.path();
  if (!file) throw new Error('缺少草稿备份文件');
  const rescue = JSON.parse(await readFile(file, 'utf8'));
  const rescued = ArticleDocument.parse(rescue.draft.document);
  expect(rescued.schemaVersion).toBe(2);
  expect(rescue.ack.document.schemaVersion).toBe(1);
  await page.unroute('**/api/articles/*/content');
  await page.reload();
  await expect(editor(page).getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(cell).toHaveText('离线表格');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.document.schemaVersion).toBe(2);
  expect(saved.headSeq).toBe(before.headSeq + 1);
  expect(saved.document).toEqual(rescued);
  await page.goto('about:blank');
  const url = await workspace.restart();
  await page.goto(url);
  await expect(page.getByText('工作空间已连接', { exact: true })).toBeVisible();
  await expect(cell).toHaveText('离线表格');
  expect((await snapshot(page)).contentHash).toBe(saved.contentHash);
});

test('EDITOR-ROUNDTRIP-010 compares a recovered V1 draft with a newer table before explicitly saving the merge', async ({
  page,
  context,
  workspace,
}) => {
  const other = await context.newPage();
  await other.goto(workspace.origin);
  await expect(other.getByRole('textbox', { name: '文章标题' })).toBeEnabled();
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  await editor(page).fill('离线旧稿');
  await expect(page.getByRole('button', { name: '重试保存' })).toBeVisible();
  await editor(other).focus();
  await tableAction(other, '插入表格');
  await editor(other).getByRole('columnheader').first().click();
  await other.keyboard.insertText('服务器表头');
  await expect(other.getByText('已保存', { exact: true })).toBeVisible();
  const tableHead = await snapshot(other);
  await other.close();
  await page.unroute('**/api/articles/*/content');
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿' }).click();
  await expect(editor(page)).toHaveText('离线旧稿');
  await page.getByRole('button', { name: '查看冲突' }).click();
  const preview = page.getByRole('region', { name: '服务器版本预览' });
  await expect(preview.getByRole('columnheader').first()).toHaveText(
    '服务器表头',
  );
  expect((await snapshot(page)).headRevisionId).toBe(tableHead.headRevisionId);
  await page.getByRole('button', { name: '准备保存合并稿' }).click();
  await page.getByRole('button', { name: '确认保存合并稿' }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const merged = await snapshot(page);
  expect(merged.headSeq).toBe(tableHead.headSeq + 1);
  expect(merged.document.schemaVersion).toBe(2);
  await page.reload();
  await expect(editor(page)).toHaveText('离线旧稿');
});
