import { storageFixture } from '../fixtures/storage';
import { formattedArticle } from '../fixtures/article-document';
import { afterEach, expect, it, vi } from 'vitest';
import { SqliteWorkspace } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
let store: SqliteWorkspace | undefined, dir: string | undefined;
afterEach(() => {
  store?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
it('REVISION-HISTORY-001 marks initial, first change, five-minute change and restore without marking no-ops', () => {
  let time = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => time);
  dir = mkdtempSync(join(tmpdir(), 'inkling-revision-clock-'));
  store = SqliteWorkspace.open(dir);
  const service = new ArticleService(store.articles()),
    initial = service.ensure({ mutationId: randomUUID() });
  const id = initial.articleId;
  const save = (title: string) => {
    const current = service.read(id);
    return service.save(id, {
      mutationId: randomUUID(),
      baseRevisionId: current.headRevisionId,
      document: { ...current.document, title },
    });
  };
  expect(service.revisions(id, {}).items.map((r) => r.seq)).toEqual([1]);
  time += 1_000;
  const first = save('首次形成观点');
  expect(service.revision(id, first.appliedRevisionId).automaticAt).toBe(time);
  time += 299_999;
  const intermediate = save('未满五分钟');
  expect(
    service.revision(id, intermediate.appliedRevisionId).automaticAt,
  ).toBeNull();
  time += 1;
  const noop = save('未满五分钟');
  expect(noop.changed).toBe(false);
  expect(service.revisions(id, {}).items.map((r) => r.seq)).toEqual([2, 1]);
  const checkpoint = save('满五分钟后变化');
  expect(service.revision(id, checkpoint.appliedRevisionId).automaticAt).toBe(
    time,
  );
  service.name(id, intermediate.appliedRevisionId, {
    mutationId: randomUUID(),
    name: '独立标记',
  });
  expect(
    service.revision(id, intermediate.appliedRevisionId).automaticAt,
  ).toBeNull();
  time += 1;
  const restored = service.restore(id, {
    mutationId: randomUUID(),
    baseRevisionId: checkpoint.appliedRevisionId,
    sourceRevisionId: first.appliedRevisionId,
  });
  expect(service.revision(id, restored.appliedRevisionId)).toMatchObject({
    automaticAt: time,
    kind: 'restore',
    restoredFromRevisionId: first.appliedRevisionId,
    parentRevisionId: checkpoint.appliedRevisionId,
  });
  expect(service.revisions(id, {}).items.map((r) => r.seq)).toEqual([
    5, 4, 3, 2, 1,
  ]);
});

it('EDITOR-ROUNDTRIP-010 keeps the stored bytes and hash of a formatted V1 revision through upgrade and restore', () => {
  const f = storageFixture();
  try {
    const { service, article, db } = f;
    const id = article.articleId;
    const legacy = service.save(id, {
      mutationId: randomUUID(),
      baseRevisionId: article.headRevisionId,
      document: formattedArticle,
    });
    const readBytes = db.prepare(
      'SELECT CAST(document_json AS BLOB) AS bytes, content_hash FROM article_revisions WHERE id=?',
    );
    const original = readBytes.get(legacy.appliedRevisionId);
    expect(original).toMatchObject({
      bytes: expect.any(Uint8Array),
      content_hash: legacy.contentHash,
    });
    const upgraded = service.save(id, {
      mutationId: randomUUID(),
      baseRevisionId: legacy.appliedRevisionId,
      document: {
        ...formattedArticle,
        schemaVersion: 2,
        doc: {
          type: 'doc',
          content: [
            ...(formattedArticle.doc.content ?? []),
            {
              type: 'table',
              content: [
                {
                  type: 'tableRow',
                  content: [
                    { type: 'tableCell', content: [{ type: 'paragraph' }] },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    service.restore(id, {
      mutationId: randomUUID(),
      baseRevisionId: upgraded.appliedRevisionId,
      sourceRevisionId: legacy.appliedRevisionId,
    });
    expect(service.read(id).document).toEqual({
      ...formattedArticle,
      schemaVersion: 2,
    });
    expect(readBytes.get(legacy.appliedRevisionId)).toEqual(original);
  } finally {
    f.close();
  }
});
