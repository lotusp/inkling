import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
for (const mode of ['readonly', 'full'])
  test.describe(mode, () => {
    test.use({
      autoCreateArticle: false,
      serverEntry: 'tests/fixtures/storage-server.ts',
      serverEnv: { TEST_STORAGE_MODE: mode },
    });
    test(`ARTICLE-WRITE-009 real ${mode} database keeps unsaved input and offers rescue`, async ({
      page,
    }) => {
      const editor = page.getByRole('textbox', {
          name: '文章正文',
          exact: true,
        }),
        text = '不能丢失的判断'.repeat(mode === 'full' ? 10000 : 1);
      await expect(editor).toBeEditable();
      if (mode === 'readonly') {
        await page.getByRole('button', { name: '文章菜单' }).click();
        await page.getByRole('button', { name: '专注写作' }).click();
        await expect(
          page.getByRole('button', { name: '退出专注' }),
        ).toBeVisible();
      }
      const failed = page.waitForResponse(
        (r) => r.url().endsWith('/content') && r.request().method() === 'PUT',
      );
      await editor.fill(text);
      const response = await failed;
      expect(response.status()).toBe(mode === 'full' ? 507 : 503);
      expect(await response.json()).toMatchObject({
        code: mode === 'full' ? 'STORAGE_FULL' : 'STORAGE_UNAVAILABLE',
      });
      await expect(
        page.getByRole('button', { name: '重试保存', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('已保存', { exact: true })).not.toBeVisible();
      await expect(editor).toHaveText(text);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: '下载备份', exact: true }).click();
      const file = await download;
      expect(file.suggestedFilename()).toContain('inkling-recovery-');
      const backup = JSON.parse(await readFile((await file.path())!, 'utf8'));
      expect(JSON.stringify(backup.draft)).toContain(text);
      await expect(page.getByText('草稿未保存', { exact: true })).toBeVisible();
    });
  });
