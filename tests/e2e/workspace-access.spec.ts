import { test, expect } from './fixtures';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
test.use({ autoConnect: false, autoCreateArticle: false });
test('WORKSPACE-AUTH-003 connects from local link and removes its credential', async ({
  page,
  request,
  workspace,
}) => {
  const dir = workspace.dir;
  if (!dir) throw new Error('Missing test workspace');
  const info = JSON.parse(
    readFileSync(join(dir, 'runtime-access.json'), 'utf8'),
  ) as { origin: string; secret: string };
  const access = await request.post('/api/local/access', {
    headers: { 'x-inkling-local-secret': info.secret },
    data: {},
  });
  expect(access.ok()).toBe(true);
  const body = (await access.json()) as { url: string };
  await page.goto(body.url);
  await expect(page.getByText('工作空间已连接', { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.reload();
  await expect(page.getByText('工作空间已连接', { exact: true })).toBeVisible();
  const duplicate = await request.post('/api/auth/exchange', {
    headers: { origin: info.origin },
    data: {
      token: new URLSearchParams(new URL(body.url).hash.slice(1)).get('access'),
    },
  });
  expect(duplicate.status()).toBe(401);
});
