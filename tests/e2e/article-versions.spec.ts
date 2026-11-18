import { openRevisionMenu } from './revision-menu';
import { test, expect } from './fixtures';

test('REVISION-HISTORY-001 saves and names the clicked draft; REVISION-COMPARE-002 compares without changing the editor', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('独立思考的第一稿');
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await panel.getByRole('button', { name: '保存版本', exact: true }).click();
  await expect(panel.getByText('手动保存', { exact: true })).toBeVisible();
  await openRevisionMenu(panel, 2);
  await panel.getByRole('button', { name: '命名版本 #2', exact: true }).click();
  await panel.getByLabel('稿次名称', { exact: true }).fill('观点形成');
  await panel.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('已命名版本 #2');
  await expect(
    panel.getByRole('listitem').filter({ hasText: '观点形成' }),
  ).toHaveCount(1);
  await panel.getByRole('button', { name: '保存版本', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('版本已保存');
  await expect(panel.getByText('观点形成', { exact: true })).toBeVisible();
  await editor.press('ControlOrMeta+a');
  await page.getByRole('button', { name: '加粗', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await panel
    .getByRole('listitem')
    .filter({ hasText: '观点形成' })
    .getByRole('button', { name: '比较', exact: true })
    .click();
  const target = panel.getByLabel('比较目标版本');
  await target.selectOption(
    (await target
      .locator('option[data-seq="3"]')
      .getAttribute('value')) as string,
  );
  await expect(panel.getByText(/格式或结构变化/)).toBeVisible();
  await expect(editor.locator('strong')).toHaveText('独立思考的第一稿');
  await editor.fill('比较期间继续写作的新判断');
  await expect(editor).toHaveText('比较期间继续写作的新判断');
  await panel.screenshot({ path: 'test-results/revisions-desktop.png' });
  await page.setViewportSize({ width: 375, height: 900 });
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: 'test-results/revisions-mobile.png' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('REVISION-HISTORY-001 a lost naming response retries the same revision and does not include later typing', async ({
  page,
}) => {
  let first = true;
  const ids: string[] = [];
  await page.route('**/api/articles/*/revisions/*/name', async (route) => {
    ids.push(route.request().postDataJSON().mutationId as string);
    const response = await route.fetch();
    if (first) {
      first = false;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('命名时的内容');
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await panel.getByRole('button', { name: '保存版本', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: '重试保存版本', exact: true }),
  ).toBeVisible();
  await editor.fill('命名后继续写的内容');
  await panel
    .getByRole('button', { name: '重试保存版本', exact: true })
    .click();
  await expect(panel.getByRole('status')).toContainText('版本已保存 · #2');
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(editor).toHaveText('命名后继续写的内容');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toHaveText('命名后继续写的内容');
});

test('REVISION-HISTORY-001 naming flush pins the saved revision while the author continues typing', async ({
  page,
}) => {
  let arrived = () => {},
    release = () => {};
  const waiting = new Promise<void>((r) => {
      arrived = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
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
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' }),
    editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('点击命名时的原稿');
  await panel.getByRole('button', { name: '保存版本', exact: true }).click();
  await waiting;
  await editor.fill('保存等待期间继续写的新稿');
  release();
  await expect(panel.getByRole('status')).toContainText('版本已保存 · #2');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await openRevisionMenu(panel, 2);
  await panel
    .getByRole('button', { name: '查看并恢复版本 #2', exact: true })
    .click();
  await expect(panel.getByRole('region', { name: '待恢复版本' })).toContainText(
    '点击命名时的原稿',
  );
  await expect(panel.locator('.diff-line.removed')).toContainText(
    '保存等待期间继续写的新稿',
  );
  await expect(panel.locator('.diff-line.added')).toContainText(
    '点击命名时的原稿',
  );
  await panel
    .getByRole('region', { name: '待恢复版本' })
    .screenshot({ path: 'test-results/restore-preview-desktop.png' });
  await page.setViewportSize({ width: 375, height: 900 });
  await panel
    .getByRole('region', { name: '待恢复版本' })
    .screenshot({ path: 'test-results/restore-preview-mobile.png' });
});

test('REVISION-COMPARE-002 restore preview contains long code lines within a narrow screen', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('const message = "' + 'long_code_'.repeat(60) + '";');
  await page.getByRole('button', { name: '代码块', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await editor.fill('替代代码行');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await openRevisionMenu(panel, 2);
  await panel
    .getByRole('button', { name: '查看并恢复版本 #2', exact: true })
    .click();
  await expect(
    panel
      .getByRole('region', { name: '待恢复版本' })
      .locator('.diff-line.added'),
  ).toContainText('long_code_');
  await page.setViewportSize({ width: 375, height: 900 });
  await panel
    .getByRole('region', { name: '待恢复版本' })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel
    .getByRole('region', { name: '待恢复版本' })
    .screenshot({ path: 'test-results/restore-code-mobile.png' });
});
