import {
  ArticleSnapshot,
  AuthSession,
  WorkspaceInfo,
} from '@inkling/contracts';
import { test, expect } from './fixtures';

test('EDITOR-OUTLINE-009 重名章节分别定位，保留原选区与保存版本', async ({
  page,
  workspace,
}) => {
  const info = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const path = '/api/articles/' + info.currentArticleId;
  const read = async () =>
    ArticleSnapshot.parse(await (await page.request.get(path)).json());
  const initial = await read();
  const session = AuthSession.parse(
    await (await page.request.get('/api/auth/session')).json(),
  );
  const sectionName = '同名章节';
  const paragraphs = Array.from({ length: 40 }, (_, i) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: '段落 ' + i }],
  }));
  const section = (level: number) => ({
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text: sectionName }],
  });
  const result = await page.request.put(path + '/content', {
    headers: { origin: workspace.origin, 'x-csrf-token': session.csrfToken },
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: initial.headRevisionId,
      document: {
        ...initial.document,
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '保留选中原文' }],
            },
            section(2),
            ...paragraphs,
            section(3),
            ...paragraphs,
          ],
        },
      },
    },
  });
  expect(result.ok()).toBe(true);
  const baseline = await read();
  await page.reload();
  const editor = page.getByRole('textbox', { name: '文章正文' });
  await expect(editor.locator('h2,h3')).toHaveText([sectionName, sectionName]);
  await editor.focus();
  await editor.evaluate((el) => {
    const text = el.querySelector('p')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 4, text, 2);
  });
  const selected = () =>
    page.evaluate(() => {
      const range = window.getSelection();
      return [range?.toString(), range?.anchorOffset, range?.focusOffset];
    });
  await expect.poll(selected).toEqual(['选中', 4, 2]);
  const toc = page.getByRole('button', { name: '大纲', exact: true });
  const entries = page.getByRole('button', { name: sectionName, exact: true });
  for (const [index, tag, other] of [
    [1, 'h3', 'h2'],
    [0, 'h2', 'h3'],
  ] as const) {
    await toc.click();
    await expect(entries).toHaveCount(2);
    await entries.nth(index).click();
    await expect(editor.locator(tag)).toBeInViewport();
    await expect(editor.locator(other)).not.toBeInViewport();
    await editor.evaluate((el) => el.focus({ preventScroll: true }));
    await expect.poll(selected).toEqual(['选中', 4, 2]);
  }
  expect((await read()).headRevisionId).toBe(baseline.headRevisionId);
});

test('EDITOR-OUTLINE-009 章节标题回车先选词，确认后只追加一次并继续写作', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const editor = page.getByRole('textbox', { name: '文章正文' });
  await editor.fill('原稿首段');
  await page.getByRole('button', { name: '大纲', exact: true }).click();
  await page.getByRole('button', { name: '添加章节…' }).click();
  const title = page.getByLabel('章节标题');
  await title.focus();
  await title.dispatchEvent('compositionstart');
  await page.keyboard.insertText('技术判断');
  await title.press('Enter');
  await expect(title).toBeFocused();
  await expect(editor.locator('h2')).toHaveCount(0);
  await title.dispatchEvent('compositionend', { data: '技术判断' });
  await title.press('Enter');
  await expect(editor).toBeFocused();
  await page.keyboard.insertText('这是新增章节的正文。');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor.locator('p').first()).toHaveText('原稿首段');
  await expect(editor.locator('h2')).toHaveText(['技术判断']);
  await expect(editor.locator('h2 + p')).toHaveText('这是新增章节的正文。');
});
