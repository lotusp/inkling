import type Database from 'better-sqlite3';
import { ArticleDocument, Id } from '@inkling/contracts';

// Additive migration: preserve every existing article, revision and request record.
export function migrateLibrary(db: Database.Database) {
  if (db.pragma('user_version', { simple: true }) === 3) return;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE article_library(
        article_id TEXT PRIMARY KEY REFERENCES articles(id),
        title TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('active','archived','trashed')),
        previous_state TEXT,
        metadata_version INTEGER NOT NULL CHECK(metadata_version > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK((state = 'trashed' AND previous_state IS NOT NULL AND previous_state IN ('active','archived')) OR (state != 'trashed' AND previous_state IS NULL))
      ) STRICT;
      CREATE TABLE article_tags(
        article_id TEXT NOT NULL REFERENCES articles(id),
        tag TEXT NOT NULL,
        PRIMARY KEY(article_id,tag)
      ) STRICT;
      CREATE INDEX article_library_page ON article_library(state,created_at DESC,article_id DESC);
      CREATE INDEX article_tags_lookup ON article_tags(tag,article_id);
    `);
    const insert = db.prepare(
      "INSERT INTO article_library VALUES(?,?,'active',NULL,1,?,?)",
    );
    const read = db.prepare(
      'SELECT a.id,a.created_at,a.updated_at,r.document_json FROM articles a JOIN article_revisions r ON r.article_id=a.id AND r.id=a.head_revision_id WHERE a.id>? ORDER BY a.id LIMIT 1',
    );
    let cursor = '';
    // Complete each read before writing; native iterators keep the connection busy.
    while (true) {
      const value = read.get(cursor);
      if (value === undefined) break;
      if (
        !value ||
        typeof value !== 'object' ||
        !('id' in value) ||
        !('document_json' in value) ||
        typeof value.document_json !== 'string' ||
        !('created_at' in value) ||
        typeof value.created_at !== 'number' ||
        !('updated_at' in value) ||
        typeof value.updated_at !== 'number'
      )
        throw new Error('文章库迁移遇到无效记录，原数据已保留。');
      const document = ArticleDocument.parse(JSON.parse(value.document_json));
      cursor = Id.parse(value.id);
      insert.run(cursor, document.title, value.created_at, value.updated_at);
    }
    const foreignErrors = db.pragma('foreign_key_check');
    if (
      db.pragma('quick_check', { simple: true }) !== 'ok' ||
      !Array.isArray(foreignErrors) ||
      foreignErrors.length > 0
    )
      throw new Error('文章库迁移完整性检查失败，原数据已保留。');
    db.pragma('user_version=3');
  }).immediate();
}
