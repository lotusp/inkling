import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
interface WorkspaceFixture {
  dir: string;
  origin: string;
  url: string;
}
export const test = base.extend<{
  workspace: WorkspaceFixture;
  autoCreateArticle: boolean;
  autoConnect: boolean;
}>({
  autoCreateArticle: [true, { option: true }],
  autoConnect: [true, { option: true }],
  workspace: async ({ browserName }, use) => {
    const dir = mkdtempSync(join(tmpdir(), `inkling-${browserName}-`));
    const child = spawn(
      process.execPath,
      ['apps/server/dist/main.js', '--workspace', dir],
      { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(
          () => reject(new Error('Test workspace startup timed out')),
          8000,
        );
        child.stdout.on('data', (s: Buffer) => {
          output += s.toString();
          const link = output.match(
            /http:\/\/127\.0\.0\.1:\d+\/#access=[a-f0-9]{64}/,
          )?.[0];
          if (link) {
            clearTimeout(timer);
            resolve(link);
          }
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Test workspace exited: ${code}`));
        });
      });
      await use({ dir, origin: new URL(url).origin, url });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'exit');
        child.kill('SIGTERM');
        await stopped;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
  baseURL: async ({ workspace }, use) => {
    await use(workspace.origin);
  },
  page: async ({ page, workspace, autoCreateArticle, autoConnect }, use) => {
    if (autoConnect) {
      await page.goto(workspace.url);
      await expect(
        page.getByText('工作空间已连接', { exact: true }),
      ).toBeVisible();
      if (autoCreateArticle) {
        await page
          .getByRole('button', { name: '开始写作', exact: true })
          .click();
        await expect(
          page.getByRole('textbox', { name: '文章标题', exact: true }),
        ).toBeEnabled();
      }
    }
    await use(page);
  },
});
export { expect };
