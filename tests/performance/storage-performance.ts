import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus, platform, arch, release } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import {
  ArticleDocument,
  ArticleSnapshot,
  SaveResult,
  AuthSession,
} from '@inkling/contracts';
function message(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid benchmark message');
  return Object.fromEntries(Object.entries(value));
}
function waitMessage(child: ChildProcess, type: string) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      child.off('message', received);
      child.off('exit', exited);
    };
    const received = (value: unknown) => {
      const result = message(value);
      if (result.type === type) {
        finish();
        resolve(result);
      }
    };
    const exited = () => {
      finish();
      reject(new Error('Benchmark server exited before ' + type));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Benchmark server timeout: ' + type));
    }, 15000);
    child.on('message', received);
    child.once('exit', exited);
  });
}
function numeric(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid numeric metric');
  return value;
}
function text(value: unknown) {
  if (typeof value !== 'string') throw new Error('Invalid benchmark string');
  return value;
}
function percentile(values: number[], percent: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((sorted.length * percent) / 100) - 1]!;
}
function document(bytes: number, title: string): ArticleDocument {
  const paragraph = {
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: '技术判断需要依据。'.repeat(12),
        marks: [{ type: 'bold' }],
      },
      { type: 'text', text: '适用条件和取舍。'.repeat(12) },
    ],
  };
  const padding = { type: 'paragraph', content: [{ type: 'text', text: 'x' }] };
  const value: ArticleDocument = {
    schemaVersion: 1,
    title,
    doc: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '本地存储的技术复盘' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: '先确定恢复边界，再选择存储工具。' },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [
            {
              type: 'text',
              text: 'const saved = await saveArticle(document);\nconsole.log(saved.revisionId);',
            },
          ],
        },
        padding,
      ],
    },
  };
  const baseBytes = Buffer.byteLength(JSON.stringify(value)),
    unitBytes = Buffer.byteLength(JSON.stringify(paragraph)) + 1;
  const count = Math.floor((bytes - baseBytes) / unitBytes);
  value.doc.content!.splice(
    3,
    0,
    ...Array.from({ length: count }, () => paragraph),
  );
  padding.content[0]!.text += 'x'.repeat(bytes - baseBytes - count * unitBytes);
  if (Buffer.byteLength(JSON.stringify(value)) !== bytes)
    throw new Error('Wrong benchmark fixture size');
  return ArticleDocument.parse(value);
}
const dir = mkdtempSync(join(tmpdir(), 'inkling-performance-'));
let child: ChildProcess | undefined;
async function start() {
  const next = fork('tests/performance/storage-server.ts', [dir], {
    execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  child = next;
  let errors = '';
  next.stderr?.on('data', (chunk: Buffer) => {
    errors += chunk.toString();
  });
  try {
    return { child: next, ready: await waitMessage(next, 'ready') };
  } catch (error) {
    throw new Error('Benchmark startup failed: ' + errors, { cause: error });
  }
}
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exiting = once(child, 'exit');
    child.send({ command: 'stop' });
    const timer = setTimeout(() => child?.kill('SIGKILL'), 5000);
    await exiting;
    clearTimeout(timer);
  }
}
try {
  const server = await start(),
    origin = text(server.ready.origin);
  const login = await fetch(origin + '/api/auth/exchange', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ token: text(server.ready.token) }),
  });
  if (!login.ok) throw new Error('Benchmark authentication failed');
  const session = AuthSession.parse(await login.json()),
    cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  const headers = {
    origin,
    cookie,
    'content-type': 'application/json',
    'x-csrf-token': session.csrfToken,
  };
  const call = async (path: string, method: string, body?: string) => {
    const response = await fetch(origin + path, {
      method,
      headers,
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Benchmark API failed: ${response.status} ${await response.text()}`,
      );
    return (await response.json()) as unknown;
  };
  const initial = ArticleSnapshot.parse(
    await call(
      '/api/articles/ensure-current',
      'POST',
      JSON.stringify({ mutationId: randomUUID() }),
    ),
  );
  let baseRevisionId = initial.headRevisionId;
  const groups: Record<string, unknown>[] = [];
  for (const [label, bytes, thresholdMs] of [
    ['normal', 60 * 1024, 250],
    ['maximum', 2 * 1024 * 1024, 1000],
  ] as const) {
    const save = async (index: number) => {
      const body = JSON.stringify({
        mutationId: randomUUID(),
        baseRevisionId,
        document: document(bytes, label + '-' + String(index).padStart(3, '0')),
      });
      const start = performance.now();
      const result = SaveResult.parse(
        await call(`/api/articles/${initial.articleId}/content`, 'PUT', body),
      );
      const elapsed = performance.now() - start;
      baseRevisionId = result.appliedRevisionId;
      return elapsed;
    };
    await save(998);
    await save(999);
    const began = waitMessage(server.child, 'began');
    server.child.send({ command: 'begin' });
    await began;
    const times: number[] = [];
    for (let i = 0; i < 30; i++) times.push(await save(i));
    const measured = waitMessage(server.child, 'measured');
    server.child.send({ command: 'measure' });
    const loop = await measured;
    const p95Ms = percentile(times, 95),
      loopP95Ms = numeric(loop.p95Ms),
      samples = numeric(loop.samples);
    groups.push({
      label,
      documentBytes: bytes,
      samples: times.length,
      warmup: 2,
      p95Ms: Number(p95Ms.toFixed(2)),
      maxMs: Number(Math.max(...times).toFixed(2)),
      thresholdMs,
      eventLoopP95Ms: Number(loopP95Ms.toFixed(2)),
      eventLoopMaxMs: Number(numeric(loop.maxMs).toFixed(2)),
      eventLoopSamples: samples,
      passed:
        p95Ms <= thresholdMs &&
        samples > 0 &&
        (label !== 'normal' || loopP95Ms <= 50),
    });
  }
  const head = ArticleSnapshot.parse(
    await call('/api/articles/' + initial.articleId, 'GET'),
  );
  await stop();
  const reopened = await start();
  const report = {
    node: process.version,
    platform: platform(),
    arch: arch(),
    osRelease: release(),
    cpu: cpus()[0]?.model,
    sqliteDurability: 'WAL / synchronous FULL / fullfsync ON',
    fixture:
      'Chinese technical paragraphs with mixed marks, heading, list and multiline code; exact UTF-8 JSON sizes',
    transport:
      'authenticated loopback HTTP; body creation excluded, response decoding included',
    eventLoop:
      'measured inside server process; 1ms resolution; normal p95 limit 50ms',
    groups,
    historyBytes: head.revisionBytes,
    reopenAndHashScanMs: Number(numeric(reopened.ready.startupMs).toFixed(2)),
    passed: groups.every((g) => g.passed === true),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}
