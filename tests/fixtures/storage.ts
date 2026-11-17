import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SqliteWorkspace, SqliteArticles } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
const require = createRequire(
  new URL('../../apps/server/package.json', import.meta.url),
);
export const Database: typeof import('better-sqlite3') = require('better-sqlite3');
export function seedStorage(
  dir = mkdtempSync(join(tmpdir(), 'inkling-storage-')),
) {
  const workspace = SqliteWorkspace.open(dir);
  const article = new ArticleService(workspace.articles()).ensure({
    mutationId: randomUUID(),
  });
  const workspaceId = workspace.id;
  workspace.close();
  return { dir, article, workspaceId };
}
export function openFixtureStorage(dir: string, readonly = false) {
  const db = new Database(join(dir, 'inkling.sqlite'), { readonly });
  if (!readonly) {
    db.pragma('locking_mode=EXCLUSIVE');
    db.pragma('journal_mode=WAL');
    db.pragma('synchronous=FULL');
    db.pragma('fullfsync=ON');
    db.pragma('foreign_keys=ON');
  }
  return db;
}
export function storageFixture(readonly = false) {
  const seed = seedStorage(),
    db = openFixtureStorage(seed.dir, readonly);
  const service = new ArticleService(new SqliteArticles(db, seed.workspaceId));
  return {
    ...seed,
    db,
    service,
    close: () => {
      db.close();
      rmSync(seed.dir, { recursive: true, force: true });
    },
  };
}
