import { fileURLToPath } from 'node:url';
import { createServer } from './server';

async function main() {
  const rawPort = process.env.PORT ?? '4317';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535)
    throw new Error('PORT 必须是 0–65535 的整数。');
  const app = createServer({
    webRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
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
    console.log(`Inkling ready: ${address}`);
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
