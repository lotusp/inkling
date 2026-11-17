import { afterEach, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dirs: string[] = [];
const children: ChildProcess[] = [];
function directory() {
  const dir = mkdtempSync(join(tmpdir(), 'inkling-workspace-test-'));
  dirs.push(dir);
  return dir;
}
function boot(dir: string) {
  const child = spawn(
    process.execPath,
    ['apps/server/dist/main.js', '--workspace', dir],
    { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(child);
  let output = '';
  let error = '';
  child.stdout?.on('data', (s: Buffer) => {
    output += s.toString();
  });
  child.stderr?.on('data', (s: Buffer) => {
    error += s.toString();
  });
  const settled = new Promise<{ ready: boolean; error: string }>(
    (resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`startup timeout: ${error}`)),
        5000,
      );
      child.stdout?.on('data', () => {
        if (output.includes('Inkling ready:')) {
          clearTimeout(timer);
          resolve({ ready: true, error });
        }
      });
      child.once('exit', () => {
        clearTimeout(timer);
        resolve({ ready: false, error });
      });
    },
  );
  return { child, settled };
}
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child, 'exit');
      child.kill('SIGTERM');
      await done;
    }
  }
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it('WORKSPACE-OPEN-001 creates persistent identity and reopens it', async () => {
  const dir = directory();
  const first = boot(dir);
  expect((await first.settled).ready).toBe(true);
  expect(existsSync(join(dir, 'inkling.sqlite'))).toBe(true);
  const done = once(first.child, 'exit');
  first.child.kill('SIGTERM');
  await done;
  const bytes = readFileSync(join(dir, 'inkling.sqlite'));
  expect(bytes.subarray(0, 15).toString()).toBe('SQLite format 3');
  const second = boot(dir);
  expect((await second.settled).ready).toBe(true);
  const stopped = once(second.child, 'exit');
  second.child.kill('SIGTERM');
  await stopped;
  expect(readFileSync(join(dir, 'inkling.sqlite'))).toEqual(bytes);
});
it.each(['SIGTERM', 'SIGKILL'] as const)(
  'WORKSPACE-LOCK-002 rejects another port and releases ownership after %s',
  async (signal) => {
    const dir = directory();
    const first = boot(dir);
    expect((await first.settled).ready).toBe(true);
    const second = await boot(dir).settled;
    expect(second.ready).toBe(false);
    expect(second.error).toContain('WORKSPACE_LOCKED');
    const done = once(first.child, 'exit');
    first.child.kill(signal);
    await done;
    expect((await boot(dir).settled).ready).toBe(true);
  },
);
it('WORKSPACE-OPEN-001 never replaces an existing non-database file', async () => {
  const dir = directory();
  const path = join(dir, 'inkling.sqlite');
  writeFileSync(path, 'keep this file');
  const result = await boot(dir).settled;
  expect(result.ready).toBe(false);
  expect(readFileSync(path, 'utf8')).toBe('keep this file');
});

it('WORKSPACE-OPEN-001 refuses a newer schema without changing its data', async () => {
  const dir = directory();
  const first = boot(dir);
  expect((await first.settled).ready).toBe(true);
  const stopped = once(first.child, 'exit');
  first.child.kill('SIGTERM');
  await stopped;
  const file = join(dir, 'inkling.sqlite');
  const edit = spawnSync(
    process.execPath,
    [
      '-e',
      "const D=require('better-sqlite3');const d=new D(process.argv[1]);d.pragma('user_version=999');d.close();",
      file,
    ],
    { cwd: resolve('apps/server'), encoding: 'utf8' },
  );
  expect(edit.status, edit.stderr).toBe(0);
  const original = readFileSync(file);
  const result = await boot(dir).settled;
  expect(result.ready).toBe(false);
  expect(result.error).toContain('WORKSPACE_VERSION');
  expect(readFileSync(file)).toEqual(original);
});
it('WORKSPACE-PATH-005 refuses even a dangling database symlink', async () => {
  const dir = directory(),
    outside = join(directory(), 'untouched.sqlite');
  symlinkSync(outside, join(dir, 'inkling.sqlite'));
  const result = await boot(dir).settled;
  expect(result.ready).toBe(false);
  expect(result.error).toContain('WORKSPACE_PATH');
  expect(existsSync(outside)).toBe(false);
});
it('WORKSPACE-AUTH-003 local access command obtains a fresh link from a running service', async () => {
  const dir = directory();
  expect((await boot(dir).settled).ready).toBe(true);
  const command = spawn(
    process.execPath,
    ['--import', 'tsx', 'apps/server/src/local-access.ts', '--workspace', dir],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(command);
  let output = '';
  command.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const [code] = await once(command, 'exit');
  expect(code).toBe(0);
  const url = new URL(output.trim());
  expect(url.hostname).toBe('127.0.0.1');
  const token = new URLSearchParams(url.hash.slice(1)).get('access');
  expect(token?.length).toBe(64);
  const response = await fetch(url.origin + '/api/auth/exchange', {
    method: 'POST',
    headers: { origin: url.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  expect(response.status).toBe(200);
});
