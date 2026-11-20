import { test, expect } from './fixtures';

for (const { label, source, attribute, preview, count } of [
  {
    label: '公式',
    source: 'x^{2} + y^{2}',
    attribute: 'data-inkling-formula',
    preview: 'msup',
    count: 2,
  },
  {
    label: '流程图',
    source: 'flowchart TD\n  A[开始] --> B[结束]',
    attribute: 'data-inkling-mermaid',
    preview: 'img',
    count: 1,
  },
]) {
  test(`EDITOR-PREVIEW-004 copies and pastes ${label} as editable source and can undo the paste`, async ({
    page,
  }) => {
    const paper = page.getByRole('textbox', { name: '文章正文', exact: true });
    const blocks = paper.getByRole('group', { name: label, exact: true });
    await paper.focus();
    await page.getByRole('button', { name: '段落格式…', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '插入' + label, exact: true })
      .click();
    await blocks.getByRole('textbox').fill(source);
    await expect(blocks.locator(preview)).toHaveCount(count);
    await paper.press('ControlOrMeta+a');
    const copy = await paper.evaluate((element) => {
      const clipboardData = new DataTransfer();
      element.dispatchEvent(
        new ClipboardEvent('copy', {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
      return {
        html: clipboardData.getData('text/html'),
        plain: clipboardData.getData('text/plain'),
      };
    });
    expect(copy.plain).toContain(source);
    expect(copy.html).toContain(attribute);
    expect(copy.html).not.toMatch(/<math|<img|<svg/i);
    await paper.locator('p').last().click();
    await page.keyboard.insertText('结论');
    await expect(paper.locator('p').last()).toHaveText('结论');
    await paper.evaluate((element, { html, plain }) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', html);
      clipboardData.setData('text/plain', plain);
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, copy);
    await expect(blocks).toHaveCount(2);
    await expect(blocks.last().locator(preview)).toHaveCount(count);
    if (!(await blocks.last().getByRole('textbox').isVisible()))
      await blocks.last().locator('summary').click();
    expect(await blocks.last().getByRole('textbox').textContent()).toBe(source);
    await paper.press('ControlOrMeta+z');
    await expect(blocks).toHaveCount(1);
    await expect(blocks.locator(preview)).toHaveCount(count);
  });
}
