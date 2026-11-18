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
  const assistant = button(p, '闻一 · AI 写作助手');
  await expect(assistant).toHaveText('');
  await expect(assistant.locator('svg')).toBeVisible();
  await assistant.focus();
  await p.keyboard.press('Enter');
  await expect(assistant).toHaveAttribute('aria-expanded', 'true');
  await expect(p.locator('#railTitle')).toHaveText('闻一');
  await expect(p.locator('#thread .by')).toHaveText(['我', '闻一']);
  await p.getByLabel('给闻一的消息').fill('这条观察够吗？');
  await button(p, '文章库').click();
  await p.getByRole('searchbox', { name: '搜标题或标签' }).fill('');
  await p
    .getByRole('button', { name: '一次恢复演练的笔记', exact: true })
    .click();
  await p
    .getByRole('button', { name: '我为什么把草稿留在本机', exact: true })
    .click();
  await expect(p.getByLabel('给闻一的消息')).toHaveValue('这条观察够吗？');
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
  await expect(button(p, '保存状态')).toHaveCount(0);
  await button(p, '版本历史').click();
  await expect(button(p, '草稿保存状态')).toHaveCount(0);
  await expect(button(p, '闻一 · AI 写作助手')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
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
  await button(p, '闻一 · AI 写作助手').click();
  await expect(p.locator('#railTitle')).toHaveText('闻一');
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
  const backup = button(p, '下载备份');
  await expect(backup).toBeHidden();
  const originalSetItem = await p.evaluateHandle(
    () => globalThis.Storage.prototype.setItem,
  );
  await p.evaluate(() => {
    globalThis.Storage.prototype.setItem = () => {
      throw new Error('simulated quota');
    };
  });
  await p.locator('.block').first().fill('尚未写入存储的句子。');
  await expect(p.getByText('草稿未保存', { exact: true })).toBeVisible();
  await expect(backup).toBeVisible();
  await button(p, '文章菜单').click();
  await button(p, '专注写作').click();
  const downloaded = p.waitForEvent('download');
  await backup.click();
  const rescue = JSON.parse(
    readFileSync(await (await downloaded).path(), 'utf8'),
  );
  assert.equal(rescue.blocks[0].text, '尚未写入存储的句子。');
  await expect(backup).toBeVisible();
  await p.evaluate((original) => {
    globalThis.Storage.prototype.setItem = original;
  }, originalSetItem);
  await p.locator('.block').first().fill('已恢复写入。');
  await expect(backup).toBeHidden();
  await p.reload();
  await expect(p.locator('.block').first()).toHaveText('已恢复写入。');
});

test('原型的偏好、记忆、导出和模拟发布分别进入自己的窗口', async (t) => {
  const p = await fixture(t);
  async function menu(label) {
    await button(p, '文章菜单').click();
    await button(p, label).click();
  }
  await menu('写作偏好');
  await button(p, '确认保存').click();
  await button(p, '撤回').click();
  await p.getByLabel('本篇文类').selectOption('技术复盘');
  await p.getByLabel('我的表达偏好').fill('给出依据。');
  await button(p, '保存风格').click();
  await menu('写作偏好');
  await expect(p.getByLabel('我的表达偏好')).toHaveValue('给出依据。');
  await expect(p.getByLabel('本篇文类')).toHaveValue('技术复盘');
  await button(p, '关闭面板').click();
  await menu('导出文件…');
  const downloaded = p.waitForEvent('download');
  await button(p, '下载 Markdown').click();
  const file = await downloaded;
  assert.match(file.suggestedFilename(), /\.md$/u);
  assert.ok(
    readFileSync(await file.path(), 'utf8').includes('我为什么把草稿留在本机'),
  );
  await button(p, '关闭面板').click();
  await menu('发布到博客…');
  await expect(button(p, '模拟发布')).toBeDisabled();
  await p.getByRole('checkbox').check();
  await button(p, '模拟发布').click();
  await expect(p.getByText(/已模拟发布/)).toBeVisible();
  await button(p, '关闭面板').click();
  await button(p, '文章库').click();
  await p.getByLabel('文章范围').selectOption({ label: '已发表' });
  await expect(
    p.getByRole('button', { name: '我为什么把草稿留在本机', exact: true }),
  ).toBeVisible();
});

test('原型的讨论工具、资料引用、收藏溯源、章节建议和会话切换', async (t) => {
  const p = await fixture(t);
  const click = (name) => button(p, name).click();
  await click('闻一 · AI 写作助手');
  await click('新讨论');
  await click('推敲判断');
  await expect(p.locator('#thread')).toContainText('你想让读者相信什么');
  await click('讨论操作');
  await click('查找依据');
  await click('查看资料 ↗');
  await expect(p.locator('#originMessage')).toBeVisible();
  await click('关闭面板');
  await click('讨论操作');
  await click('审阅文章');
  await click('定位段落');
  await click('忽略建议');
  await expect(button(p, '忽略建议')).toHaveCount(0);
  await click('大纲');
  await click('讨论文章结构');
  await click('加入章节标题');
  await expect(p.locator('.block.h2').last()).toHaveText(
    '什么情况会改变我的判断',
  );
  await p
    .getByRole('button', { name: '收藏到素材', exact: true })
    .last()
    .click();
  await click('文章库');
  await click('素材');
  await p.locator('.source-row').first().click();
  await click('查看原讨论');
  await expect(p.locator('#thread')).toContainText('已加入大纲');
  await click('讨论历史');
  await click('‹ 返回讨论');
  await click('新讨论');
  await click('讨论历史');
  await p
    .locator('[data-do="openchat"]')
    .filter({ hasText: '推敲' })
    .first()
    .click();
  await expect(p.locator('#thread')).toContainText('已加入大纲');
  await p.getByLabel('给闻一的消息').fill('再谈一次');
  await click('发送');
  await click('停止回复');
  await expect(button(p, '发送')).toBeVisible();
  await click('素材');
  await p.getByLabel('记个想法，或粘贴链接').fill('从这条观察起笔');
  await click('保存素材');
  await p.getByRole('button', { name: /从这条观察起笔/ }).click();
  await click('用这条开始写');
  await expect(p.locator('#blocks .block').first()).toHaveText(
    '从这条观察起笔',
  );
});

test('原型中归档、移回草稿、取消删除和回收站恢复保持原文', async (t) => {
  const p = await fixture(t);
  const title = '我为什么把草稿留在本机';
  const click = (name) => button(p, name).click();
  const menu = () => click(title + '的更多操作');
  const scope = p.getByLabel('文章范围');
  const original = await p.locator('#blocks').innerText();
  await click('文章库');
  await menu();
  await click('归档');
  await click('查看版本历史');
  await expect(p.getByRole('dialog')).toContainText('保留的版本');
  await expect(button(p, '保存版本')).toBeHidden();
  await click('关闭面板');
  await click('移回草稿，继续编辑');
  assert.equal(await p.locator('#blocks').innerText(), original);
  await menu();
  await click('归档');
  await scope.selectOption({ label: '已归档' });
  await menu();
  await click('移回草稿');
  await scope.selectOption({ label: '写作中' });
  await menu();
  await click('移入回收站…');
  await click('取消');
  await menu();
  await click('移入回收站…');
  await click('移入回收站');
  await scope.selectOption({ label: '回收站' });
  await click('恢复到草稿');
  await scope.selectOption({ label: '写作中' });
  await click(title);
  assert.equal(await p.locator('#blocks').innerText(), original);
});

test('原型的自动备份可按批展开、命名和再次查找', async (t) => {
  const p = await fixture(t);
  // Seed a long history in this isolated prototype context so the older page is reachable.
  await p.addInitScript(() => {
    const key = 'inkling.prototype.writing-desk.v3.1',
      store = JSON.parse(globalThis.localStorage.getItem(key));
    const article = store.articles.find((item) => item.id === store.active);
    const initial = article.versions[0];
    for (let i = 1; i <= 12; i++) {
      const rev = ++article.rev;
      article.versions.push({
        ...initial,
        rev,
        time: Date.now() + i,
        kind: 'recovery',
        versionId: '备份-' + i,
        label: '自动恢复点',
      });
    }
    globalThis.localStorage.setItem(key, JSON.stringify(store));
  });
  await p.reload();
  await button(p, '文章菜单').click();
  await button(p, '版本历史').click();
  await p.getByRole('button', { name: /查看自动备份/ }).click();
  await button(p, '更早的恢复点').click();
  await button(p, '收起自动备份').click();
  await p.getByRole('button', { name: /查看自动备份/ }).click();
  const row = p
    .locator('.version-row')
    .filter({ hasText: '自动恢复点' })
    .first();
  await row.getByText('⋯').click();
  await row.getByRole('button', { name: '命名', exact: true }).click();
  await p.getByLabel('稿次名称').fill('复核稿');
  await button(p, '保存名称').click();
  await p.getByLabel('查找日期、名称或版本号').fill('复核稿');
  await expect(p.locator('.version-row:visible')).toHaveCount(1);
  await expect(p.locator('.version-row:visible')).toContainText('复核稿');
});
