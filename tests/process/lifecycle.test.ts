import { afterEach, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
const children: ChildProcess[] = [];
function boot(port: string) {
  const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
    env: { ...process.env, PORT: port },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return child;
}
async function ready(child: ChildProcess) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('No listening address from service')),
      8000,
    );
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const url = output.match(
        /Inkling ready: (http:\/\/127\.0\.0\.1:\d+)/,
      )?.[1];
      if (url) {
        clearTimeout(timer);
        resolve(url);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited before ready: ${code}`));
    });
  });
}
afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        const done = once(child, 'exit');
        child.kill('SIGTERM');
        await done;
      }
    }),
  );
});
it('WORKBENCH-START-001 serves the built workbench on loopback', async () => {
  const url = await ready(boot('0'));
  const health = await fetch(url + '/api/health');
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({
    status: 'ok',
    application: 'inkling',
    apiVersion: 1,
  });
  const html = await fetch(url);
  expect(html.status).toBe(200);
  expect(await html.text()).toContain('<div id="root"></div>');
});
it.each(['SIGTERM', 'SIGINT'] as const)(
  'WORKBENCH-STOP-003 releases port on %s',
  async (signal) => {
    const child = boot('0');
    const url = await ready(child);
    const done = once(child, 'exit');
    child.kill(signal);
    const [code] = await done;
    expect(code).toBe(0);
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(Number(new URL(url).port), '127.0.0.1', resolve);
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  },
);
it('WORKBENCH-PORT-002 refuses an occupied port', async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  try {
    const address = blocker.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    const child = boot(String(address.port));
    let error = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      error += chunk.toString();
    });
    const [code] = await once(child, 'exit');
    expect(code).toBe(1);
    expect(error).toContain('端口已被占用');
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});
it('WORKBENCH-PORT-002 rejects invalid port configuration', async () => {
  const child = boot('not-a-port');
  let error = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    error += chunk.toString();
  });
  const [code] = await once(child, 'exit');
  expect(code).toBe(1);
  expect(error).toContain('PORT');
});
