/* global getComputedStyle, document, DataTransfer, File, atob, ClipboardEvent, DragEvent, innerWidth */
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

test('EDITOR-SURFACE-011 稿纸色板与图片操作往返', async (t) => {
  const images = await mkdtemp(join(tmpdir(), 'inkling-trial-'));
  const server = spawn('python3', [
    'apps/web/muya-trial/serve.py',
    '0',
    'apps/web/muya-trial/dist',
    images,
  ]);
  t.after(async () => {
    server.kill();
    await once(server, 'exit');
    await rm(images, { recursive: true, force: true });
  });
  const [output] = await once(server.stdout, 'data');
  const url = output.toString().trim().split(' ').at(-1);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);
  const table = page.locator('.mu-table-inner');
  const header = table.locator('tr').first().locator('td').first();
  const node = page
    .locator('.mu-diagram-preview svg .node .label-container')
    .first();
  await expect(header).toHaveCSS('background-color', 'rgb(238, 242, 234)');
  await expect(node).toHaveCSS('fill', 'rgb(255, 254, 250)');
  await expect(
    page.locator('.mu-diagram-preview .flowchart-link').first(),
  ).toHaveCSS('stroke', 'rgb(98, 119, 101)');
  assert.equal(
    await header.evaluate(
      (el) => getComputedStyle(el, '::before').borderLeftColor,
    ),
    'rgb(199, 209, 195)',
  );
  const para = page.locator('.mu-paragraph-content').last();
  await para.click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e75531';
    ctx.fillRect(0, 0, 300, 80);
    return canvas.toDataURL().split(',')[1];
  });
  const file = {
    name: '本地图.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  };
  await page.locator('#insert-file').setInputFiles(file);
  let picture = para.locator('img[alt="本地图"]');
  await expect(picture).toBeVisible();
  await picture.click();
  const edit = page.locator('.mu-image-toolbar li.edit');
  await expect(edit.locator('i.icon')).toHaveCSS('color', 'rgb(81, 97, 84)');
  await edit.click();
  const dialog = page.getByRole('dialog', { name: '编辑图片' });
  await dialog.getByLabel('替代文字').fill('落日');
  await dialog.getByLabel('图片标题').fill('图一');
  await dialog
    .getByLabel('更换本地图片')
    .setInputFiles({ ...file, name: '替换.png' });
  await dialog.getByRole('button', { name: '完成' }).click();
  picture = para.locator('img[alt="落日"]');
  await picture.click();
  const handle = page.locator('.bar[data-position="right"]');
  const bounds = await handle.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(bounds.x - 50, bounds.y + bounds.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(picture).toHaveAttribute('width', /^\d+$/);
  const width = Number(await picture.getAttribute('width'));
  assert.ok(width < 300 && width > 150);
  for (const event of ['paste', 'drop']) {
    const target = page.locator('.mu-paragraph-content').first();
    await target.click();
    await target.evaluate(
      (el, { png, event }) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File(
            [Uint8Array.from(atob(png), (c) => c.charCodeAt(0))],
            event + '.png',
            { type: 'image/png' },
          ),
        );
        const bounds = el.getBoundingClientRect();
        el.dispatchEvent(
          event === 'paste'
            ? new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: transfer,
              })
            : new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: transfer,
                clientX: bounds.left + 8,
                clientY: bounds.top + 8,
              }),
        );
      },
      { png, event },
    );
    await expect(target.locator('img[alt="' + event + '"]')).toBeVisible();
  }
  await page.getByRole('button', { name: '保存试写稿' }).click();
  await expect(page.locator('#status')).toContainText('已保存');
  await page.reload();
  await expect(picture).toHaveAttribute('title', '图一');
  await expect(picture).toHaveAttribute('width', String(width));
  await expect.poll(() => picture.evaluate((el) => el.naturalWidth)).toBe(300);
  await expect(picture).toHaveCSS('filter', 'none');
  await expect(page.locator('.mu-inline-image img')).toHaveCount(3);
  await page.setViewportSize({ width: 375, height: 800 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
});
