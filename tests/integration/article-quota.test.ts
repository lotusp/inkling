import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SqliteArticles } from '@inkling/adapters';
import { ArticleService, canonical } from '@inkling/core';
import { storageFixture } from '../fixtures/storage';
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
it('ARTICLE-QUOTA-013 warns at the exact threshold, rejects additional history and still allows naming, no-op and replay', () => {
  const f = storageFixture();
  cleanup.push(f.close);
  const { article, db } = f;
  const document = { ...article.document, title: '第一稿' },
    bytes = Buffer.byteLength(canonical(document));
  const policy = {
    warningBytes: article.revisionBytes + bytes,
    limitBytes: article.revisionBytes + 2 * bytes,
  };
  const service = new ArticleService(
    new SqliteArticles(db, f.workspaceId, Date.now, policy),
  );
  const command = {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document,
  };
  const first = service.save(article.articleId, command),
    snapshot = service.read(article.articleId);
  expect(snapshot).toMatchObject({
    revisionBytes: policy.warningBytes,
    historyWarningBytes: policy.warningBytes,
    historyLimitBytes: policy.limitBytes,
  });
  const second = service.save(article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: first.appliedRevisionId,
    document: { ...document, title: '第二稿' },
  });
  expect(service.read(article.articleId).revisionBytes).toBe(policy.limitBytes);
  const failed = {
    mutationId: randomUUID(),
    baseRevisionId: second.appliedRevisionId,
    document: { ...document, title: '第三稿' },
  };
  expect(() => service.save(article.articleId, failed)).toThrow('历史容量');
  expect(() =>
    service.restore(article.articleId, {
      mutationId: randomUUID(),
      baseRevisionId: second.appliedRevisionId,
      sourceRevisionId: first.appliedRevisionId,
    }),
  ).toThrow('历史容量');
  expect(() => service.mutation(failed.mutationId)).toThrow('尚无提交记录');
  expect(
    service.name(article.articleId, first.appliedRevisionId, {
      mutationId: randomUUID(),
      name: '保留版本',
    }).name,
  ).toBe('保留版本');
  expect(
    service.save(article.articleId, {
      mutationId: randomUUID(),
      baseRevisionId: second.appliedRevisionId,
      document: { ...document, title: '第二稿' },
    }).changed,
  ).toBe(false);
  expect(service.save(article.articleId, command)).toEqual(first);
  expect(
    service.revisions(article.articleId, { all: 'true' }).items,
  ).toHaveLength(3);
  expect(service.read(article.articleId).headRevisionId).toBe(
    second.appliedRevisionId,
  );
});
it('ARTICLE-QUOTA-013 production thresholds are 64 MiB and 256 MiB', () => {
  const f = storageFixture();
  cleanup.push(f.close);
  expect(f.service.read(f.article.articleId)).toMatchObject({
    historyWarningBytes: 64 * 1024 * 1024,
    historyLimitBytes: 256 * 1024 * 1024,
  });
});
