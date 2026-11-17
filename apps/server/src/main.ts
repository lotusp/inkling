import { fileURLToPath } from 'node:url';
import { createServer } from './server';
import { SqliteWorkspace, defaultWorkspacePath } from '@inkling/adapters';
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { writeFileSync, renameSync, rmSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import type { AccessOptions } from './access';
import { ArticleService } from '@inkling/core';

async function main() {
  const { values } = parseArgs({
    options: { workspace: { type: 'string' } },
    strict: true,
  });
  let workspace: SqliteWorkspace | undefined;
  let articles: ArticleService | undefined;
  const rawPort = process.env.PORT ?? '4317';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535)
    throw new Error('PORT 必须是 0–65535 的整数。');
  const access: AccessOptions = {
    origin: '',
    workspaceId: '',
    bootstrapToken: randomBytes(32).toString('hex'),
    localSecret: randomBytes(32).toString('hex'),
  };
  if (process.env.INKLING_DEV_ORIGIN) {
    if (process.env.INKLING_DEV_ORIGIN !== 'http://127.0.0.1:4317')
      throw new Error('Invalid development origin');
    access.browserOrigin = process.env.INKLING_DEV_ORIGIN;
  }
  let accessFile: string | undefined;
  const app = createServer({
    access,
    articles: () => articles,
    webRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
  });
  app.addHook('onClose', async () => {
    if (accessFile) rmSync(accessFile, { force: true });
    workspace?.close();
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void app.close().catch((error: unknown) => {
      console.error('服务关闭失败：', error);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const address = await app.listen({
      host: '127.0.0.1',
      port: Number(rawPort),
    });
    workspace = SqliteWorkspace.open(
      values.workspace ??
        process.env.INKLING_WORKSPACE ??
        defaultWorkspacePath(),
    );
    articles = new ArticleService(workspace.articles());
    access.workspaceInfo = () => articles?.workspace();
    access.origin = address;
    access.workspaceId = workspace.id;
    const file = join(workspace.path, 'runtime-access.json');
    try {
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('Unsafe runtime access file');
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
    const temporary = join(
      workspace.path,
      `.access-${randomBytes(16).toString('hex')}`,
    );
    writeFileSync(
      temporary,
      JSON.stringify({ origin: address, secret: access.localSecret }),
      { mode: 0o600, flag: 'wx' },
    );
    renameSync(temporary, file);
    accessFile = file;
    console.log(`Inkling ready: ${address}`);
    console.log(
      `打开工作台：${access.browserOrigin ?? address}/#access=${access.bootstrapToken}`,
    );
  } catch (error) {
    await app.close();
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'EADDRINUSE'
    )
      throw new Error(
        `端口已被占用：${rawPort}。请停止已有服务或显式指定 PORT。`,
        { cause: error },
      );
    throw error;
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '工作台启动失败。');
  process.exitCode = 1;
});
