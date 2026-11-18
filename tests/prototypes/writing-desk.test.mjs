import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';
const path = new URL(
  '../../docs/prototypes/inkling-writing-desk-v3.html',
  import.meta.url,
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
    const r = el.ownerDocument.createRange();
    r.setStart(el.firstChild, 5);
    r.setEnd(el.firstChild, 11);
    const s = el.ownerDocument.getSelection();
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
  await expect(button(p, '讨论')).toHaveAttribute('aria-expanded', 'false');
  await p
    .getByRole('searchbox', { name: '查找日期、名称或版本号' })
    .fill('今天');
  const row = p.locator('.version-row').filter({ hasText: '采用修改前' });
  await row.getByText('⋯').click();
  await row.getByRole('button', { name: '恢复…' }).click();
  await button(p, '恢复为新版本').click();
  await expect(block).toHaveText(original);
});

test('窄屏只展示当前任务，关闭文章菜单时停留在原列表', async (t) => {
  const p = await fixture(t, 375);
  await expect(p.locator('#paper')).toBeVisible();
  await button(p, '文章库').click();
  await expect(p.locator('#paper')).toBeHidden();
  await button(p, '文章菜单').click();
  await p.keyboard.press('Escape');
  await expect(p.locator('#articleMenu')).toBeHidden();
  await expect(p.locator('#libraryRail')).toBeVisible();
  await button(p, '素材').click();
  await button(p, '收起文章库').click();
  await button(p, '大纲').click();
  await button(p, '添加章节…').click();
  await p.getByLabel('章节标题').fill('恢复实验');
  await button(p, '添加').click();
  await expect(p.locator('.block.h2').last()).toHaveText('恢复实验');
  await button(p, '讨论').click();
  await p.getByRole('button', { name: '1 份资料' }).click();
  await expect(p.getByRole('checkbox').first()).toBeChecked();
  await p.getByRole('checkbox').first().uncheck();
  await button(p, '完成').click();
  await expect(button(p, '附加资料')).toBeVisible();
  await button(p, '收起右栏').click();
  await expect(p.locator('#paper')).toBeVisible();
  assert.ok(
    await p.locator('html').evaluate((el) => el.scrollWidth <= el.clientWidth),
  );
});

test('旧笔记升级只出现一次；保存失败时专注模式也能下载最新正文', async (t) => {
  const p = await fixture(t);
  await p.evaluate(() => {
    const key = 'inkling.prototype.writing-desk.v3.1',
      storage = globalThis.localStorage;
    const saved = JSON.parse(storage.getItem(key));
    saved.notes = ['来自旧版的想法'];
    saved.articles[0].title = '旧稿';
    storage.setItem(key, JSON.stringify(saved));
  });
  // Simulate returning to an older installation without its pagehide handler overwriting the fixture.
  const state = await p.evaluate(() =>
    globalThis.localStorage.getItem('inkling.prototype.writing-desk.v3.1'),
  );
  await p.addInitScript((old) => {
    if (!globalThis.sessionStorage.fixtureRestored) {
      globalThis.localStorage.setItem(
        'inkling.prototype.writing-desk.v3.1',
        old,
      );
      globalThis.sessionStorage.fixtureRestored = 'yes';
    }
  }, state);
  await p.reload();
  await p.reload();
  await expect(p.locator('#title')).toHaveText('旧稿');
  await button(p, '文章库').click();
  await button(p, '素材').click();
  await expect(
    p.locator('#libraryBody .source-row').filter({ hasText: '来自旧版的想法' }),
  ).toHaveCount(1);
  await button(p, '收起文章库').click();
  await button(p, '文章菜单').click();
  await button(p, '专注写作').click();
  await p.evaluate(() => {
    globalThis.Storage.prototype.setItem = () => {
      throw new Error('simulated quota');
    };
  });
  await p.locator('.block').first().fill('尚未写入存储的句子。');
  await button(p, '保存失败 · 仅在本页').click();
  const downloaded = p.waitForEvent('download');
  await button(p, '下载当前稿件 JSON').click();
  const rescue = JSON.parse(
    readFileSync(await (await downloaded).path(), 'utf8'),
  );
  assert.equal(rescue.blocks[0].text, '尚未写入存储的句子。');
});
