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
