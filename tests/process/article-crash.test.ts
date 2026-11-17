import { afterEach, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SqliteWorkspace } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import { seedStorage } from '../fixtures/storage';
const children: ChildProcess[] = [],
  dirs: string[] = [];
afterEach(async () => {
  for (const c of children.splice(0))
    if (c.exitCode === null && c.signalCode === null) {
      const done = once(c, 'exit');
      c.kill('SIGKILL');
      await done;
    }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
it.each(['revision', 'head', 'mutation', 'committed'])(
  'ARTICLE-CRASH-010 SIGKILL after %s preserves a complete old or new transaction',
  async (stage) => {
    const { dir, workspaceId, article } = seedStorage();
    dirs.push(dir);
    const mutationId = randomUUID();
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        'tests/fixtures/article-crash-child.ts',
        dir,
        workspaceId,
        article.articleId,
        article.headRevisionId,
        mutationId,
        stage,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      let output = '',
        error = '';
      const timeout = setTimeout(
        () => reject(new Error('checkpoint timeout: ' + error)),
        5000,
      );
      child.stderr?.on('data', (b: Buffer) => {
        error += b.toString();
      });
      child.stdout?.on('data', (b: Buffer) => {
        output += b.toString();
        if (output.includes('CHECKPOINT')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once('exit', () => {
        clearTimeout(timeout);
        reject(new Error('exited before checkpoint: ' + error));
      });
    });
    const killed = once(child, 'exit');
    child.kill('SIGKILL');
    await killed;
    const reopened = SqliteWorkspace.open(dir);
    try {
      const service = new ArticleService(reopened.articles()),
        head = service.read(article.articleId),
        committed = stage === 'committed';
      expect(head.headSeq).toBe(committed ? 2 : 1);
      expect(
        service.revisions(article.articleId, { all: 'true' }).items,
      ).toHaveLength(committed ? 2 : 1);
      if (committed)
        expect(service.mutation(mutationId)).toMatchObject({
          appliedRevisionId: head.headRevisionId,
        });
      else expect(() => service.mutation(mutationId)).toThrow('尚无提交记录');
      const result = service.save(article.articleId, {
        mutationId,
        baseRevisionId: article.headRevisionId,
        document: { ...article.document, title: '事务中断验证' },
      });
      expect(result.appliedSeq).toBe(2);
      expect(service.read(article.articleId).headSeq).toBe(2);
      expect(
        service.revision(article.articleId, result.appliedRevisionId)
          .parentRevisionId,
      ).toBe(article.headRevisionId);
    } finally {
      reopened.close();
    }
  },
);
