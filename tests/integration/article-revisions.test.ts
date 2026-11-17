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
