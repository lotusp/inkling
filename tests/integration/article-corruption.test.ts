import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { storageFixture, seedStorage } from '../fixtures/storage';
import { SqliteWorkspace, SqliteArticles } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
it('ARTICLE-CORRUPT-012 damaged head refuses writes but verified older revisions remain discoverable', () => {
  const f = storageFixture();
  cleanup.push(f.close);
  const { service, db, article } = f;
  const saved = service.save(article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: { ...article.document, title: '受损当前稿' },
  });
  db.prepare('UPDATE article_revisions SET content_hash=? WHERE id=?').run(
    'bad',
    saved.appliedRevisionId,
  );
  expect(() => service.read(article.articleId)).toThrow('正文校验失败');
  expect(() =>
    service.save(article.articleId, {
      mutationId: randomUUID(),
      baseRevisionId: saved.appliedRevisionId,
      document: article.document,
    }),
  ).toThrow();
  expect(
    service
      .revisions(article.articleId, { all: 'true' })
      .items.map((r) => r.seq),
  ).toEqual([2, 1]);
  expect(
    service.revision(article.articleId, article.headRevisionId).document,
  ).toEqual(article.document);
  expect(() =>
    service.revision(article.articleId, saved.appliedRevisionId),
  ).toThrow('校验失败');
  expect(db.prepare('SELECT head_revision_id FROM articles').get()).toEqual({
    head_revision_id: saved.appliedRevisionId,
  });
});
it('ARTICLE-CORRUPT-012 discovering damaged older content quarantines writes without blocking healthy exports', () => {
  const f = storageFixture();
  cleanup.push(f.close);
  const { service, db, article } = f;
  const saved = service.save(article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: { ...article.document, title: '有效新稿' },
  });
  db.prepare('UPDATE article_revisions SET content_hash=? WHERE id=?').run(
    'bad',
    article.headRevisionId,
  );
  expect(() =>
    service.revision(article.articleId, article.headRevisionId),
  ).toThrow('校验失败');
  expect(() =>
    service.save(article.articleId, {
      mutationId: randomUUID(),
      baseRevisionId: saved.appliedRevisionId,
      document: { ...article.document, title: '不应继续写入' },
    }),
  ).toThrow('损坏');
  expect(
    service.revision(article.articleId, saved.appliedRevisionId).document.title,
  ).toBe('有效新稿');
});
it('ARTICLE-CORRUPT-012 an invalid database header is preserved and never recreated', () => {
  const { dir } = seedStorage();
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'inkling.sqlite'),
    bytes = readFileSync(path);
  bytes.fill(0, 0, 16);
  writeFileSync(path, bytes);
  expect(() => SqliteWorkspace.open(dir)).toThrow('WORKSPACE_CORRUPT');
  expect(readFileSync(path)).toEqual(bytes);
});

it('ARTICLE-CORRUPT-012 reopening scans historical hashes before accepting writes', () => {
  const f = storageFixture();
  cleanup.push(f.close);
  const { service, db, article } = f;
  const saved = service.save(article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: { ...article.document, title: '有效新稿' },
  });
  db.prepare('UPDATE article_revisions SET content_hash=? WHERE id=?').run(
    'bad',
    article.headRevisionId,
  );
  const reopened = new ArticleService(new SqliteArticles(db, f.workspaceId));
  expect(() => reopened.read(article.articleId)).toThrow('损坏');
  expect(() =>
    reopened.save(article.articleId, {
      mutationId: randomUUID(),
      baseRevisionId: saved.appliedRevisionId,
      document: article.document,
    }),
  ).toThrow('损坏');
  expect(
    reopened.revision(article.articleId, saved.appliedRevisionId).document
      .title,
  ).toBe('有效新稿');
});
