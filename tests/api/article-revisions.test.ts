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
it('REVISION-HISTORY-001 lists filtered history and stable pages; names replay without changing content', async () => {
  const { app, headers, article } = await setup();
  const path = `/api/articles/${article.articleId}`;
  let baseRevisionId = article.headRevisionId;
  for (const title of ['第一稿', '第二稿', '第三稿']) {
    const saved = SaveResult.parse(
      (
        await app.inject({
          method: 'PUT',
          url: path + '/content',
          headers,
          payload: {
            mutationId: randomUUID(),
            baseRevisionId,
            document: { ...article.document, title },
          },
        })
      ).json(),
    );
    baseRevisionId = saved.appliedRevisionId;
  }
  const list = await app.inject({
    url: path + '/revisions?limit=2&all=true',
    headers,
  });
  expect(list.statusCode).toBe(200);
  const page = list.json<{
    items: { revisionId: string; seq: number; name: string | null }[];
    nextBeforeSeq: number;
  }>();
  expect(page.items.map((x) => x.seq)).toEqual([4, 3]);
  expect(page.nextBeforeSeq).toBe(3);
  const next = await app.inject({
    url: path + `/revisions?limit=2&all=true&beforeSeq=${page.nextBeforeSeq}`,
    headers,
  });
  expect(next.json()).toMatchObject({
    items: [{ seq: 2 }, { seq: 1 }],
    nextBeforeSeq: null,
  });
  const filtered = await app.inject({ url: path + '/revisions', headers });
  expect(
    filtered.json<{ items: { seq: number }[] }>().items.map((x) => x.seq),
  ).toEqual([2, 1]);
  const nameUrl = path + `/revisions/${baseRevisionId}/name`,
    payload = { mutationId: randomUUID(), name: '洞见成形' };
  const named = await app.inject({
    method: 'PUT',
    url: nameUrl,
    headers,
    payload,
  });
  expect(named.statusCode).toBe(200);
  expect(
    (
      await app.inject({ method: 'PUT', url: nameUrl, headers, payload })
    ).json(),
  ).toEqual(named.json());
  const renamed = await app.inject({
    method: 'PUT',
    url: nameUrl,
    headers,
    payload: { mutationId: randomUUID(), name: '最终判断' },
  });
  expect(renamed.statusCode).toBe(200);
  await app.inject({ method: 'PUT', url: nameUrl, headers, payload }); // old retry must not undo later rename
  expect(
    (await app.inject({ url: path + '/revisions', headers })).json(),
  ).toMatchObject({
    items: [{ seq: 4, name: '最终判断' }, { seq: 2 }, { seq: 1 }],
  });
  expect((await app.inject({ url: path, headers })).json()).toMatchObject({
    headSeq: 4,
    document: { title: '第三稿' },
  });
  expect(
    (
      await app.inject({
        url: path + `/revisions/${article.headRevisionId}`,
        headers,
      })
    ).json(),
  ).toMatchObject({ seq: 1, document: article.document });
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: nameUrl,
        headers,
        payload: { ...payload, name: '不同载荷' },
      })
    ).statusCode,
  ).toBe(409);
});
it('WORKSPACE-PATH-005 revision reads and names reject foreign IDs, invalid bounds and unauthorized writes', async () => {
  const { app, headers, article } = await setup();
  const path = `/api/articles/${article.articleId}/revisions`;
  expect(
    (await app.inject({ url: path, headers: { host: headers.host } }))
      .statusCode,
  ).toBe(401);
  for (const query of [
    'limit=101',
    'limit=0',
    'beforeSeq=-1',
    'all=maybe',
    'unknown=1',
  ])
    expect(
      (await app.inject({ url: path + '?' + query, headers })).statusCode,
    ).toBe(422);
  expect(
    (
      await app.inject({
        url: `/api/articles/${randomUUID()}/revisions/${article.headRevisionId}`,
        headers,
      })
    ).statusCode,
  ).toBe(404);
  for (const name of ['', ' '.repeat(3), '中'.repeat(81)])
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: path + `/${article.headRevisionId}/name`,
          headers,
          payload: { mutationId: randomUUID(), name },
        })
      ).statusCode,
    ).toBe(422);
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: path + `/${randomUUID()}/name`,
        headers,
        payload: { mutationId: randomUUID(), name: '有效' },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: path + `/${article.headRevisionId}/name`,
        headers: {
          host: headers.host,
          origin: headers.origin,
          cookie: headers.cookie,
        },
        payload: { mutationId: randomUUID(), name: '有效' },
      })
    ).statusCode,
  ).toBe(403);
});

it('REVISION-RESTORE-003 restores as a new revision, preserves history and deduplicates before CAS', async () => {
  const { app, headers, article } = await setup(),
    path = `/api/articles/${article.articleId}`;
  const saved = SaveResult.parse(
    (
      await app.inject({
        method: 'PUT',
        url: path + '/content',
        headers,
        payload: {
          mutationId: randomUUID(),
          baseRevisionId: article.headRevisionId,
          document: { ...article.document, title: '新稿' },
        },
      })
    ).json(),
  );
  const payload = {
    mutationId: randomUUID(),
    baseRevisionId: saved.appliedRevisionId,
    sourceRevisionId: article.headRevisionId,
  };
  const restored = await app.inject({
    method: 'POST',
    url: path + '/restore',
    headers,
    payload,
  });
  expect(restored.statusCode).toBe(200);
  const result = SaveResult.parse(restored.json());
  expect(result.appliedSeq).toBe(3);
  expect(
    (
      await app.inject({
        url: path + `/revisions/${result.appliedRevisionId}`,
        headers,
      })
    ).json(),
  ).toMatchObject({
    kind: 'restore',
    parentRevisionId: saved.appliedRevisionId,
    restoredFromRevisionId: article.headRevisionId,
    document: article.document,
  });
  const again = await app.inject({
    method: 'POST',
    url: path + '/restore',
    headers,
    payload: {
      mutationId: randomUUID(),
      baseRevisionId: result.appliedRevisionId,
      sourceRevisionId: article.headRevisionId,
    },
  });
  expect(SaveResult.parse(again.json()).appliedSeq).toBe(4); // explicit same-content restore still records intent
  expect(
    (
      await app.inject({
        method: 'POST',
        url: path + '/restore',
        headers,
        payload,
      })
    ).json(),
  ).toEqual(restored.json());
  expect(
    (
      await app.inject({
        method: 'POST',
        url: path + '/restore',
        headers,
        payload: { ...payload, mutationId: randomUUID() },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: path + '/restore',
        headers,
        payload: { ...payload, sourceRevisionId: saved.appliedRevisionId },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await app.inject({ url: path + '/revisions?all=true', headers })).json(),
  ).toMatchObject({ items: [{ seq: 4 }, { seq: 3 }, { seq: 2 }, { seq: 1 }] });
  expect(
    (
      await app.inject({
        method: 'POST',
        url: path + '/restore',
        headers,
        payload: {
          mutationId: randomUUID(),
          baseRevisionId: SaveResult.parse(again.json()).appliedRevisionId,
          sourceRevisionId: randomUUID(),
        },
      })
    ).statusCode,
  ).toBe(404);
});
