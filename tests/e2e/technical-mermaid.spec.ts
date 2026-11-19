import { ArticleSnapshot, WorkspaceInfo } from '@inkling/contracts';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

const paper = (page: Page) =>
  page.getByRole('textbox', { name: '文章正文', exact: true });
const diagram = (page: Page) =>
  paper(page).getByRole('group', { name: '流程图', exact: true });
async function insertDiagram(page: Page) {
  await paper(page).focus();
  await page.getByRole('button', { name: '段落格式…', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '插入流程图', exact: true })
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
async function readGraph(image: Locator) {
  return image.evaluate((element) => {
    if (
      !(element instanceof HTMLImageElement) ||
      !element.complete ||
      !element.naturalWidth
    )
      return null;
    const svg = new DOMParser().parseFromString(
      decodeURIComponent(element.src.split(',')[1]!),
      'image/svg+xml',
    );
    return {
      labels: [...svg.querySelectorAll('g.node')]
        .map((node) => node.textContent?.trim())
        .sort(),
      edges: [...svg.querySelectorAll('path.flowchart-link')]
        .map((edge) => edge.getAttribute('data-id'))
        .sort(),
      edgeLabels: [...svg.querySelectorAll('g.edgeLabel')]
        .map((edge) => edge.textContent?.trim())
        .filter(Boolean)
        .sort(),
    };
  });
}

test('EDITOR-PREVIEW-004 corrects a Mermaid flowchart and reopens the exact source and rendered branches at 375px', async ({
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
  await paper(page).fill('发布过程');
  await paper(page).press('End');
  await insertDiagram(page);
  const block = diagram(page);
  const source = block.getByRole('textbox', { name: '流程图源码' });
  const image = block.getByRole('img', { name: '流程图预览' });
  const invalid = 'flowchart LR\n  A -->';
  await source.fill(invalid);
  await expect(block.getByRole('status')).toContainText('第 2 行');
  await expect(image).toHaveCount(0);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(block.getByRole('status')).toContainText('第 2 行');
  if (await source.isHidden()) await block.locator('summary').click();
  expect(await source.textContent()).toBe(invalid);
  const code =
    'flowchart LR\n  A[起草] --> B{审核}\n  B -->|通过| C[发布]\n  B -->|修改| A';
  await source.fill(code);
  const expected = {
    labels: ['起草', '审核', '发布'].sort(),
    edges: ['L_A_B_0', 'L_B_A_0', 'L_B_C_0'],
    edgeLabels: ['修改', '通过'].sort(),
  };
  await expect(image).toBeVisible();
  await expect.poll(() => readGraph(image)).toEqual(expected);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.document.schemaVersion).toBe(2);
  expect(saved.document.doc.content).toContainEqual({
    type: 'mermaidBlock',
    content: [{ type: 'text', text: code }],
  });
  await page.goto('about:blank');
  await page.goto(await workspace.restart());
  await expect(page.getByText('工作空间已连接', { exact: true })).toBeVisible();
  await expect.poll(() => readGraph(image)).toEqual(expected);
  await expect(paper(page).locator('p').first()).toHaveText('发布过程');
  if (await source.isHidden()) await block.locator('summary').click();
  expect(await source.textContent()).toBe(code);
  expect(
    await image.evaluate(
      (img) => img.clientWidth <= img.parentElement!.clientWidth,
    ),
  ).toBe(true);
  await block.locator('summary').click();
  await expect(source).toBeHidden();
  expect((await snapshot(page)).headRevisionId).toBe(saved.headRevisionId);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});

test('EDITOR-PREVIEW-004 Mermaid preview stays local with external resource input and works offline', async ({
  page,
  context,
  workspace,
}) => {
  const external: string[] = [];
  context.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== workspace.origin
    )
      external.push(request.url());
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === workspace.origin
      ? route.continue()
      : route.abort(),
  );
  await insertDiagram(page);
  const block = diagram(page);
  const source = block.getByRole('textbox', { name: '流程图源码' });
  const image = block.getByRole('img', { name: '流程图预览' });
  await source.fill('graph TD; A --> B');
  await expect
    .poll(() => readGraph(image))
    .toEqual({ labels: ['A', 'B'], edges: ['L_A_B_0'], edgeLabels: [] });
  for (const statement of [
    'A@{ img: "https://diagram.example/cover.png" }',
    'click A "https://diagram.example/read"',
  ]) {
    await source.fill('graph TD\nA --> B\n' + statement);
    await expect(block.getByRole('status')).toContainText('第 3 行');
    await expect(image).toHaveCount(0);
  }
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await context.setOffline(true);
  await source.fill('flowchart TD\n  A(记录) --> B[整理]');
  await expect
    .poll(() => readGraph(image))
    .toEqual({
      labels: ['记录', '整理'].sort(),
      edges: ['L_A_B_0'],
      edgeLabels: [],
    });
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect
    .poll(() => readGraph(image))
    .toEqual({
      labels: ['记录', '整理'].sort(),
      edges: ['L_A_B_0'],
      edgeLabels: [],
    });
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect((await snapshot(page)).document.doc.content).toContainEqual({
    type: 'mermaidBlock',
    content: [{ type: 'text', text: 'flowchart TD\n  A(记录) --> B[整理]' }],
  });
  expect(external).toEqual([]);
});
