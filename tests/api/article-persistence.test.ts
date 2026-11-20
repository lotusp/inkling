import { afterEach, expect, it } from 'vitest';
import { SqliteWorkspace } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import { ArticleSnapshot, SaveResult } from '@inkling/contracts';
import { createServer } from '../../apps/server/src/server';
import { mkdtempSync, rmSync, renameSync, writeFileSync } from 'node:fs';
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
    images: () => workspace.images,
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
  return { app, headers, dir, article: ArticleSnapshot.parse(result.json()) };
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
    { ...article.document, schemaVersion: 3 },
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

it('EDITOR-TABLE-003 / EDITOR-ROUNDTRIP-010 validates table structure and preserves V1 revision bytes across V2 saves and restores', async () => {
  const { app, headers, article } = await setup();
  const path = '/api/articles/' + article.articleId;
  const revision = async (id: string) =>
    (await app.inject({ url: path + '/revisions/' + id, headers })).json();
  const old = await revision(article.headRevisionId);
  const cell = (type: string, text: string) => ({
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const header = cell('tableHeader', '表头');
  const body = cell('tableCell', '数据');
  const row = (...content: unknown[]) => ({ type: 'tableRow', content });
  const table = (...content: unknown[]) => ({ type: 'table', content });
  const document = (schemaVersion: number, node: unknown) => ({
    ...article.document,
    schemaVersion,
    doc: { type: 'doc', content: [node] },
  });
  const write = (value: unknown, baseRevisionId = article.headRevisionId) =>
    app.inject({
      method: 'PUT',
      url: path + '/content',
      headers,
      payload: { mutationId: randomUUID(), baseRevisionId, document: value },
    });
  const validTable = table(row(header, header), row(body, body));
  for (const invalid of [
    document(1, validTable),
    document(2, table()),
    document(2, table(row())),
    document(2, table(row(header, header), row(body))),
    document(2, table(header)),
    document(2, row(body)),
    document(2, table(row({ ...body, content: [] }))),
    document(2, table(row({ ...body, attrs: { unexpected: true } }))),
  ])
    expect((await write(invalid)).statusCode).toBe(422);
  expect((await revision(article.headRevisionId)).current).toBe(true);
  const v2 = document(2, validTable);
  const saved = await write(v2);
  expect(saved.statusCode).toBe(200);
  const tableId = SaveResult.parse(saved.json()).appliedRevisionId;
  expect((await revision(tableId)).document).toEqual(v2);
  expect((await write(article.document, tableId)).statusCode).toBe(422);
  expect((await revision(tableId)).current).toBe(true);
  const restore = await app.inject({
    method: 'POST',
    url: path + '/restore',
    headers,
    payload: {
      mutationId: randomUUID(),
      baseRevisionId: tableId,
      sourceRevisionId: article.headRevisionId,
    },
  });
  expect(restore.statusCode).toBe(200);
  const restored = await revision(
    SaveResult.parse(restore.json()).appliedRevisionId,
  );
  expect(restored.document).toEqual({ ...old.document, schemaVersion: 2 });
  expect(restored.restoredFromRevisionId).toBe(article.headRevisionId);
  expect(await revision(article.headRevisionId)).toEqual({
    ...old,
    current: false,
  });
  expect((await revision(tableId)).document).toEqual(v2);
});

it('EDITOR-IMAGE-006 authenticates local attachments and leaves the revision intact after invalid or failed writes', async () => {
  const { app, headers, article, dir } = await setup();
  const binary = { ...headers, 'content-type': 'application/octet-stream' };
  const url = '/api/images',
    method = 'POST' as const;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4VSEHAAQAAZHUcVaRAAAAAElFTkSuQmCC',
    'base64',
  );
  const denied = await app.inject({
    url,
    method,
    headers: { ...binary, cookie: '' },
    payload: png,
  });
  expect(denied.statusCode).toBe(401);
  expect(
    (
      await app.inject({
        url,
        method,
        headers: { ...binary, 'x-csrf-token': '' },
        payload: png,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        url,
        method,
        headers: binary,
        payload: Buffer.from('bad'),
      })
    ).statusCode,
  ).toBe(415);
  expect(
    (
      await app.inject({
        url,
        method,
        headers: binary,
        payload: Buffer.alloc(10 * 1024 * 1024 + 1),
      })
    ).statusCode,
  ).toBe(413);
  const stored = await app.inject({
    url,
    method,
    headers: binary,
    payload: png,
  });
  expect(stored.statusCode).toBe(201);
  const name = stored.json<{ name: string }>().name;
  const image = await app.inject({ url: url + '/' + name, headers });
  expect(image.rawPayload).toEqual(png);
  expect(
    (
      await app.inject({
        url: url + '/' + name,
        headers: { host: headers.host },
      })
    ).statusCode,
  ).toBe(401);
  renameSync(join(dir, 'images'), join(dir, 'saved-images'));
  writeFileSync(join(dir, 'images'), 'unavailable');
  expect(
    (await app.inject({ url, method, headers: binary, payload: png }))
      .statusCode,
  ).toBe(503);
  rmSync(join(dir, 'images'));
  renameSync(join(dir, 'saved-images'), join(dir, 'images'));
  rmSync(join(dir, 'images', name));
  expect(
    (await app.inject({ url: url + '/' + name, headers })).statusCode,
  ).toBe(404);
  const path = '/api/articles/' + article.articleId;
  const write = await app.inject({
    url: path + '/content',
    method: 'PUT',
    headers,
    payload: {
      baseRevisionId: article.headRevisionId,
      mutationId: randomUUID(),
      document: {
        schemaVersion: 2,
        title: '正文',
        doc: {
          type: 'doc',
          content: [
            {
              type: 'md:paragraph',
              content: [
                {
                  type: 'text',
                  text: '<img src="inkling-image:' + name + '" alt="校样">',
                },
              ],
            },
          ],
        },
      },
    },
  });
  expect(write.statusCode).toBe(422);
  expect((await app.inject({ url: path, headers })).json().headRevisionId).toBe(
    article.headRevisionId,
  );
});
