import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SqliteWorkspace, SqliteArticles } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import {
  ArticleSnapshot,
  SaveResult,
  ArticleListPage,
} from '@inkling/contracts';
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
  expect(empty.json()).toEqual({ items: [], nextCursor: null, total: 0 });
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
it('LIBRARY-OPEN-004 refuses unknown or trashed articles without moving the current pointer', async () => {
  const f = await setup(),
    a = await f.create('A'),
    b = await f.create('B');
  f.db
    .prepare(
      "UPDATE article_library SET state='trashed',previous_state='active' WHERE article_id=?",
    )
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
it('LIBRARY-RENAME-006 title-only save preserves body and rejects stale renaming baseline', async () => {
  const f = await setup(),
    { article } = await f.create('原题');
  const document = {
    ...article.document,
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '个人洞见正文' }],
        },
      ],
    },
  };
  const saved = f.service.save(article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document,
  });
  const command = {
    mutationId: randomUUID(),
    baseRevisionId: saved.appliedRevisionId,
    document: { ...document, title: '新的标题' },
  };
  const response = await f.app.inject({
    method: 'PUT',
    url: `/api/articles/${article.articleId}/content`,
    headers: f.headers,
    payload: command,
  });
  expect(response.statusCode).toBe(200);
  expect(f.service.read(article.articleId).document).toEqual(command.document);
  expect(f.service.read(article.articleId).headSeq).toBe(3);
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url: `/api/articles/${article.articleId}/content`,
        headers: f.headers,
        payload: {
          ...command,
          mutationId: randomUUID(),
          document: { ...document, title: '过期改名' },
        },
      })
    ).statusCode,
  ).toBe(409);
  expect(f.service.read(article.articleId).document).toEqual(command.document);
});
it('LIBRARY-TAGS-007 normalized tags use their own CAS and replay without affecting revisions or selection', async () => {
  const f = await setup(),
    { article } = await f.create('标签文章');
  const other = await f.create('另一篇');
  const url = `/api/articles/${article.articleId}/metadata`;
  const get = await f.app.inject({ url, headers: f.headers });
  expect(get.statusCode).toBe(200);
  expect(get.json()).toMatchObject({
    tags: [],
    metadataVersion: 1,
    title: '标签文章',
  });
  const command = {
    mutationId: randomUUID(),
    baseMetadataVersion: 1,
    tags: [' 技术 ', 'e\u0301', 'é', '技术', 'API', 'api'],
  };
  const first = await f.app.inject({
    method: 'PUT',
    url,
    headers: f.headers,
    payload: command,
  });
  expect(first.statusCode).toBe(200);
  expect(first.json()).toMatchObject({
    mutationId: command.mutationId,
    metadata: { tags: ['API', 'api', 'é', '技术'], metadataVersion: 2 },
  });
  const rename = f.service.save(article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: { ...article.document, title: '新标题' },
  });
  const second = await f.app.inject({
    method: 'PUT',
    url,
    headers: f.headers,
    payload: {
      mutationId: randomUUID(),
      baseMetadataVersion: 2,
      tags: ['数据库'],
    },
  });
  expect(second.statusCode).toBe(200);
  const replay = await f.app.inject({
    method: 'PUT',
    url,
    headers: f.headers,
    payload: { ...command, tags: ['技术', 'é', 'api', 'API'] },
  });
  expect(replay.json()).toEqual(first.json());
  const current = await f.app.inject({ url, headers: f.headers });
  expect(current.json()).toMatchObject({
    tags: ['数据库'],
    metadataVersion: 3,
    title: '新标题',
  });
  expect(f.service.read(article.articleId).headRevisionId).toBe(
    rename.appliedRevisionId,
  );
  expect(f.service.workspace().currentArticleId).toBe(other.article.articleId);
  expect(
    f.db.prepare('SELECT COUNT(*) n FROM article_revisions').get(),
  ).toEqual({ n: 3 });
  const list = await f.app.inject({ url: '/api/articles', headers: f.headers });
  expect(list.json<{ items: unknown[] }>().items).toContainEqual(
    current.json(),
  );
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url,
        headers: f.headers,
        payload: { ...command, mutationId: randomUUID() },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url,
        headers: f.headers,
        payload: { ...command, tags: ['不同'] },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url: `/api/articles/${other.article.articleId}/metadata`,
        headers: f.headers,
        payload: command,
      })
    ).statusCode,
  ).toBe(409);
  const noChange = await f.app.inject({
    method: 'PUT',
    url,
    headers: f.headers,
    payload: {
      mutationId: randomUUID(),
      baseMetadataVersion: 3,
      tags: ['数据库'],
    },
  });
  expect(noChange.json()).toMatchObject({ metadata: { metadataVersion: 3 } });
  const clear = await f.app.inject({
    method: 'PUT',
    url,
    headers: f.headers,
    payload: { mutationId: randomUUID(), baseMetadataVersion: 3, tags: [] },
  });
  expect(clear.json()).toMatchObject({
    metadata: { tags: [], metadataVersion: 4 },
  });
});
it('LIBRARY-TAGS-007 validates Unicode tags, bounds, state and access without partial writes', async () => {
  const f = await setup(),
    { article } = await f.create();
  const url = `/api/articles/${article.articleId}/metadata`;
  const command = {
    mutationId: randomUUID(),
    baseMetadataVersion: 1,
    tags: ['😀'.repeat(30)],
  };
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url,
        headers: f.headers,
        payload: command,
      })
    ).statusCode,
  ).toBe(200);
  for (const tags of [
    [' '],
    ['x'.repeat(31)],
    [7],
    Array.from({ length: 11 }, (_, i) => String(i)),
  ])
    expect(
      (
        await f.app.inject({
          method: 'PUT',
          url,
          headers: f.headers,
          payload: {
            ...command,
            mutationId: randomUUID(),
            baseMetadataVersion: 2,
            tags,
          },
        })
      ).statusCode,
    ).toBe(422);
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url,
        headers: { host: f.headers.host },
        payload: command,
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await f.app.inject({ url, headers: { host: f.headers.host } })).statusCode,
  ).toBe(401);
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url,
        headers: { ...f.headers, origin: 'https://other.example' },
        payload: command,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url: `/api/articles/${randomUUID()}/metadata`,
        headers: f.headers,
        payload: { ...command, mutationId: randomUUID() },
      })
    ).statusCode,
  ).toBe(404);
  f.db
    .prepare("UPDATE article_library SET state='archived' WHERE article_id=?")
    .run(article.articleId);
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url,
        headers: f.headers,
        payload: {
          ...command,
          mutationId: randomUUID(),
          baseMetadataVersion: 2,
          tags: [],
        },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url,
        headers: f.headers,
        payload: command,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await f.app.inject({ url, headers: f.headers })).json(),
  ).toMatchObject({ metadataVersion: 2, tags: command.tags });
});
it('LIBRARY-TAGS-007 mutation failure rolls tags and metadata version back together', async () => {
  const f = await setup(),
    { article } = await f.create();
  const url = `/api/articles/${article.articleId}/metadata`;
  const old = await f.app.inject({
    method: 'PUT',
    url,
    headers: f.headers,
    payload: {
      mutationId: randomUUID(),
      baseMetadataVersion: 1,
      tags: ['原标签'],
    },
  });
  expect(old.statusCode).toBe(200);
  f.db.exec(
    "CREATE TEMP TRIGGER fail_metadata BEFORE INSERT ON mutations WHEN NEW.operation='metadata' BEGIN SELECT RAISE(ABORT,'test write failure'); END",
  );
  const command = {
    mutationId: randomUUID(),
    baseMetadataVersion: 2,
    tags: ['新标签'],
  };
  const result = await f.app.inject({
    method: 'PUT',
    url,
    headers: f.headers,
    payload: command,
  });
  expect(result.statusCode).toBe(503);
  expect(
    (await f.app.inject({ url, headers: f.headers })).json(),
  ).toMatchObject({ tags: ['原标签'], metadataVersion: 2 });
  expect(() => f.service.mutation(command.mutationId)).toThrow();
  expect(f.service.read(article.articleId)).toEqual(article);
  f.db.exec('DROP TRIGGER fail_metadata');
  expect(
    (
      await f.app.inject({
        method: 'PUT',
        url,
        headers: f.headers,
        payload: command,
      })
    ).statusCode,
  ).toBe(200);
});
it('LIBRARY-TAGS-007 rejects embedded line separators so labels round trip through the organizer', async () => {
  const f = await setup(),
    { article } = await f.create();
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    const result = await f.app.inject({
      method: 'PUT',
      url: `/api/articles/${article.articleId}/metadata`,
      headers: f.headers,
      payload: {
        mutationId: randomUUID(),
        baseMetadataVersion: 1,
        tags: ['一个' + separator + '标签'],
      },
    });
    expect(result.statusCode).toBe(422);
  }
  expect(f.service.metadata(article.articleId)).toMatchObject({
    tags: [],
    metadataVersion: 1,
  });
});
it('LIBRARY-FIND-008 combines literal title fragments and exact normalized tags without changing documents', async () => {
  const f = await setup();
  const a = await f.create('SQLite 100%_\\ 技术'),
    b = await f.create('sqlite 100abc 技术'),
    c = await f.create("SQL 引号'技术");
  for (const [article, tags] of [
    [a.article, ['数据库', 'é']],
    [b.article, ['数据库扩展']],
    [c.article, ['数据库', 'API']],
  ] as const)
    f.service.updateMetadata(article.articleId, {
      mutationId: randomUUID(),
      baseMetadataVersion: 1,
      tags: [...tags],
    });
  const list = async (q: string, tag = '') => {
    const result = await f.app.inject({
      url: '/api/articles?' + new URLSearchParams({ q, tag }),
      headers: f.headers,
    });
    expect(result.statusCode, result.body).toBe(200);
    return result
      .json<{ items: { articleId: string }[] }>()
      .items.map((item) => item.articleId);
  };
  expect(await list('sQlItE')).toEqual(
    [a.article.articleId, b.article.articleId].sort().reverse(),
  );
  expect(await list('%_\\')).toEqual([a.article.articleId]);
  expect(await list("'技术")).toEqual([c.article.articleId]);
  expect(await list('技术', ' 数据库 ')).toEqual(
    [a.article.articleId, c.article.articleId].sort().reverse(),
  );
  expect(await list('sqlite', '数据库')).toEqual([a.article.articleId]);
  expect(await list('', 'e\u0301')).toEqual([a.article.articleId]);
  expect(await list('', 'api')).toEqual([]);
  expect(await list('', 'API')).toEqual([c.article.articleId]);
  expect(await list('不存在')).toEqual([]);
  const before = f.service.read(a.article.articleId);
  f.service.save(a.article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: before.headRevisionId,
    document: {
      ...before.document,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '只在正文出现的词' }],
          },
        ],
      },
    },
  });
  expect(await list('只在正文出现的词')).toEqual([]);
  const after = f.service.read(a.article.articleId);
  await list('技术');
  expect(f.service.read(a.article.articleId)).toEqual(after);
  expect(f.service.workspace().currentArticleId).toBe(c.article.articleId);
});
it('LIBRARY-DESK-014 all articles spans active and archived with a full count across pages', async () => {
  const f = await setup();
  const active = (await f.create('同组一')).article;
  const archive = (await f.create('同组二')).article;
  const trash = (await f.create('同组三')).article;
  expect((await lifecycle(f, archive.articleId, 'archive')).statusCode).toBe(
    200,
  );
  expect((await lifecycle(f, trash.articleId, 'trash')).statusCode).toBe(200);
  const params = new URLSearchParams({
    state: 'all',
    term: '同组',
    limit: '1',
  });
  const read = async () =>
    ArticleListPage.parse(
      (
        await f.app.inject({
          url: '/api/articles?' + params,
          headers: f.headers,
        })
      ).json(),
    );
  const first = await read();
  expect(first.total).toBe(2);
  params.set('beforeId', first.nextCursor!.articleId);
  params.set('beforeCreatedAt', String(first.nextCursor!.createdAt));
  const next = await read();
  expect(next.total).toBe(2);
  expect(next.nextCursor).toBeNull();
  expect(
    [...first.items, ...next.items].map((item) => item.articleId).sort(),
  ).toEqual([active.articleId, archive.articleId].sort());
});
it('LIBRARY-FIND-008 filtered pagination is stable and excludes inactive articles', async () => {
  const f = await setup();
  const ids: string[] = [];
  for (let i = 0; i < 7; i++) {
    const { article } = await f.create(i < 6 ? '匹配标题' : '无关');
    f.service.updateMetadata(article.articleId, {
      mutationId: randomUUID(),
      baseMetadataVersion: 1,
      tags: i % 2 === 0 ? ['目标'] : ['其他'],
    });
    if (i < 6 && i % 2 === 0) ids.push(article.articleId);
  }
  const archived = await f.create('匹配标题');
  f.service.updateMetadata(archived.article.articleId, {
    mutationId: randomUUID(),
    baseMetadataVersion: 1,
    tags: ['目标'],
  });
  f.db
    .prepare("UPDATE article_library SET state='archived' WHERE article_id=?")
    .run(archived.article.articleId);
  const found: string[] = [];
  let cursor: { createdAt: number; articleId: string } | null = null;
  for (let n = 0; n < 3; n++) {
    const params = new URLSearchParams({ q: '匹配', tag: '目标', limit: '1' });
    if (cursor) {
      params.set('beforeCreatedAt', String(cursor.createdAt));
      params.set('beforeId', cursor.articleId);
    }
    const response = await f.app.inject({
      url: '/api/articles?' + params,
      headers: f.headers,
    });
    expect(response.statusCode).toBe(200);
    const result = ArticleListPage.parse(response.json());
    found.push(...result.items.map((item) => item.articleId));
    cursor = result.nextCursor;
    expect(result.items).toHaveLength(1);
  }
  expect(cursor).toBeNull();
  expect(found).toEqual(ids.sort().reverse());
});
it('LIBRARY-FIND-008 validates query bounds and treats wildcard-like input literally', async () => {
  const f = await setup();
  await f.create('😀'.repeat(100));
  await f.create('% _ \\');
  for (const query of [
    { q: '😀'.repeat(101), tag: '' },
    { q: '', tag: 'x'.repeat(31) },
    { q: '', tag: '两个\n标签' },
  ])
    expect(
      (
        await f.app.inject({
          url: '/api/articles?' + new URLSearchParams(query),
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(422);
  const good = await f.app.inject({
    url: '/api/articles?' + new URLSearchParams({ q: '😀'.repeat(100) }),
    headers: f.headers,
  });
  expect(good.statusCode).toBe(200);
  expect(good.json<{ items: unknown[] }>().items).toHaveLength(1);
  const empty = await f.app.inject({
    url: '/api/articles?q=&tag=',
    headers: f.headers,
  });
  expect(empty.statusCode).toBe(200);
  expect(empty.json<{ items: unknown[] }>().items).toHaveLength(2);
  expect(
    (
      await f.app.inject({
        url: '/api/articles?q=x&tag=x',
        headers: { host: f.headers.host },
      })
    ).statusCode,
  ).toBe(401);
});

type LibraryFixture = Awaited<ReturnType<typeof setup>>;
function lifecycle(
  f: LibraryFixture,
  articleId: string,
  action: string,
  baseMetadataVersion = f.service.metadata(articleId).metadataVersion,
  mutationId = randomUUID(),
) {
  return f.app.inject({
    method: 'POST',
    url: `/api/articles/${articleId}/lifecycle`,
    headers: f.headers,
    payload: { mutationId, baseMetadataVersion, action },
  });
}
function retainedContent(f: LibraryFixture) {
  return [
    'articles',
    'article_revisions',
    'revision_markers',
    'article_tags',
  ].map((table) => f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}
it('LIBRARY-ARCHIVE-009 archive is read-only, retains history and permits committed replays; unarchive permits new saves', async () => {
  const f = await setup(),
    { article } = await f.create('归档内容');
  const id = article.articleId;
  const save = {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: { ...article.document, title: '真实历史' },
  };
  const saved = f.service.save(id, save);
  const restore = {
    mutationId: randomUUID(),
    baseRevisionId: saved.appliedRevisionId,
    sourceRevisionId: article.headRevisionId,
  };
  const restored = f.service.restore(id, restore);
  const name = { mutationId: randomUUID(), name: '初稿' };
  const named = f.service.name(id, article.headRevisionId, name);
  const tags = {
    mutationId: randomUUID(),
    baseMetadataVersion: 1,
    tags: ['技术'],
  };
  const tagged = f.service.updateMetadata(id, tags);
  const original = retainedContent(f);
  const archived = await lifecycle(f, id, 'archive');
  expect(archived.statusCode, archived.body).toBe(200);
  expect(archived.json()).toMatchObject({
    metadata: { state: 'archived', metadataVersion: 3, tags: ['技术'] },
  });
  expect(f.service.workspace().currentArticleId).toBeNull();
  for (const suffix of [
    '',
    '/revisions',
    `/revisions/${article.headRevisionId}`,
  ]) {
    const read = await f.app.inject({
      url: `/api/articles/${id}${suffix}`,
      headers: f.headers,
    });
    expect(read.statusCode, read.body).toBe(200);
  }
  const writes = [
    {
      method: 'PUT' as const,
      suffix: '/content',
      payload: {
        ...save,
        baseRevisionId: restored.appliedRevisionId,
        mutationId: randomUUID(),
      },
    },
    {
      method: 'POST' as const,
      suffix: '/restore',
      payload: {
        ...restore,
        baseRevisionId: restored.appliedRevisionId,
        mutationId: randomUUID(),
      },
    },
    {
      method: 'PUT' as const,
      suffix: `/revisions/${article.headRevisionId}/name`,
      payload: { ...name, mutationId: randomUUID() },
    },
    {
      method: 'PUT' as const,
      suffix: '/metadata',
      payload: { ...tags, baseMetadataVersion: 3, mutationId: randomUUID() },
    },
  ];
  for (const write of writes) {
    const response = await f.app.inject({
      method: write.method,
      url: `/api/articles/${id}${write.suffix}`,
      headers: f.headers,
      payload: write.payload,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'ARTICLE_NOT_ACTIVE',
    });
    expect(() => f.service.mutation(write.payload.mutationId)).toThrow();
  }
  expect(f.service.save(id, save)).toEqual(saved);
  expect(f.service.restore(id, restore)).toEqual(restored);
  expect(f.service.name(id, article.headRevisionId, name)).toEqual(named);
  expect(f.service.updateMetadata(id, tags)).toEqual(tagged);
  expect(retainedContent(f)).toEqual(original);
  expect((await lifecycle(f, id, 'unarchive')).statusCode).toBe(200);
  expect(
    f.service.save(id, {
      ...save,
      mutationId: randomUUID(),
      baseRevisionId: restored.appliedRevisionId,
    }).changed,
  ).toBe(true);
});
it.each(['active', 'archived'])(
  'LIBRARY-TRASH-010/RESTORE-011 trash retains %s content and restore returns to its origin without replay side effects',
  async (origin) => {
    const f = await setup(),
      { article, command: created } = await f.create('回收稿');
    const id = article.articleId;
    const savedCommand = {
      mutationId: randomUUID(),
      baseRevisionId: article.headRevisionId,
      document: { ...article.document, title: '保留正文' },
    };
    const saved = f.service.save(id, savedCommand);
    f.service.updateMetadata(id, {
      mutationId: randomUUID(),
      baseMetadataVersion: 1,
      tags: ['保留标签'],
    });
    f.service.name(id, article.headRevisionId, {
      mutationId: randomUUID(),
      name: '保留名称',
    });
    if (origin === 'archived')
      expect((await lifecycle(f, id, 'archive')).statusCode).toBe(200);
    const original = retainedContent(f),
      version = f.service.metadata(id).metadataVersion;
    const trashId = randomUUID();
    const trashed = await lifecycle(f, id, 'trash', version, trashId);
    expect(trashed.statusCode, trashed.body).toBe(200);
    expect(trashed.json()).toMatchObject({
      metadata: { state: 'trashed', metadataVersion: version + 1 },
    });
    expect(
      f.db
        .prepare(
          'SELECT previous_state FROM article_library WHERE article_id=?',
        )
        .get(id),
    ).toEqual({ previous_state: origin });
    expect(f.service.workspace().currentArticleId).toBeNull();
    for (const suffix of [
      '',
      '/revisions',
      `/revisions/${article.headRevisionId}`,
    ]) {
      const read = await f.app.inject({
        url: `/api/articles/${id}${suffix}`,
        headers: f.headers,
      });
      expect(read.statusCode).toBe(409);
      expect(read.json()).toMatchObject({ code: 'ARTICLE_TRASHED' });
    }
    expect(
      (
        await f.app.inject({
          url: `/api/articles/${id}/metadata`,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(200);
    const refusedSave = await f.app.inject({
      method: 'PUT',
      url: `/api/articles/${id}/content`,
      headers: f.headers,
      payload: {
        ...savedCommand,
        mutationId: randomUUID(),
        baseRevisionId: saved.appliedRevisionId,
      },
    });
    expect(refusedSave.json()).toMatchObject({
      code: 'ARTICLE_NOT_ACTIVE',
    });
    expect(f.service.save(id, savedCommand)).toEqual(saved);
    expect(f.service.create(created)).toEqual(article);
    const restoreId = randomUUID();
    const restored = await lifecycle(f, id, 'restore', version + 1, restoreId);
    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json()).toMatchObject({
      metadata: {
        state: origin,
        metadataVersion: version + 2,
        tags: ['保留标签'],
      },
    });
    expect(
      f.db
        .prepare(
          'SELECT previous_state FROM article_library WHERE article_id=?',
        )
        .get(id),
    ).toEqual({ previous_state: null });
    expect(retainedContent(f)).toEqual(original);
    const other = await f.create('后来选中的稿');
    const beforeReplay = retainedContent(f);
    expect((await lifecycle(f, id, 'trash', version, trashId)).json()).toEqual(
      trashed.json(),
    );
    expect(
      (await lifecycle(f, id, 'restore', version + 1, restoreId)).json(),
    ).toEqual(restored.json());
    expect(f.service.workspace().currentArticleId).toBe(
      other.article.articleId,
    );
    expect(f.service.metadata(id).state).toBe(origin);
    expect(retainedContent(f)).toEqual(beforeReplay);
    // The original article's retained rows survive; only the explicit second create adds rows.
    for (let i = 0; i < original.length; i++)
      expect(beforeReplay[i]).toEqual(expect.arrayContaining(original[i]!));
    expect(f.service.read(id).headRevisionId).toBe(saved.appliedRevisionId);
  },
);
it('LIBRARY-TRASH-010 rejects stale metadata confirmations, invalid transitions and reused keys', async () => {
  const f = await setup(),
    { article } = await f.create('竞争');
  const id = article.articleId;
  f.service.updateMetadata(id, {
    mutationId: randomUUID(),
    baseMetadataVersion: 1,
    tags: ['新标签'],
  });
  const staleId = randomUUID();
  const stale = await lifecycle(f, id, 'trash', 1, staleId);
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: 'METADATA_CONFLICT' });
  expect(() => f.service.mutation(staleId)).toThrow();
  for (const action of ['unarchive', 'restore']) {
    const invalid = await lifecycle(f, id, action);
    expect(invalid.statusCode).toBe(409);
    expect(invalid.json()).toMatchObject({
      code: 'INVALID_LIFECYCLE_TRANSITION',
    });
  }
  const mutationId = randomUUID();
  expect((await lifecycle(f, id, 'archive', 2, mutationId)).statusCode).toBe(
    200,
  );
  expect((await lifecycle(f, id, 'trash', 2)).json()).toMatchObject({
    code: 'METADATA_CONFLICT',
  });
  for (const action of ['archive', 'restore'])
    expect((await lifecycle(f, id, action)).json()).toMatchObject({
      code: 'INVALID_LIFECYCLE_TRANSITION',
    });
  for (const [target, action, base] of [
    [id, 'trash', 2],
    [id, 'archive', 3],
    [(await f.create()).article.articleId, 'archive', 2],
  ] as const) {
    expect(
      (await lifecycle(f, target, action, base, mutationId)).json(),
    ).toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  }
  const crossOperation = await f.app.inject({
    method: 'POST',
    url: `/api/articles/${id}/open`,
    headers: f.headers,
    payload: { mutationId },
  });
  expect(crossOperation.json()).toMatchObject({
    code: 'IDEMPOTENCY_MISMATCH',
  });
  expect(f.service.metadata(id)).toMatchObject({
    state: 'archived',
    metadataVersion: 3,
  });
  expect((await lifecycle(f, id, 'trash')).statusCode).toBe(200);
  for (const action of ['archive', 'unarchive', 'trash'])
    expect((await lifecycle(f, id, action)).json()).toMatchObject({
      code: 'INVALID_LIFECYCLE_TRANSITION',
    });
});
it('LIBRARY-OPEN-004/ARCHIVE-009 and ARTICLE-CREATE-001 use safe fallback, preserve explicit archive opening and only ensure active drafts', async () => {
  const f = await setup(),
    a = (await f.create('A')).article,
    b = (await f.create('B')).article;
  f.db
    .prepare('UPDATE article_library SET updated_at=200 WHERE article_id=?')
    .run(a.articleId);
  const c = (await f.create('C')).article;
  expect((await lifecycle(f, c.articleId, 'archive')).statusCode).toBe(200);
  expect(
    f.db.prepare('SELECT current_article_id FROM workspace').get(),
  ).toEqual({ current_article_id: null });
  expect(f.service.workspace().currentArticleId).toBe(a.articleId);
  expect(
    f.db.prepare('SELECT current_article_id FROM workspace').get(),
  ).toEqual({ current_article_id: null });
  const openId = randomUUID();
  const opened = await f.app.inject({
    method: 'POST',
    url: `/api/articles/${c.articleId}/open`,
    headers: f.headers,
    payload: { mutationId: openId },
  });
  expect(opened.statusCode, opened.body).toBe(200);
  expect(f.service.workspace().currentArticleId).toBe(c.articleId);
  expect(f.service.ensure({ mutationId: randomUUID() }).articleId).toBe(
    a.articleId,
  );
  expect(f.service.workspace().currentArticleId).toBe(a.articleId);
  expect((await lifecycle(f, b.articleId, 'trash')).statusCode).toBe(200);
  expect(f.service.workspace().currentArticleId).toBe(a.articleId);
  expect((await lifecycle(f, a.articleId, 'archive')).statusCode).toBe(200);
  expect(f.service.workspace().currentArticleId).toBeNull();
  expect(f.db.prepare('SELECT count(*) n FROM articles').get()).toEqual({
    n: 3,
  });
  // Even an explicitly opened archive is not returned by a new ensure request.
  f.service.open(c.articleId, { mutationId: randomUUID() });
  const ensureId = randomUUID(),
    ensured = f.service.ensure({ mutationId: ensureId });
  expect([a.articleId, b.articleId, c.articleId]).not.toContain(
    ensured.articleId,
  );
  expect(f.service.metadata(ensured.articleId).state).toBe('active');
  expect(f.service.ensure({ mutationId: ensureId })).toEqual(ensured);
  expect(f.db.prepare('SELECT count(*) n FROM articles').get()).toEqual({
    n: 4,
  });
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `/api/articles/${c.articleId}/open`,
        headers: f.headers,
        payload: { mutationId: openId },
      })
    ).json(),
  ).toEqual(opened.json());
  expect(f.service.workspace().currentArticleId).toBe(ensured.articleId);
});
it('LIBRARY-FIND-008/RESTORE-011 filters each state with literal title, exact tag and stable pagination', async () => {
  const f = await setup();
  for (const state of ['active', 'archived', 'trashed']) {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { article } = await f.create('技术%笔记');
      f.service.updateMetadata(article.articleId, {
        mutationId: randomUUID(),
        baseMetadataVersion: 1,
        tags: ['技术'],
      });
      if (state !== 'active')
        expect(
          (
            await lifecycle(
              f,
              article.articleId,
              state === 'archived' ? 'archive' : 'trash',
            )
          ).statusCode,
        ).toBe(200);
      ids.push(article.articleId);
    }
    const base = new URLSearchParams({
      state,
      q: '%',
      tag: '技术',
      limit: '2',
    });
    const first = await f.app.inject({
      url: '/api/articles?' + base,
      headers: f.headers,
    });
    expect(first.statusCode, first.body).toBe(200);
    const page = ArticleListPage.parse(first.json());
    expect(page.items).toHaveLength(2);
    expect(page.items.every((item) => item.state === state)).toBe(true);
    base.set('beforeId', page.nextCursor!.articleId);
    base.set('beforeCreatedAt', String(page.nextCursor!.createdAt));
    const next = ArticleListPage.parse(
      (
        await f.app.inject({ url: '/api/articles?' + base, headers: f.headers })
      ).json(),
    );
    expect(
      [...page.items, ...next.items].map((item) => item.articleId),
    ).toEqual(ids.sort().reverse());
    expect(next.nextCursor).toBeNull();
  }
  const defaults = ArticleListPage.parse(
    (await f.app.inject({ url: '/api/articles', headers: f.headers })).json(),
  );
  expect(defaults.items).toHaveLength(3);
  expect(defaults.items.every((item) => item.state === 'active')).toBe(true);
});
it.each(['state', 'pointer', 'mutation'])(
  'LIBRARY-FAILURE-013 lifecycle %s write failure rolls back state, version, pointer and request; same command retries',
  async (point) => {
    const f = await setup(),
      { article } = await f.create('原稿');
    const id = article.articleId,
      mutationId = randomUUID();
    const before = retainedContent(f),
      metadata = f.service.metadata(id);
    const event = {
      state: 'AFTER UPDATE OF state ON article_library',
      pointer: 'AFTER UPDATE OF current_article_id ON workspace',
      mutation: 'AFTER INSERT ON mutations',
    }[point]!;
    f.db.exec(
      `CREATE TEMP TRIGGER fail_lifecycle ${event} BEGIN SELECT RAISE(ABORT,'injected lifecycle failure'); END;`,
    );
    const failure = await lifecycle(f, id, 'archive', 1, mutationId);
    expect(failure.statusCode, failure.body).toBe(503);
    expect(f.service.metadata(id)).toEqual(metadata);
    expect(f.service.workspace().currentArticleId).toBe(id);
    expect(
      f.db
        .prepare(
          'SELECT previous_state FROM article_library WHERE article_id=?',
        )
        .get(id),
    ).toEqual({ previous_state: null });
    expect(retainedContent(f)).toEqual(before);
    expect(() => f.service.mutation(mutationId)).toThrow();
    f.db.exec('DROP TRIGGER fail_lifecycle');
    expect((await lifecycle(f, id, 'archive', 1, mutationId)).statusCode).toBe(
      200,
    );
    expect(f.service.metadata(id)).toMatchObject({
      state: 'archived',
      metadataVersion: 2,
    });
  },
);
it('LIBRARY-FAILURE-013 lifecycle authenticates and validates before any mutation', async () => {
  const f = await setup(),
    { article } = await f.create();
  const url = `/api/articles/${article.articleId}/lifecycle`;
  const payload = {
    mutationId: randomUUID(),
    baseMetadataVersion: 1,
    action: 'archive',
  };
  for (const [headers, status] of [
    [{ host: f.headers.host }, 401],
    [{ ...f.headers, origin: 'https://other.example' }, 403],
    [{ ...f.headers, 'x-csrf-token': 'invalid' }, 403],
  ] as const) {
    expect(
      (await f.app.inject({ method: 'POST', url, headers, payload }))
        .statusCode,
    ).toBe(status);
  }
  for (const invalid of [
    { ...payload, action: 'delete' },
    { ...payload, baseMetadataVersion: 0 },
    { ...payload, baseMetadataVersion: 1.5 },
    { ...payload, baseMetadataVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...payload, mutationId: 'bad' },
    { ...payload, extra: true },
  ]) {
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: f.headers,
          payload: invalid,
        })
      ).statusCode,
    ).toBe(422);
  }
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: '/api/articles/bad/lifecycle',
        headers: f.headers,
        payload,
      })
    ).statusCode,
  ).toBe(422);
  expect((await lifecycle(f, randomUUID(), 'archive', 1)).statusCode).toBe(404);
  expect(
    (
      await f.app.inject({
        url: '/api/articles?state=deleted',
        headers: f.headers,
      })
    ).statusCode,
  ).toBe(422);
  expect(f.service.metadata(article.articleId)).toMatchObject({
    state: 'active',
    metadataVersion: 1,
  });
  expect(() => f.service.mutation(payload.mutationId)).toThrow();
});
