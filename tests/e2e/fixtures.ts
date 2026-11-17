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
  stop: () => Promise<void>;
  restart: () => Promise<string>;
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
    let child: ReturnType<typeof spawn>;
    const launch = async (port: string) => {
      const launched = spawn(
        process.execPath,
        ['apps/server/dist/main.js', '--workspace', dir],
        {
          env: { ...process.env, PORT: port },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      child = launched;
      return await new Promise<string>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(
          () => reject(new Error('Test workspace startup timed out')),
          8000,
        );
        launched.stdout.on('data', (s: Buffer) => {
          output += s.toString();
          const link = output.match(
            /http:\/\/127\.0\.0\.1:\d+\/#access=[a-f0-9]{64}/,
          )?.[0];
          if (link) {
            clearTimeout(timer);
            resolve(link);
          }
        });
        launched.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Test workspace exited: ${code}`));
        });
      });
    };
    const stop = async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'exit');
        child.kill('SIGTERM');
        await stopped;
      }
    };
    try {
      const url = await launch('0');
      const origin = new URL(url).origin;
      await use({
        dir,
        origin,
        url,
        stop,
        restart: async () => {
          await stop();
          return launch(new URL(origin).port);
        },
      });
    } finally {
      await stop();
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
