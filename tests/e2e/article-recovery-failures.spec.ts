import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('ARTICLE-IDB-008 unreadable recovery metadata is retained instead of overwritten', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('原有恢复记录应当保留');
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('inkling-drafts', 1);
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('outbox', 'readwrite'),
            store = tx.objectStore('outbox');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const value of all.result as Record<string, unknown>[])
              store.put({ ...value, version: 999 });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
        opening.onerror = () => reject(opening.error);
      }),
  );
  await page.reload();
  await expect(page.getByText(/浏览器恢复副本不可用/)).toBeVisible();
  await editor.fill('新的内存输入不能覆盖未知记录');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  const records = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const opening = indexedDB.open('inkling-drafts', 1);
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('outbox', 'readonly');
          const request = tx.objectStore('outbox').getAll();
          tx.oncomplete = () => {
            resolve(request.result as unknown[]);
            db.close();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
        opening.onerror = () => reject(opening.error);
      }),
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    version: 999,
    draft: {
      document: {
        doc: { content: [{ content: [{ text: '原有恢复记录应当保留' }] }] },
      },
    },
  });
});

for (const fault of ['unavailable', 'quota', 'abort'] as const) {
  test(`ARTICLE-IDB-008 ${fault} keeps online saving and offers an exact memory rescue`, async ({
    page,
  }) => {
    let leaveWarnings = 0;
    page.on('dialog', (dialog) => {
      if (dialog.type() === 'beforeunload') leaveWarnings++;
      return dialog.accept();
    });
    await page.evaluate((mode) => {
      if (mode === 'unavailable') {
        IDBFactory.prototype.open = () => {
          throw new DOMException('Injected storage denial', 'SecurityError');
        };
      } else {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (
          ...args: Parameters<typeof put>
        ) {
          if (mode === 'quota')
            throw new DOMException(
              'Injected quota failure',
              'QuotaExceededError',
            );
          const request = put.apply(this, args);
          request.addEventListener('success', () => this.transaction.abort());
          return request;
        };
      }
    }, fault);
    const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
    await editor.fill('浏览器存储失效时仍可在线保存');
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.route('**/api/articles/*/content', (route) =>
      route.abort('failed'),
    );
    await page.getByLabel('文章标题', { exact: true }).fill('需要救援的标题');
    await editor.fill('只能从内存救出的中文观点 🧠');
    await expect(page.getByText(/浏览器恢复副本不可用/)).toBeVisible();
    await expect(
      page.getByText('浏览器恢复副本已更新', { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: '重试保存', exact: true }),
    ).toBeVisible();
    if (fault === 'unavailable') {
      await page.screenshot({
        path: 'test-results/recovery-unavailable-desktop.png',
        fullPage: true,
      });
      await page.setViewportSize({ width: 375, height: 900 });
      await page.screenshot({
        path: 'test-results/recovery-unavailable-mobile.png',
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await expect(
      page.getByRole('button', { name: '下载救援稿', exact: true }),
    ).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载救援稿', exact: true }).click();
    const download = await downloading;
    const file = await download.path();
    expect(file).not.toBeNull();
    const raw = await readFile(file!, 'utf8');
    const rescue: unknown = JSON.parse(raw);
    expect(rescue).toMatchObject({
      format: 'inkling-recovery',
      version: 1,
      draft: {
        document: {
          title: '需要救援的标题',
          doc: {
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '只能从内存救出的中文观点 🧠' },
                ],
              },
            ],
          },
        },
      },
      pending: { command: { document: { title: '需要救援的标题' } } },
    });
    expect(raw).not.toMatch(/csrfToken|access=|cookie|localSecret/i);
    await page.unroute('**/api/articles/*/content');
    await page.reload();
    expect(leaveWarnings).toBe(1);
    await expect(editor).toHaveText('浏览器存储失效时仍可在线保存');
    await expect(
      page.getByRole('region', { name: '待恢复草稿' }),
    ).not.toBeVisible();
  });
}

test('ARTICLE-IDB-008 rescue includes invalid unsaved input rather than the last valid draft', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const title = '中'.repeat(201);
  await page.getByLabel('文章标题', { exact: true }).fill(title);
  await page
    .getByRole('textbox', { name: '文章正文', exact: true })
    .fill('尚未通过保存校验的内容');
  await expect(
    page.getByRole('button', { name: '下载救援稿', exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载救援稿', exact: true }).click();
  const file = await (await downloading).path();
  expect(JSON.parse(await readFile(file!, 'utf8'))).toMatchObject({
    draft: { document: { title } },
  });
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '恢复此草稿', exact: true }).click();
  await expect(page.getByLabel('文章标题', { exact: true })).toHaveValue(title);
  await expect(
    page.getByText('正文结构或标题长度不符合保存要求。'),
  ).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).not.toBeVisible();
});
