import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { SqliteWorkspace } from '@inkling/adapters';
import { ArticleService, canonical } from '@inkling/core';
import { Database } from '../fixtures/storage';
const dirs: string[] = [];
function legacy() {
  const dir = mkdtempSync(join(tmpdir(), 'inkling-library-v2-'));
  dirs.push(dir);
  const path = join(dir, 'inkling.sqlite');
  const db = new Database(path);
  db.exec(
    readFileSync(
      new URL('../fixtures/workspace-v2.sql', import.meta.url),
      'utf8',
    ),
  );
  const workspaceId = randomUUID(),
    articleId = randomUUID(),
    first = randomUUID(),
    second = randomUUID(),
    mutationId = randomUUID();
  const document = {
    schemaVersion: 1,
    title: '已有技术复盘',
    doc: { type: 'doc', content: [{ type: 'paragraph' }] },
  };
  const hash = (value: unknown) =>
    createHash('sha256').update(canonical(value)).digest('hex');
  const json = canonical(document),
    contentHash = hash(document),
    bytes = Buffer.byteLength(json);
  const command = { mutationId, baseRevisionId: first, document };
  const result = {
    mutationId,
    articleId,
    appliedRevisionId: second,
    appliedSeq: 2,
    contentHash,
    committedAt: 200,
    changed: true,
  };
  db.transaction(() => {
    db.prepare('INSERT INTO workspace VALUES(1,?,?,100)').run(
      workspaceId,
      articleId,
    );
    db.prepare('INSERT INTO articles VALUES(?,?,2,?,100,200)').run(
      articleId,
      second,
      bytes * 2,
    );
    db.prepare(
      "INSERT INTO article_revisions VALUES(?,?,1,NULL,'initial',NULL,?,?,?,100)",
    ).run(first, articleId, json, contentHash, bytes);
    db.prepare(
      "INSERT INTO article_revisions VALUES(?,?,2,?,'save',NULL,?,?,?,200)",
    ).run(second, articleId, first, json, contentHash, bytes);
    db.prepare(
      "INSERT INTO revision_markers VALUES(?,?,100,'重要版本',100)",
    ).run(articleId, first);
    db.prepare("INSERT INTO mutations VALUES(?,?,'save',?,?,?,200)").run(
      mutationId,
      articleId,
      hash({ operation: 'save', articleId, ...command }),
      JSON.stringify(result),
      second,
    );
  })();
  const before = legacyRows(db);
  db.close();
  return {
    dir,
    path,
    articleId,
    workspaceId,
    command,
    result,
    document,
    before,
  };
}
function legacyRows(db: InstanceType<typeof Database>) {
  return Object.fromEntries(
    [
      'workspace',
      'articles',
      'article_revisions',
      'revision_markers',
      'mutations',
    ].map((name) => [name, db.prepare('SELECT * FROM ' + name).all()]),
  );
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it('LIBRARY-MIGRATE-001 upgrades a real schema 2 workspace without changing its history or replay', () => {
  const f = legacy();
  const workspace = SqliteWorkspace.open(f.dir);
  try {
    const service = new ArticleService(workspace.articles());
    expect(workspace.id).toBe(f.workspaceId);
    expect(service.read(f.articleId).document).toEqual(f.document);
    expect(service.save(f.articleId, f.command)).toEqual(f.result);
  } finally {
    workspace.close();
  }
  const db = new Database(f.path);
  try {
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(legacyRows(db)).toEqual(f.before);
    expect(db.prepare('SELECT * FROM article_library').all()).toEqual([
      {
        article_id: f.articleId,
        title: '已有技术复盘',
        state: 'active',
        previous_state: null,
        metadata_version: 1,
        created_at: 100,
        updated_at: 200,
      },
    ]);
    expect(db.prepare('SELECT * FROM article_tags').all()).toEqual([]);
  } finally {
    db.close();
  }
  const reopened = SqliteWorkspace.open(f.dir);
  try {
    expect(
      new ArticleService(reopened.articles()).read(f.articleId).headSeq,
    ).toBe(2);
  } finally {
    reopened.close();
  }
});
it('LIBRARY-MIGRATE-001 a migration DDL failure rolls back new tables and preserves schema 2', () => {
  const f = legacy(),
    collision = new Database(f.path);
  collision.exec('CREATE TABLE article_tags(unrelated TEXT)');
  collision.close();
  let opened: SqliteWorkspace | undefined;
  try {
    expect(() => {
      opened = SqliteWorkspace.open(f.dir);
    }).toThrow();
  } finally {
    opened?.close();
  }
  const db = new Database(f.path);
  try {
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(legacyRows(db)).toEqual(f.before);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='article_library'")
        .get(),
    ).toBeUndefined();
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='article_tags'")
        .get(),
    ).toEqual({ name: 'article_tags' });
  } finally {
    db.close();
  }
});
it('LIBRARY-MIGRATE-001 inconsistent old references cannot leave a half-upgraded workspace', () => {
  const f = legacy(),
    broken = new Database(f.path);
  broken.pragma('foreign_keys=OFF');
  broken.prepare('UPDATE articles SET head_revision_id=?').run(randomUUID());
  const before = legacyRows(broken);
  broken.close();
  expect(() => SqliteWorkspace.open(f.dir)).toThrow();
  const db = new Database(f.path);
  try {
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(legacyRows(db)).toEqual(before);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='article_library'")
        .get(),
    ).toBeUndefined();
  } finally {
    db.close();
  }
});
