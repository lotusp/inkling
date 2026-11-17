import { defaultWorkspacePath } from '@inkling/adapters';
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
async function main() {
  const { values } = parseArgs({
    options: { workspace: { type: 'string' } },
    strict: true,
  });
  const file = join(
    resolve(
      values.workspace ??
        process.env.INKLING_WORKSPACE ??
        defaultWorkspacePath(),
    ),
    'runtime-access.json',
  );
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error('本机访问信息权限不正确。');
  const info: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (
    !info ||
    typeof info !== 'object' ||
    !('origin' in info) ||
    !('secret' in info) ||
    typeof info.origin !== 'string' ||
    typeof info.secret !== 'string' ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(info.origin) ||
    !/^[a-f0-9]{64}$/.test(info.secret)
  )
    throw new Error('本机访问信息无效。');
  const response = await fetch(info.origin + '/api/local/access', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-inkling-local-secret': info.secret,
    },
    body: '{}',
    signal: AbortSignal.timeout(3000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error('无法获取访问链接，请确认本机服务正在运行。');
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('url' in body) ||
    typeof body.url !== 'string'
  )
    throw new Error('服务响应无效。');
  const url = new URL(body.url);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:')
    throw new Error('服务地址无效。');
  console.log(body.url);
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '无法获取访问链接。');
  process.exitCode = 1;
});
