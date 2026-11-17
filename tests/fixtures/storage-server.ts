// Fault controls exist only in this isolated test entry point, never in production routes.
import { randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { ArticleService } from '@inkling/core';
import { SqliteArticles } from '@inkling/adapters';
import { createServer } from '../../apps/server/src/server';
import { seedStorage, openFixtureStorage } from './storage';
const { values } = parseArgs({ options: { workspace: { type: 'string' } } });
if (!values.workspace) throw new Error('Isolated workspace required');
const mode = process.env.TEST_STORAGE_MODE;
const seed = seedStorage(values.workspace),
  db = openFixtureStorage(seed.dir, mode === 'readonly');
if (mode === 'full')
  db.pragma(
    `max_page_count=${Number(db.pragma('page_count', { simple: true })) + 1}`,
  );
const service = new ArticleService(new SqliteArticles(db, seed.workspaceId));
if (mode === 'corrupt') {
  const first = service.save(seed.article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: seed.article.headRevisionId,
    document: { ...seed.article.document, title: '可以救援的旧稿' },
  });
  const second = service.save(seed.article.articleId, {
    mutationId: randomUUID(),
    baseRevisionId: first.appliedRevisionId,
    document: { ...seed.article.document, title: '损坏的当前稿' },
  });
  db.prepare('UPDATE article_revisions SET content_hash=? WHERE id=?').run(
    'bad',
    second.appliedRevisionId,
  );
}
const access = {
  origin: 'http://127.0.0.1:0',
  workspaceId: seed.workspaceId,
  workspaceInfo: () => service.workspace(),
  bootstrapToken: randomBytes(32).toString('hex'),
  localSecret: randomBytes(32).toString('hex'),
};
const app = createServer({
  webRoot: resolve('apps/web/dist'),
  access,
  articles: () => service,
});
app.addHook('onClose', async () => {
  db.close();
});
process.once('SIGTERM', () => {
  void app.close();
});
const address = await app.listen({
  host: '127.0.0.1',
  port: Number(process.env.PORT ?? 0),
});
access.origin = address;
console.log(
  `Inkling ready: ${address}\n打开工作台：${address}/#access=${access.bootstrapToken}`,
);
