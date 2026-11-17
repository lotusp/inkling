import { afterEach, expect, it } from 'vitest';
import { SqliteWorkspace } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const dirs: string[] = [];
const stores: SqliteWorkspace[] = [];
function open(dir = mkdtempSync(join(tmpdir(), 'inkling-article-test-'))) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const store = SqliteWorkspace.open(dir);
  stores.push(store);
  return { store, service: new ArticleService(store.articles()), dir };
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it('ARTICLE-CREATE-001 creates one initial article for repeated clients', () => {
  const { service } = open();
  const first = service.ensure({ mutationId: randomUUID() });
  const second = service.ensure({ mutationId: randomUUID() });
  expect(second.articleId).toBe(first.articleId);
  expect(second.headSeq).toBe(1);
});
it('ARTICLE-SAVE-002 saves structured Chinese content and reopens the service', () => {
  const { service, store, dir } = open();
  const first = service.ensure({ mutationId: randomUUID() });
  const document = {
    schemaVersion: 1 as const,
    title: '个人洞见',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '技术判断' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '依据与条件 👩‍💻', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    },
  };
  const saved = service.save(first.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: first.headRevisionId,
    document,
  });
  expect(saved.appliedSeq).toBe(2);
  store.close();
  stores.splice(stores.indexOf(store), 1);
  const reopened = open(dir).service.read(first.articleId);
  expect(reopened.document).toEqual(document);
  expect(reopened.headRevisionId).toBe(saved.appliedRevisionId);
});
it('ARTICLE-SCHEMA-011 rejects unknown nodes and unsafe links without changing head', () => {
  const { service } = open();
  const first = service.ensure({ mutationId: randomUUID() });
  const badLink = {
    type: 'text',
    text: 'link',
    marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
  };
  for (const doc of [
    { type: 'doc', content: [{ type: 'future' }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [badLink] }] },
  ]) {
    expect(() =>
      service.save(first.articleId, {
        mutationId: randomUUID(),
        baseRevisionId: first.headRevisionId,
        document: { ...first.document, doc },
      }),
    ).toThrow();
    expect(service.read(first.articleId).headRevisionId).toBe(
      first.headRevisionId,
    );
  }
});
it('ARTICLE-RETRY-003 returns original mutation result even after head advances', () => {
  const { service } = open();
  const first = service.ensure({ mutationId: randomUUID() });
  const command = {
    mutationId: randomUUID(),
    baseRevisionId: first.headRevisionId,
    document: { ...first.document, title: 'first' },
  };
  const original = service.save(first.articleId, command);
  const later = service.save(first.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: original.appliedRevisionId,
    document: { ...first.document, title: 'later' },
  });
  expect(service.save(first.articleId, command)).toEqual(original);
  expect(service.mutation(command.mutationId)).toEqual(original);
  expect(service.read(first.articleId).headRevisionId).toBe(
    later.appliedRevisionId,
  );
});
it('ARTICLE-KEY-004 rejects key reuse and ARTICLE-CONFLICT-006 rejects stale writes', () => {
  const { service } = open();
  const first = service.ensure({ mutationId: randomUUID() });
  const command = {
    mutationId: randomUUID(),
    baseRevisionId: first.headRevisionId,
    document: { ...first.document, title: 'first' },
  };
  const result = service.save(first.articleId, command);
  expect(() =>
    service.save(first.articleId, {
      ...command,
      document: { ...first.document, title: 'different' },
    }),
  ).toThrow('同一请求标识');
  expect(() =>
    service.save(first.articleId, { ...command, mutationId: randomUUID() }),
  ).toThrow('新版本');
  expect(service.read(first.articleId).headRevisionId).toBe(
    result.appliedRevisionId,
  );
});
it('ARTICLE-RETRY-003 records a no-op without creating another content revision', () => {
  const { service } = open();
  const first = service.ensure({ mutationId: randomUUID() });
  const command = {
    mutationId: randomUUID(),
    baseRevisionId: first.headRevisionId,
    document: first.document,
  };
  const result = service.save(first.articleId, command);
  expect(result.changed).toBe(false);
  expect(result.appliedSeq).toBe(1);
  expect(service.mutation(command.mutationId)).toEqual(result);
});
