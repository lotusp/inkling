import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SqliteWorkspace, SqliteArticles } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import { ArticleSnapshot, SaveResult } from '@inkling/contracts';
import { createServer } from '../../apps/server/src/server';
import { openFixtureStorage } from '../fixtures/storage';
const cleanup: (() => Promise<void>)[] = [];
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'inkling-library-api-'));
  const workspace = SqliteWorkspace.open(dir),
    workspaceId = workspace.id;
  workspace.close();
  const db = openFixtureStorage(dir),
    service = new ArticleService(
      new SqliteArticles(db, workspaceId, () => 100),
    );
  const origin = 'http://127.0.0.1:4317';
  const app = createServer({
    access: {
      origin,
      workspaceId,
      workspaceInfo: () => service.workspace(),
      bootstrapToken: 'b'.repeat(64),
      localSecret: 's'.repeat(64),
    },
    articles: () => service,
  });
  cleanup.push(async () => {
    await app.close();
    db.close();
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
  const create = async (title = '') => {
    const command = { mutationId: randomUUID(), title };
    const response = await app.inject({
      method: 'POST',
      url: '/api/articles',
      headers,
      payload: command,
    });
    expect(response.statusCode, response.body).toBe(200);
    return { article: ArticleSnapshot.parse(response.json()), command };
  };
  return { app, headers, db, service, create };
}
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
it('LIBRARY-CREATE-002 and ARTICLE-CREATE-001 explicit create is independent, while ensure and replay do not duplicate or rewind selection', async () => {
  const f = await setup();
  const a = await f.create('第一篇'),
    b = await f.create('第二篇');
  expect(a.article.articleId).not.toBe(b.article.articleId);
  const replay = await f.app.inject({
    method: 'POST',
    url: '/api/articles',
    headers: f.headers,
    payload: a.command,
  });
  expect(replay.json()).toEqual(a.article);
  expect(f.service.workspace().currentArticleId).toBe(b.article.articleId);
  const ensured = await f.app.inject({
    method: 'POST',
    url: '/api/articles/ensure-current',
    headers: f.headers,
    payload: { mutationId: randomUUID() },
  });
  expect(ArticleSnapshot.parse(ensured.json()).articleId).toBe(
    b.article.articleId,
  );
  expect(f.db.prepare('SELECT COUNT(*) n FROM articles').get()).toEqual({
    n: 2,
  });
  expect(f.service.read(a.article.articleId).document.title).toBe('第一篇');
  for (const request of [
    { url: '/api/articles', payload: { ...a.command, title: '不同标题' } },
    {
      url: '/api/articles/ensure-current',
      payload: { mutationId: a.command.mutationId },
    },
  ])
    expect(
      (await f.app.inject({ method: 'POST', headers: f.headers, ...request }))
        .statusCode,
    ).toBe(409);
});
it('LIBRARY-LIST-003 lists empty and duplicate-title articles with stable tied-time keyset pages and no document payload', async () => {
  const f = await setup();
  const empty = await f.app.inject({
    url: '/api/articles',
    headers: f.headers,
  });
  expect(empty.statusCode).toBe(200);
  expect(empty.json()).toEqual({ items: [], nextCursor: null });
  const ids: string[] = [];
  for (let i = 0; i < 5; i++)
    ids.push((await f.create('同名')).article.articleId);
  const actual: string[] = [];
  let query = '?limit=2';
  for (let page = 0; page < 3; page++) {
    const response = await f.app.inject({
      url: '/api/articles' + query,
      headers: f.headers,
    });
    expect(response.statusCode).toBe(200);
    const data = response.json<{
      items: { articleId: string; title: string }[];
      nextCursor: { createdAt: number; articleId: string } | null;
    }>();
    expect(data.items).toHaveLength(page === 2 ? 1 : 2);
    for (const item of data.items) {
      expect(item.title).toBe('同名');
      expect(item).not.toHaveProperty('document');
      actual.push(item.articleId);
    }
    if (page === 2) expect(data.nextCursor).toBeNull();
    else {
      expect(data.nextCursor).not.toBeNull();
      query = `?limit=2&beforeCreatedAt=${data.nextCursor!.createdAt}&beforeId=${data.nextCursor!.articleId}`;
    }
  }
  expect(actual).toEqual(ids.sort().reverse());
});
it('LIBRARY-LIST-003 saved and restored titles update the metadata projection atomically without changing identity', async () => {
  const f = await setup(),
    { article } = await f.create('原题');
  const saved = f.service.save(article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: { ...article.document, title: '新题' },
  });
  const readTitle = async () =>
    (await f.app.inject({ url: '/api/articles', headers: f.headers })).json<{
      items: { title: string; articleId: string; metadataVersion: number }[];
    }>().items[0];
  expect(await readTitle()).toMatchObject({
    title: '新题',
    articleId: article.articleId,
    metadataVersion: 1,
  });
  const restored = f.service.restore(article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: saved.appliedRevisionId,
    sourceRevisionId: article.headRevisionId,
  });
  expect(SaveResult.parse(restored).changed).toBe(true);
  expect(await readTitle()).toMatchObject({
    title: '原题',
    articleId: article.articleId,
  });
});
it('LIBRARY-FAILURE-013 protects library access and rejects malformed title or pagination without writing', async () => {
  const f = await setup();
  expect(
    (
      await f.app.inject({
        url: '/api/articles',
        headers: { host: f.headers.host },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: '/api/articles',
        headers: { ...f.headers, origin: 'https://other.example' },
        payload: { mutationId: randomUUID() },
      })
    ).statusCode,
  ).toBe(403);
  for (const title of ['中'.repeat(201), 7])
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/articles',
          headers: f.headers,
          payload: { mutationId: randomUUID(), title },
        })
      ).statusCode,
    ).toBe(422);
  for (const q of [
    'limit=0',
    'limit=101',
    'beforeCreatedAt=1',
    'beforeId=' + randomUUID(),
    'beforeCreatedAt=-1&beforeId=' + randomUUID(),
  ])
    expect(
      (await f.app.inject({ url: '/api/articles?' + q, headers: f.headers }))
        .statusCode,
    ).toBe(422);
  expect(f.db.prepare('SELECT COUNT(*) n FROM articles').get()).toEqual({
    n: 0,
  });
  expect((await f.create('😀'.repeat(200))).article.document.title).toBe(
    '😀'.repeat(200),
  );
});
it('LIBRARY-FAILURE-013 failed metadata insertion or title projection rolls back article, head and mutation', async () => {
  const f = await setup(),
    { article } = await f.create('保留');
  const current = f.service.workspace().currentArticleId;
  f.db.exec(
    "CREATE TEMP TRIGGER refuse_library BEFORE INSERT ON article_library BEGIN SELECT RAISE(ABORT,'injected library failure'); END;",
  );
  const command = { mutationId: randomUUID(), title: '失败新稿' };
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: '/api/articles',
        headers: f.headers,
        payload: command,
      })
    ).statusCode,
  ).toBe(503);
  expect(f.service.workspace().currentArticleId).toBe(current);
  expect(f.db.prepare('SELECT COUNT(*) n FROM articles').get()).toEqual({
    n: 1,
  });
  expect(() => f.service.mutation(command.mutationId)).toThrow();
  f.db.exec('DROP TRIGGER refuse_library');
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: '/api/articles',
        headers: f.headers,
        payload: command,
      })
    ).statusCode,
  ).toBe(200);
  f.db.exec(
    "CREATE TEMP TRIGGER refuse_title BEFORE UPDATE OF title ON article_library BEGIN SELECT RAISE(ABORT,'injected title failure'); END;",
  );
  const mutationId = randomUUID();
  expect(() =>
    f.service.save(article.articleId, {
      mutationId,
      baseRevisionId: article.headRevisionId,
      document: { ...article.document, title: '未提交' },
    }),
  ).toThrow();
  expect(f.service.read(article.articleId).headRevisionId).toBe(
    article.headRevisionId,
  );
  expect(() => f.service.mutation(mutationId)).toThrow();
});
it('LIBRARY-OPEN-004 opening an article is atomic and replay cannot rewind the latest selection', async () => {
  const f = await setup(),
    a = await f.create('A'),
    b = await f.create('B');
  const command = { mutationId: randomUUID() };
  const opened = await f.app.inject({
    method: 'POST',
    url: `/api/articles/${a.article.articleId}/open`,
    headers: f.headers,
    payload: command,
  });
  expect(opened.statusCode).toBe(200);
  expect(ArticleSnapshot.parse(opened.json()).articleId).toBe(
    a.article.articleId,
  );
  expect(f.service.workspace().currentArticleId).toBe(a.article.articleId);
  await f.app.inject({
    method: 'POST',
    url: `/api/articles/${b.article.articleId}/open`,
    headers: f.headers,
    payload: { mutationId: randomUUID() },
  });
  const replay = await f.app.inject({
    method: 'POST',
    url: `/api/articles/${a.article.articleId}/open`,
    headers: f.headers,
    payload: command,
  });
  expect(replay.json()).toEqual(opened.json());
  expect(f.service.workspace().currentArticleId).toBe(b.article.articleId);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `/api/articles/${b.article.articleId}/open`,
        headers: f.headers,
        payload: command,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    f.db.prepare('SELECT COUNT(*) n FROM article_revisions').get(),
  ).toEqual({ n: 2 });
});
it('LIBRARY-OPEN-004 refuses unknown or inactive articles without moving the current pointer', async () => {
  const f = await setup(),
    a = await f.create('A'),
    b = await f.create('B');
  f.db
    .prepare("UPDATE article_library SET state='archived' WHERE article_id=?")
    .run(a.article.articleId);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `/api/articles/${a.article.articleId}/open`,
        headers: f.headers,
        payload: { mutationId: randomUUID() },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `/api/articles/${randomUUID()}/open`,
        headers: f.headers,
        payload: { mutationId: randomUUID() },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `/api/articles/${a.article.articleId}/open`,
        headers: { host: f.headers.host },
        payload: { mutationId: randomUUID() },
      })
    ).statusCode,
  ).toBe(401);
  expect(f.service.workspace().currentArticleId).toBe(b.article.articleId);
});
it('LIBRARY-OPEN-004 a failed open mutation leaves recent selection and original request untouched', async () => {
  const f = await setup(),
    a = await f.create('A'),
    b = await f.create('B');
  f.db.exec(
    "CREATE TEMP TRIGGER refuse_open BEFORE INSERT ON mutations WHEN NEW.operation='open' BEGIN SELECT RAISE(ABORT,'injected open failure'); END;",
  );
  const command = { mutationId: randomUUID() };
  const result = await f.app.inject({
    method: 'POST',
    url: `/api/articles/${a.article.articleId}/open`,
    headers: f.headers,
    payload: command,
  });
  expect(result.statusCode).toBe(503);
  expect(f.service.workspace().currentArticleId).toBe(b.article.articleId);
  expect(() => f.service.mutation(command.mutationId)).toThrow();
});
