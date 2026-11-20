import { openRevisionMenu } from './revision-menu';
import { test, expect } from './fixtures';
import { ArticleSnapshot, WorkspaceInfo } from '@inkling/contracts';

test('EDITOR-ROUNDTRIP-010 正式稿纸中的 Muya 正文自动保存后可重开', async ({
  page,
}) => {
  const body = page.getByRole('textbox', { name: '文章正文', exact: true });
  const paragraph = body.locator('.mu-paragraph-content').first();
  await expect(paragraph).toBeVisible({ timeout: 2500 });
  await paragraph.click();
  await page.keyboard.insertText('在正式稿纸中写下第一段。');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const { currentArticleId } = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const saved = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + currentArticleId)).json(),
  );
  expect(JSON.stringify(saved.document.doc)).toContain(
    '在正式稿纸中写下第一段。',
  );
  await page.reload();
  await expect(paragraph).toContainText('在正式稿纸中写下第一段。');
});

test('EDITOR-IMAGE-005 选图、编辑与同图粘贴写入工作空间并在服务重启后还原', async ({
  page,
  workspace,
}) => {
  const para = page.locator('.mu-paragraph-content').first();
  await para.click();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b55144';
    ctx.fillRect(0, 0, 300, 100);
    return c.toDataURL().split(',')[1]!;
  });
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: '插入图片', exact: true })
    .click({ timeout: 2200 });
  await (
    await chooser
  ).setFiles({
    name: '校样.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  const photo = para.locator('img[alt="校样"]');
  await expect
    .poll(() => photo.evaluate((n: HTMLImageElement) => n.naturalWidth))
    .toBe(300);
  const src = await photo.getAttribute('src');
  expect(src).toMatch(/\/api\/images\/[a-f0-9]{64}\.png$/);
  await photo.click();
  await page.locator('.mu-image-toolbar li.edit').click();
  const dialog = page.getByRole('dialog', { name: '编辑图片' });
  await dialog.getByLabel('替代文字').fill('彩色校样');
  await dialog.getByLabel('图片标题').fill('图一');
  await dialog.getByRole('button', { name: '完成' }).click();
  const edited = para.locator('img[alt="彩色校样"]');
  await edited.click();
  const bounds = await page
    .locator('.bar[data-position="right"]')
    .boundingBox();
  expect(bounds).toBeTruthy();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(bounds!.x - 50, bounds!.y + bounds!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(edited).toHaveAttribute('width', /^\d+$/);
  const width = await edited.getAttribute('width');
  await para.click();
  // A contenteditable browser represents the position after an image as a
  // child index. Exercise that real selection after the resize changes its raw tag.
  await edited.evaluate((img) => {
    const atom = img.closest('.mu-inline-image')!;
    const range = document.createRange();
    range.setStartAfter(atom);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await para.evaluate((el, data) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        [Uint8Array.from(atob(data), (c) => c.charCodeAt(0))],
        '再次粘贴.png',
        { type: 'image/png' },
      ),
    );
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, png);
  await expect(para.locator('img[alt="再次粘贴"]')).toHaveAttribute(
    'src',
    src!,
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await workspace.stop();
  await page.goto(await workspace.restart());
  await expect(edited).toHaveAttribute('width', width!);
  await expect(edited).toHaveAttribute('title', '图一');
  await expect
    .poll(() => edited.evaluate((n: HTMLImageElement) => n.naturalWidth))
    .toBe(300);
});

test('EDITOR-ROUNDTRIP-010 全选替换正文后仍可保存与继续编辑', async ({
  page,
}) => {
  const body = page.getByRole('textbox', { name: '文章正文', exact: true });
  await body.fill('全选后的新正文');
  await expect(body.locator('.mu-paragraph-content')).toHaveText(
    '全选后的新正文',
    { timeout: 2500 },
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await body.fill('第二次全选后的新正文');
  await expect(body.locator('.mu-paragraph-content')).toHaveText(
    '第二次全选后的新正文',
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(body.locator('.mu-paragraph-content')).toHaveText(
    '第二次全选后的新正文',
  );
});

test('EDITOR-IMAGE-005 拖入的图片可随旧版本恢复', async ({ page }) => {
  const para = page.locator('.mu-paragraph-content').first();
  await para.click();
  await para.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = 17;
    canvas.height = 13;
    const bytes = Uint8Array.from(
      atob(canvas.toDataURL().split(',')[1]!),
      (c) => c.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], '复盘.png', { type: 'image/png' }));
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.left + 1,
        clientY: rect.top + 2,
      }),
    );
  });
  const image = para.locator('img[alt="复盘"]');
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(17);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const { currentArticleId } = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const stored = ArticleSnapshot.parse(
    await (await page.request.get('/api/articles/' + currentArticleId)).json(),
  );
  expect(JSON.stringify(stored.document.doc)).toMatch(
    /inkling-image:[a-f0-9]{64}\.png/,
  );
  const body = page.getByRole('textbox', { name: '文章正文', exact: true });
  await body.fill('删去插图后的正文');
  await expect(image).toHaveCount(0);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await openRevisionMenu(panel, stored.headSeq);
  await panel
    .getByRole('button', {
      name: '查看并恢复版本 #' + stored.headSeq,
      exact: true,
    })
    .click();
  await panel
    .getByRole('button', { name: '恢复为新版本', exact: true })
    .click();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(17);
  await page.reload();
  await expect(image).toBeVisible();
});

test('EDITOR-IMAGE-006 插图失败保留原文，切稿忽略迟到结果', async ({
  page,
}) => {
  const body = page.getByRole('textbox', { name: '文章正文', exact: true });
  await body.fill('保留原文');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const picker = page.locator('.format-actions input[type=file]');
  await picker.setInputFiles({
    name: '伪装.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByText(/请选择有效的 PNG/)).toBeVisible();
  await expect(body).toHaveText('保留原文');
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/images', async (route) => {
    await gate;
    await route.fulfill({ json: { name: 'a'.repeat(64) + '.png' } });
  });
  await picker.setInputFiles({
    name: '迟到.png',
    mimeType: 'image/png',
    buffer: Buffer.from([1]),
  });
  await expect(page.getByText('正在保存图片…')).toBeVisible();
  await page.getByRole('button', { name: '文章库', exact: true }).click();
  await page.getByRole('button', { name: '新建文章', exact: true }).click();
  await expect(body.locator('.mu-paragraph-content')).toBeEmpty();
  const response = page.waitForResponse((r) => r.url().endsWith('/api/images'));
  release();
  await response;
  await expect(page.getByText('正在保存图片…')).toHaveCount(0);
  await expect(body.locator('img')).toHaveCount(0);
  await page.reload();
  await expect(body.locator('img')).toHaveCount(0);
});

test('EDITOR-IMAGE-006 撤销后忽略上传结果，归档稿不接受图片', async ({
  page,
  workspace,
}) => {
  const body = page.getByRole('textbox', { name: '文章正文', exact: true });
  await body.fill('原始判断');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await body.press('End');
  await page.keyboard.insertText('，附图');
  const arrived = page.waitForRequest((req) =>
    req.url().endsWith('/api/images'),
  );
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/images', async (route) => {
    await gate;
    await route.fulfill({ json: { name: 'a'.repeat(64) + '.png' } });
  });
  await page.locator('.format-actions input[type=file]').setInputFiles({
    name: '附图.png',
    mimeType: 'image/png',
    buffer: Buffer.from([1]),
  });
  await arrived;
  await body.press('ControlOrMeta+z');
  await expect(body).not.toContainText('附图');
  const response = page.waitForResponse((r) => r.url().endsWith('/api/images'));
  release();
  await response;
  await expect(page.getByText('正在保存图片…')).toHaveCount(0);
  await expect(body.locator('img')).toHaveCount(0);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const { currentArticleId: id } = WorkspaceInfo.parse(
    await (await page.request.get('/api/workspace')).json(),
  );
  const { csrfToken } = await (
    await page.request.get('/api/auth/session')
  ).json();
  const headers = { origin: workspace.origin, 'x-csrf-token': csrfToken };
  const { metadataVersion } = await (
    await page.request.get('/api/articles/' + id + '/metadata')
  ).json();
  expect(
    (
      await page.request.post('/api/articles/' + id + '/lifecycle', {
        headers,
        data: {
          mutationId: crypto.randomUUID(),
          action: 'archive',
          baseMetadataVersion: metadataVersion,
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.post('/api/articles/' + id + '/open', {
        headers,
        data: { mutationId: crypto.randomUUID() },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await expect(body).toHaveAttribute('aria-readonly', 'true');
  let uploads = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/images')) uploads++;
  });
  await body.evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(['abc'], '归档.png', { type: 'image/png' }));
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    el.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(body.locator('img')).toHaveCount(0);
  expect(uploads).toBe(0);
});
