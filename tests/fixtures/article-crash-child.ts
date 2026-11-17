import { writeSync } from 'node:fs';
import { ArticleService } from '@inkling/core';
import { SqliteArticles } from '@inkling/adapters';
import { openFixtureStorage } from './storage';
const [dir, workspaceId, articleId, baseRevisionId, mutationId, stage] =
  process.argv.slice(2);
if (
  !dir ||
  !workspaceId ||
  !articleId ||
  !baseRevisionId ||
  !mutationId ||
  !stage
)
  throw new Error('Missing fixture arguments');
const db = openFixtureStorage(dir),
  service = new ArticleService(new SqliteArticles(db, workspaceId));
const stop = () => {
  writeSync(1, 'CHECKPOINT\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
};
if (stage !== 'committed') {
  db.function('checkpoint', stop);
  const sql =
    stage === 'revision'
      ? 'AFTER INSERT ON article_revisions'
      : stage === 'head'
        ? 'AFTER UPDATE ON articles'
        : 'AFTER INSERT ON mutations';
  db.exec(
    `CREATE TEMP TRIGGER crash_checkpoint ${sql} BEGIN SELECT checkpoint(); END`,
  );
}
const current = service.read(articleId);
service.save(articleId, {
  mutationId,
  baseRevisionId,
  document: { ...current.document, title: '事务中断验证' },
});
stop();
