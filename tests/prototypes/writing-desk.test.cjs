const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium, expect } = require('@playwright/test');
const path = resolve(
  __dirname,
  '../../docs/prototypes/inkling-writing-desk-v3.html',
);
const origin = 'https://inkling.test/';

async function fixture(t, width = 1360) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width, height: 860 } });
  page.setDefaultTimeout(4500);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/*', (route) =>
    route.request().url() === origin
      ? route.fulfill({ contentType: 'text/html', body: readFileSync(path) })
      : route.abort(),
  );
  await page.goto(origin);
  return page;
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
test('纸面起笔，文章库整理、独立素材、本文大纲', async (t) => {
  const p = await fixture(t);
  await expect(p.locator('#rightRail')).toBeHidden({ timeout: 1500 });
  await button(p, '文章库').click();
  await p.getByRole('searchbox', { name: '搜标题或标签' }).fill('恢复演练');
  await expect(p.locator('.article-row:visible')).toHaveCount(1);
  await p.locator('.article-more:visible').click();
  await button(p, '归档').click();
  await expect(p.locator('#libraryFolder')).toHaveValue('active');
  await expect(p.locator('#title')).toContainText('我为什么把草稿留在本机');
  await button(p, '撤销').click();
  await expect(p.locator('.article-row:visible')).toHaveCount(1);
  await button(p, '素材').click();
  await p.getByLabel('记个想法，或粘贴链接').fill('https://example.org/notes');
  await button(p, '保存素材').click();
  await p
    .locator('#libraryBody')
    .getByRole('button', { name: /https:\/\/example\.org\/notes/ })
    .click();
  await expect(p.getByRole('link', { name: '打开原文' })).toHaveAttribute(
    'href',
    'https://example.org/notes',
  );
  await button(p, '关闭面板').click();
  await button(p, '收起文章库').click();
  await button(p, '大纲').click();
  await button(p, '给这个判断划一道边界').click();
  await expect(p.locator('#context')).not.toContainText('选中');
  await button(p, '讨论').click();
  await p.getByLabel('讨论问题').fill('这条观察够吗？');
  await button(p, '文章库').click();
  await p.getByRole('searchbox', { name: '搜标题或标签' }).fill('');
  await p
    .getByRole('button', { name: '一次恢复演练的笔记', exact: true })
    .click();
  await p
    .getByRole('button', { name: '我为什么把草稿留在本机', exact: true })
    .click();
  await expect(p.getByLabel('讨论问题')).toHaveValue('这条观察够吗？');
});

test('选句改写只替换选区，保留修改前稿并可撤销、恢复', async (t) => {
  const p = await fixture(t);
  const block = p.locator('#blocks [data-block]').first();
  const original = '保留开头。改写这句话。保留结尾。';
  await block.fill(original);
  await block.evaluate((el) => {
    const r = document.createRange();
    r.setStart(el.firstChild, 5);
    r.setEnd(el.firstChild, 11);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  await button(p, '改写选区').click({ timeout: 1500 });
  await expect(p.locator('#proposal del')).toHaveText('改写这句话。');
  await p.getByLabel('编辑候选文字').fill('只改中间。');
  await button(p, '采用修改').click();
  await expect(block).toHaveText('保留开头。只改中间。保留结尾。');
  await button(p, '撤销').click();
  await expect(block).toHaveText(original);
  await button(p, '文章菜单').click();
  await button(p, '版本历史').click();
  await p
    .getByRole('searchbox', { name: '查找日期、名称或版本号' })
    .fill('今天');
  const row = p.locator('.version-row').filter({ hasText: '采用修改前' });
  await row.getByText('⋯').click();
  await row.getByRole('button', { name: '恢复…' }).click();
  await button(p, '恢复为新版本').click();
  await expect(block).toHaveText(original);
});
