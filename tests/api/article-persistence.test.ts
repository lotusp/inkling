import { afterEach, expect, it } from 'vitest';
import { SqliteWorkspace } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import { ArticleSnapshot, SaveResult } from '@inkling/contracts';
import { createServer } from '../../apps/server/src/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const cleanup: (() => Promise<void>)[] = [];
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'inkling-api-'));
  const workspace = SqliteWorkspace.open(dir),
    service = new ArticleService(workspace.articles());
  const origin = 'http://127.0.0.1:4317';
  const app = createServer({
    access: {
      origin,
      workspaceId: workspace.id,
      workspaceInfo: () => service.workspace(),
      bootstrapToken: 'b'.repeat(64),
      localSecret: 's'.repeat(64),
    },
    articles: () => service,
  });
  cleanup.push(async () => {
    await app.close();
    workspace.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/exchange',
    headers: { host: '127.0.0.1:4317', origin },
    payload: { token: 'b'.repeat(64) },
  });
  expect(login.statusCode).toBe(200);
  const headers = {
    host: '127.0.0.1:4317',
    origin,
    cookie: String(login.headers['set-cookie']).split(';')[0] ?? '',
    'x-csrf-token': login.json<{ csrfToken: string }>().csrfToken,
  };
  const result = await app.inject({
    method: 'POST',
    url: '/api/articles/ensure-current',
    headers,
    payload: { mutationId: randomUUID() },
  });
  expect(result.statusCode).toBe(200);
  return { app, headers, article: ArticleSnapshot.parse(result.json()) };
}
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
it('ARTICLE-KEY-004 rejects reuse across content, base, article and operation', async () => {
  const { app, headers, article } = await setup();
  const payload = {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: { ...article.document, title: '已提交' },
  };
  const url = `/api/articles/${article.articleId}/content`;
  const first = await app.inject({ method: 'PUT', url, headers, payload });
  expect(first.statusCode).toBe(200);
  for (const attempt of [
    {
      url,
      payload: {
        ...payload,
        document: { ...payload.document, title: '不同内容' },
      },
    },
    { url, payload: { ...payload, baseRevisionId: randomUUID() } },
    { url: `/api/articles/${randomUUID()}/content`, payload },
    {
      url: '/api/articles/ensure-current',
      payload: { mutationId: payload.mutationId },
    },
  ]) {
    const response = await app.inject({
      method: attempt.url.endsWith('ensure-current') ? 'POST' : 'PUT',
      headers,
      ...attempt,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  }
  const replay = await app.inject({ method: 'PUT', url, headers, payload });
  expect(replay.json()).toEqual(first.json());
  const lookup = await app.inject({
    url: `/api/mutations/${payload.mutationId}`,
    headers,
  });
  expect(lookup.json()).toEqual(first.json());
  const read = await app.inject({
    url: `/api/articles/${article.articleId}`,
    headers,
  });
  expect(ArticleSnapshot.parse(read.json())).toMatchObject({
    headSeq: 2,
    document: payload.document,
  });
});
it('ARTICLE-SAVE-002 persists a real authenticated HTTP save', async () => {
  const { app, headers, article } = await setup();
  const document = {
    ...article.document,
    title: 'HTTP 写作',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '真正的持久化' }],
        },
      ],
    },
  };
  const saved = await app.inject({
    method: 'PUT',
    url: `/api/articles/${article.articleId}/content`,
    headers,
    payload: {
      mutationId: randomUUID(),
      baseRevisionId: article.headRevisionId,
      document,
    },
  });
  expect(saved.statusCode).toBe(200);
  const result = SaveResult.parse(saved.json());
  const read = await app.inject({
    url: `/api/articles/${article.articleId}`,
    headers,
  });
  expect(ArticleSnapshot.parse(read.json())).toMatchObject({
    document,
    headRevisionId: result.appliedRevisionId,
  });
});
it('WORKSPACE-CSRF-004 protects actual article writes and reads', async () => {
  const { app, headers, article } = await setup();
  const payload = {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: article.document,
  };
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/articles/${article.articleId}/content`,
        headers: {
          host: headers.host,
          origin: headers.origin,
          cookie: headers.cookie,
        },
        payload,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        url: `/api/articles/${article.articleId}`,
        headers: { host: headers.host },
      })
    ).statusCode,
  ).toBe(401);
});
it('ARTICLE-SCHEMA-011 refuses unsupported data and WORKSPACE-PATH-005 invalid identifiers', async () => {
  const { app, headers, article } = await setup();
  for (const document of [
    { ...article.document, schemaVersion: 2 },
    { ...article.document, unexpected: true },
    {
      ...article.document,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { onclick: 'bad' } }],
      },
    },
  ]) {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/articles/${article.articleId}/content`,
      headers,
      payload: {
        mutationId: randomUUID(),
        baseRevisionId: article.headRevisionId,
        document,
      },
    });
    expect(response.statusCode).toBe(422);
  }
  expect(
    (await app.inject({ url: '/api/articles/not-a-uuid', headers })).statusCode,
  ).toBe(422);
  const read = ArticleSnapshot.parse(
    (
      await app.inject({ url: `/api/articles/${article.articleId}`, headers })
    ).json(),
  );
  expect(read.headSeq).toBe(1);
});
