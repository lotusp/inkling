import { ArticleSnapshot, WorkspaceInfo } from '@inkling/contracts';
import { test, expect } from './fixtures';

for (const width of [1280, 375]) {
  test(`EDITOR-QUOTE-001 段落引用可撤销、重做并保存重开（${width}px）`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const editor = page.getByRole('textbox', { name: '文章正文' });
    const intro = '这是作者的引言。';
    const excerpt = '这一段摘自手记。';
    await editor.fill(intro);
    await editor.press('End');
    await editor.press('Enter');
    await page.keyboard.insertText(excerpt);
    await expect(editor.locator('p')).toHaveText([intro, excerpt]);
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();

    const quote = editor.locator('blockquote > p');
    const toggleQuote = async (wasQuoted: boolean) => {
      await page.getByRole('button', { name: '段落格式…' }).click();
      const dialog = page.getByRole('dialog', { name: '段落格式' });
      const button = dialog.getByRole('button', { name: '引用', exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-pressed', String(wasQuoted));
      await button.click();
      await expect(dialog).toBeHidden();
    };
    await toggleQuote(false);
    await expect(quote).toHaveText(excerpt);
    await editor.press('ControlOrMeta+z');
    await expect(quote).toHaveCount(0);
    await expect(editor.locator('p')).toHaveText([intro, excerpt]);
    await editor.press('ControlOrMeta+Shift+z');
    await expect(quote).toHaveText(excerpt);

    await toggleQuote(true);
    await expect(editor.locator(':scope > p').nth(1)).toHaveText(excerpt);
    await toggleQuote(false);
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();

    const info = WorkspaceInfo.parse(
      await (await page.request.get('/api/workspace')).json(),
    );
    const saved = ArticleSnapshot.parse(
      await (
        await page.request.get('/api/articles/' + info.currentArticleId)
      ).json(),
    );
    expect(saved.document.doc.content?.slice(0, 2)).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: intro }] },
      {
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: excerpt }] },
        ],
      },
    ]);
    await page.reload();
    await expect(editor.locator(':scope > p').first()).toHaveText(intro);
    await expect(quote).toHaveText(excerpt);
  });
}

test('EDITOR-LINK-002 选区链接可以修改、纠错和移除，前后文字保留', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: '文章正文' });
  const text = '请读原文。';
  await editor.fill(text);
  await editor.press('End');
  await editor.press('ArrowLeft');
  await editor.press('Shift+ArrowLeft');
  await editor.press('Shift+ArrowLeft');

  const openLink = async () => {
    await page.getByRole('button', { name: '段落格式…' }).click();
    await page.getByRole('button', { name: '链接…', exact: true }).click();
  };
  const field = page.getByLabel('链接地址', { exact: true });
  const apply = page.getByRole('button', { name: '应用', exact: true });
  await openLink();
  await field.fill('https://example.org/source');
  await apply.click();
  const link = editor.locator('a');
  await expect(link).toHaveText('原文');
  await expect(link).toHaveAttribute('href', 'https://example.org/source');
  await expect(editor).toHaveText(text);

  // Edit from a caret inside the existing link, then keep editing after a bad URL.
  await link.click();
  await openLink();
  await expect(field).toHaveValue('https://example.org/source');
  await field.fill('ftp://example.org');
  await apply.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://example.org/source');
  await field.fill('#参考');
  await field.dispatchEvent('compositionstart');
  await field.press('Enter');
  await expect(field).toBeVisible();
  await field.dispatchEvent('compositionend');
  await field.press('Enter');
  await expect(link).toHaveAttribute('href', '#参考');
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(
    true,
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(link).toHaveText('原文');
  await expect(link).toHaveAttribute('href', '#参考');

  await link.click();
  await openLink();
  await page.getByRole('button', { name: '移除链接' }).click();
  await expect(link).toHaveCount(0);
  await expect(editor).toHaveText(text);
  await editor.press('ControlOrMeta+z');
  await expect(link).toHaveAttribute('href', '#参考');
});

test('EDITOR-LINK-002 代码块可设置或清除语言，保留空行和缩进', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const editor = page.getByRole('textbox', { name: '文章正文' });
  const format = page.getByRole('button', { name: '段落格式…' });
  await editor.fill('if (ok) {');
  await format.click();
  await page.getByRole('button', { name: '代码块', exact: true }).click();
  await editor.press('End');
  await editor.press('Enter');
  await page.keyboard.insertText('  run();');
  await editor.press('Enter');
  await editor.press('Enter');
  await page.keyboard.insertText('}');
  const source = 'if (ok) {\n  run();\n\n}';
  const code = editor.locator('pre code');
  expect(await code.textContent()).toBe(source);
  const chooseLanguage = async () => {
    await format.click();
    await page.getByRole('button', { name: '代码语言…', exact: true }).click();
  };
  await chooseLanguage();
  const field = page.getByRole('textbox', { name: '代码语言' });
  await field.fill('typescript');
  await field.press('Enter');
  await expect(code).toHaveClass(/language-typescript/);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(code).toHaveClass(/language-typescript/);
  expect(await code.textContent()).toBe(source);
  await code.click();
  await chooseLanguage();
  await expect(field).toHaveValue('typescript');
  await field.fill('javascript');
  await field.press('Escape');
  await expect(code).toHaveClass(/language-typescript/);
  await chooseLanguage();
  await field.fill('');
  await field.press('Enter');
  await expect(code).not.toHaveClass(/language-/);
  expect(await code.textContent()).toBe(source);
});
