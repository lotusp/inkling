import { test, expect } from './fixtures';
import { openRevisionMenu } from './revision-menu';
import type { Page } from '@playwright/test';
async function prepare(page: Page) {
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('值得保留的第一版');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await editor.fill('后来的第二版');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await openRevisionMenu(panel, 2);
  await panel
    .getByRole('button', { name: '查看并恢复版本 #2', exact: true })
    .click();
  await expect(panel.getByRole('region', { name: '待恢复版本' })).toContainText(
    '值得保留的第一版',
  );
  return { editor, panel };
}
test('REVISION-RESTORE-003 restores a reviewed version as a new head and retains old history', async ({
  page,
}) => {
  const { editor, panel } = await prepare(page);
  await panel
    .getByRole('button', { name: '确认恢复为新版本', exact: true })
    .click();
  await expect(editor).toHaveText('值得保留的第一版');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();

  await expect(panel.locator('.revision-list > li')).toHaveCount(4);
  await page.reload();
  await expect(editor).toHaveText('值得保留的第一版');
});
test('REVISION-CONFLICT-004 typing or composition invalidates a restore confirmation', async ({
  page,
}) => {
  const { editor, panel } = await prepare(page);
  await editor.fill('确认后继续形成的新判断');
  await panel
    .getByRole('button', { name: '确认恢复为新版本', exact: true })
    .click();
  await expect(panel.getByRole('alert')).toContainText('草稿已变化');
  await expect(editor).toHaveText('确认后继续形成的新判断');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await openRevisionMenu(panel, 2);
  await panel
    .getByRole('button', { name: '查看并恢复版本 #2', exact: true })
    .click();
  await expect(panel.getByRole('region', { name: '待恢复版本' })).toBeVisible();
  await editor.dispatchEvent('compositionstart', { data: '' });
  await panel
    .getByRole('button', { name: '确认恢复为新版本', exact: true })
    .click();
  await expect(panel.getByRole('alert')).toContainText('草稿已变化');
  await editor.dispatchEvent('compositionend', { data: '' });
});
test('REVISION-CONFLICT-004 a remote save rejects restore and keeps local content', async ({
  page,
  context,
  workspace,
}) => {
  const { editor, panel } = await prepare(page);
  const other = await context.newPage();
  await other.goto(workspace.origin);
  await other
    .getByRole('textbox', { name: '文章正文', exact: true })
    .fill('另一页先保存的判断');
  await expect(other.getByText('已保存', { exact: true })).toBeVisible();
  await panel
    .getByRole('button', { name: '确认恢复为新版本', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '查看冲突', exact: true }),
  ).toBeVisible();
  await expect(editor).toHaveText('后来的第二版');
  await other.close();
});
test('REVISION-CONFLICT-004 a late restore response preserves newer typing and requires reconciliation', async ({
  page,
}) => {
  const { editor, panel } = await prepare(page);
  let arrived = () => {},
    release = () => {};
  const waiting = new Promise<void>((r) => {
      arrived = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  await page.route('**/api/articles/*/restore', async (route) => {
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await panel
    .getByRole('button', { name: '确认恢复为新版本', exact: true })
    .click();
  await waiting;
  await editor.fill('恢复请求发出后继续写的新内容');
  release();
  await expect(
    page.getByRole('button', { name: '查看冲突', exact: true }),
  ).toBeVisible();
  await expect(editor).toHaveText('恢复请求发出后继续写的新内容');
});
test('REVISION-RESTORE-003 an unknown restore survives reload and reconciles once', async ({
  page,
}) => {
  page.on('dialog', (d) => d.accept());
  const { editor, panel } = await prepare(page);
  let calls = 0;
  await page.route('**/api/articles/*/restore', async (route) => {
    calls++;
    await route.fetch();
    await route.abort('failed');
  });
  await panel
    .getByRole('button', { name: '确认恢复为新版本', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(editor).toHaveText('值得保留的第一版');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect(calls).toBe(1);
});

test('REVISION-RESTORE-003 an uncommitted restore replays its original request after reload', async ({
  page,
}) => {
  page.on('dialog', (d) => d.accept());
  const { editor, panel } = await prepare(page);
  const ids: string[] = [];
  await page.route('**/api/articles/*/restore', async (route) => {
    ids.push(route.request().postDataJSON().mutationId as string);
    if (ids.length === 1) await route.abort('failed');
    else await route.continue();
  });
  await panel
    .getByRole('button', { name: '确认恢复为新版本', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(editor).toHaveText('值得保留的第一版');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

test('REVISION-CONFLICT-004 unsaved input blocks restore review; cancel leaves the saved draft intact', async ({
  page,
}) => {
  const { editor, panel } = await prepare(page);
  await panel.getByRole('button', { name: '取消恢复', exact: true }).click();
  await expect(editor).toHaveText('后来的第二版');
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  await editor.fill('尚未确认保存的判断');
  await openRevisionMenu(panel, 2);
  await panel
    .getByRole('button', { name: '查看并恢复版本 #2', exact: true })
    .click();
  await expect(panel.getByRole('alert')).toContainText('请先保存当前稿');
  await expect(
    panel.getByRole('region', { name: '待恢复版本' }),
  ).not.toBeVisible();
  await expect(editor).toHaveText('尚未确认保存的判断');
});
