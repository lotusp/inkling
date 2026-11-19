import { ArticleSnapshot, WorkspaceInfo } from '@inkling/contracts';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const paper = (page: Page) =>
  page.getByRole('textbox', { name: '文章正文', exact: true });
const formula = (page: Page) =>
  paper(page).getByRole('group', { name: '公式', exact: true });
async function insertFormula(page: Page) {
  await paper(page).focus();
  await page.getByRole('button', { name: '段落格式…', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '插入公式', exact: true })
    .click();
}
async function snapshot(page: Page) {
  const workspace = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  return ArticleSnapshot.parse(
    await (
      await page.request.get('/api/articles/' + workspace.currentArticleId)
    ).json(),
  );
}
async function showSource(page: Page) {
  const details = formula(page).locator('details');
  if ((await details.getAttribute('open')) === null) {
    await details.locator('summary').click();
  }
}

test('EDITOR-PREVIEW-004 edits a local formula, keeps invalid source and reopens the corrected math at 375px', async ({
  page,
  context,
  workspace,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const external: string[] = [];
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === workspace.origin)
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await paper(page).fill('推导如下');
  await paper(page).press('End');
  await paper(page).press('Shift+Home');
  await insertFormula(page);
  const block = formula(page);
  const source = block.getByRole('textbox', { name: '公式源码' });
  const math = block.locator('math');
  await expect(source).toBeVisible();
  const invalid = '\\frac{1}{';
  await page.keyboard.insertText(invalid);
  await expect(block.getByRole('status')).toContainText('公式有误');
  await expect(math).toHaveCount(0);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(block.getByRole('status')).toContainText('公式有误');
  await showSource(page);
  await expect(source).toHaveText(invalid);
  const valid = '\\frac{1}{2}\n  + x^{2}';
  await source.fill('\\frac{1}{2}');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('  + x^{2}');
  await expect(math.locator('mfrac')).toHaveCount(1);
  await expect(math.locator('msup')).toHaveCount(1);
  await expect(block.getByRole('status')).not.toContainText('公式有误');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.document.schemaVersion).toBe(2);
  expect(saved.document.doc.content).toContainEqual({
    type: 'formulaBlock',
    content: [{ type: 'text', text: valid }],
  });
  await page.reload();
  await expect(paper(page).locator('p').first()).toHaveText('推导如下');
  await expect(math.locator('mfrac')).toBeVisible();
  await showSource(page);
  expect(await source.textContent()).toBe(valid);
  await block.locator('summary').click();
  await expect(source).toBeHidden();
  await paper(page).press('ControlOrMeta+s');
  expect((await snapshot(page)).headRevisionId).toBe(saved.headRevisionId);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});

test('EDITOR-PREVIEW-004 updates the open preview fully offline, blocks remote resources and recovers the draft on reconnect', async ({
  page,
  context,
}) => {
  const remote: string[] = [];
  page.on('dialog', (dialog) => dialog.accept());
  await context.route('https://formula.example/**', (route) => {
    remote.push(route.request().url());
    return route.abort();
  });
  await insertFormula(page);
  const block = formula(page);
  const source = block.getByRole('textbox', { name: '公式源码' });
  await source.fill('\\sqrt{2}');
  await expect(block.locator('msqrt')).toBeVisible();
  await source.fill('\\includegraphics{https://formula.example/asset.png}');
  await expect(block.getByRole('status')).toContainText('外部');
  await expect(block.locator('img, a[href]')).toHaveCount(0);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await context.setOffline(true);
  const valid = '\\frac{a}{b}';
  await source.fill(valid);
  await expect(block.locator('mfrac')).toBeVisible();
  await expect(block.locator('msqrt')).toHaveCount(0);
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(block.locator('mfrac')).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const recovered = await snapshot(page);
  expect(recovered.document.doc.content).toContainEqual({
    type: 'formulaBlock',
    content: [{ type: 'text', text: valid }],
  });
  await page.reload();
  await expect(block.locator('mfrac')).toBeVisible();
  expect((await snapshot(page)).headRevisionId).toBe(recovered.headRevisionId);
  expect(remote).toEqual([]);
});

test('EDITOR-PREVIEW-004 copies and pastes the formula source as an editable block and can undo the paste', async ({
  page,
}) => {
  await insertFormula(page);
  const latex = 'x^{2} + y^{2}';
  await formula(page).getByRole('textbox', { name: '公式源码' }).fill(latex);
  await expect(formula(page).locator('msup')).toHaveCount(2);
  await paper(page).press('ControlOrMeta+a');
  const copy = await paper(page).evaluate((element) => {
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
  expect(copy.plain).toContain(latex);
  expect(copy.html).toContain('data-inkling-formula');
  expect(copy.html).not.toContain('<math');
  await paper(page).locator('p').last().click();
  await page.keyboard.insertText('结论');
  await expect(paper(page).locator('p').last()).toHaveText('结论');
  await paper(page).evaluate((element, { html, plain }) => {
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
  await expect(formula(page)).toHaveCount(2);
  await expect(formula(page).last().locator('msup')).toHaveCount(2);
  await paper(page).press('ControlOrMeta+z');
  await expect(formula(page)).toHaveCount(1);
  await expect(formula(page).locator('msup')).toHaveCount(2);
});
