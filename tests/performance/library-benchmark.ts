import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ArticleSnapshot, ArticleListPage } from '@inkling/contracts';
export async function benchmarkLibrary(
  call: (path: string, method: string, body?: string) => Promise<unknown>,
) {
  const expected = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const article = ArticleSnapshot.parse(
      await call(
        '/api/articles',
        'POST',
        JSON.stringify({ mutationId: randomUUID(), title: `技术复盘-${i}` }),
      ),
    );
    const tagged = i % 3 === 0;
    if (tagged)
      await call(
        `/api/articles/${article.articleId}/metadata`,
        'PUT',
        JSON.stringify({
          mutationId: randomUUID(),
          baseMetadataVersion: 1,
          tags: ['技术'],
        }),
      );
    if (i % 10 === 0)
      await call(
        `/api/articles/${article.articleId}/lifecycle`,
        'POST',
        JSON.stringify({
          mutationId: randomUUID(),
          baseMetadataVersion: tagged ? 2 : 1,
          action: i % 20 === 0 ? 'archive' : 'trash',
        }),
      );
    else if (tagged) expected.add(article.articleId);
  }
  const base = new URLSearchParams({
    state: 'active',
    q: '技术复盘',
    tag: '技术',
    limit: '20',
  });
  const times: number[] = [];
  let maxResponseBytes = 0;
  const read = async (query: URLSearchParams) => {
    const began = performance.now();
    const raw = await call('/api/articles?' + query.toString(), 'GET');
    const elapsed = performance.now() - began;
    const json = JSON.stringify(raw);
    assert(!json.includes('"document":'), 'Library must not include documents');
    maxResponseBytes = Math.max(maxResponseBytes, Buffer.byteLength(json));
    times.push(elapsed);
    return ArticleListPage.parse(raw);
  };
  for (let i = 0; i < 30; i++) await read(base);
  const seen = new Set<string>();
  let cursor: ArticleListPage['nextCursor'] = null;
  do {
    const params = new URLSearchParams(base);
    if (cursor) {
      params.set('beforeCreatedAt', String(cursor.createdAt));
      params.set('beforeId', cursor.articleId);
    }
    const page = await read(params);
    for (const item of page.items) {
      assert(item.state === 'active' && item.tags.includes('技术'));
      assert(!seen.has(item.articleId), 'Duplicate article across pages');
      seen.add(item.articleId);
    }
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    seen,
    expected,
    'Filtered pagination must contain every matching article',
  );
  const sorted = [...times].sort((a, b) => a - b);
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  return {
    articleCount: 1000,
    active: 900,
    archived: 50,
    trashed: 50,
    matchedArticles: seen.size,
    samples: times.length,
    p95Ms: Number(p95Ms.toFixed(2)),
    maxMs: Number(Math.max(...times).toFixed(2)),
    maxResponseBytes,
    thresholdMs: 250,
    passed: p95Ms <= 250,
  };
}
