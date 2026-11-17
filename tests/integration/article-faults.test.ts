import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { storageFixture } from '../fixtures/storage';
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
function fixture(readonly = false) {
  const value = storageFixture(readonly);
  cleanup.push(value.close);
  return value;
}
it('ARTICLE-WRITE-009 real read-only SQLite refuses writes and preserves original history', () => {
  const { service, article } = fixture(true);
  const command = {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: { ...article.document, title: '不能写入' },
  };
  expect(() => service.save(article.articleId, command)).toThrow(/readonly/i);
  expect(service.read(article.articleId)).toEqual(article);
  expect(
    service.revisions(article.articleId, { all: 'true' }).items,
  ).toHaveLength(1);
  expect(() => service.mutation(command.mutationId)).toThrow('尚无提交记录');
});
it('ARTICLE-WRITE-009 real SQLite page exhaustion rolls back and the identical request succeeds after capacity is restored', () => {
  const { db, service, article } = fixture();
  db.pragma(
    `max_page_count=${Number(db.pragma('page_count', { simple: true })) + 1}`,
  );
  const command = {
    mutationId: randomUUID(),
    baseRevisionId: article.headRevisionId,
    document: {
      ...article.document,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '存储边界'.repeat(20000) }],
          },
        ],
      },
    },
  };
  expect(() => service.save(article.articleId, command)).toThrow(/full/i);
  expect(service.read(article.articleId)).toEqual(article);
  expect(
    service.revisions(article.articleId, { all: 'true' }).items,
  ).toHaveLength(1);
  expect(() => service.mutation(command.mutationId)).toThrow('尚无提交记录');
  db.pragma('max_page_count=100000');
  const saved = service.save(article.articleId, command);
  expect(saved.appliedSeq).toBe(2);
  expect(service.save(article.articleId, command)).toEqual(saved);
  expect(service.read(article.articleId).document).toEqual(command.document);
});
it.each(['revision', 'head', 'mutation'])(
  'ARTICLE-WRITE-009 an injected failure after %s rolls back every table',
  (stage) => {
    const { db, service, article } = fixture();
    db.function('fail_write', () => {
      throw new Error('Injected I/O failure');
    });
    const sql =
      stage === 'revision'
        ? 'AFTER INSERT ON article_revisions'
        : stage === 'head'
          ? 'AFTER UPDATE ON articles'
          : 'AFTER INSERT ON mutations';
    db.exec(
      `CREATE TEMP TRIGGER inject_failure ${sql} BEGIN SELECT fail_write(); END`,
    );
    const command = {
      mutationId: randomUUID(),
      baseRevisionId: article.headRevisionId,
      document: { ...article.document, title: '原子提交' },
    };
    expect(() => service.save(article.articleId, command)).toThrow(
      'Injected I/O failure',
    );
    expect(service.read(article.articleId)).toEqual(article);
    expect(
      service.revisions(article.articleId, { all: 'true' }).items,
    ).toHaveLength(1);
    expect(() => service.mutation(command.mutationId)).toThrow('尚无提交记录');
    db.exec('DROP TRIGGER inject_failure');
    expect(service.save(article.articleId, command).appliedSeq).toBe(2);
  },
);
