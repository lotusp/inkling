import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { ArticleError, canonical, type ArticleRepository } from '@inkling/core';
import {
  ArticleDocument,
  RevisionInfo,
  RevisionDetail,
  NameRevisionResult,
  type RevisionQuery,
  type RevisionPage,
  type NameRevisionCommand,
  ArticleSnapshot,
  SaveResult,
  type SaveArticleCommand,
  type RestoreRevisionCommand,
  type WorkspaceInfo,
} from '@inkling/contracts';
const hash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ArticleError('NOT_FOUND', 404, '找不到文章或版本。');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown) {
  if (typeof value !== 'string')
    throw new ArticleError('STORAGE_CORRUPT', 500, '数据字段损坏。');
  return value;
}
function number(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new ArticleError('STORAGE_CORRUPT', 500, '数据字段损坏。');
  return value;
}
export function migrateArticles(db: Database.Database) {
  if (db.pragma('user_version', { simple: true }) === 2) return;
  db.transaction(() => {
    db.exec(`
 CREATE TABLE articles(id TEXT PRIMARY KEY,head_revision_id TEXT NOT NULL,head_seq INTEGER NOT NULL,revision_bytes INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,FOREIGN KEY(id,head_revision_id) REFERENCES article_revisions(article_id,id) DEFERRABLE INITIALLY DEFERRED) STRICT;
 CREATE TABLE article_revisions(id TEXT PRIMARY KEY,article_id TEXT NOT NULL REFERENCES articles(id) DEFERRABLE INITIALLY DEFERRED,seq INTEGER NOT NULL,parent_revision_id TEXT,kind TEXT NOT NULL,restored_from_revision_id TEXT,document_json TEXT NOT NULL,content_hash TEXT NOT NULL,byte_size INTEGER NOT NULL,created_at INTEGER NOT NULL,UNIQUE(article_id,seq),UNIQUE(article_id,id),FOREIGN KEY(article_id,parent_revision_id) REFERENCES article_revisions(article_id,id),FOREIGN KEY(article_id,restored_from_revision_id) REFERENCES article_revisions(article_id,id)) STRICT;
 CREATE TABLE revision_markers(article_id TEXT NOT NULL,revision_id TEXT PRIMARY KEY,automatic_at INTEGER,name TEXT,updated_at INTEGER NOT NULL,FOREIGN KEY(article_id,revision_id) REFERENCES article_revisions(article_id,id)) STRICT;
 CREATE TABLE mutations(id TEXT PRIMARY KEY,article_id TEXT NOT NULL REFERENCES articles(id),operation TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,result_revision_id TEXT NOT NULL,created_at INTEGER NOT NULL,FOREIGN KEY(article_id,result_revision_id) REFERENCES article_revisions(article_id,id)) STRICT;
 `);
    db.pragma('user_version=2');
  }).immediate();
}
export class SqliteArticles implements ArticleRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly workspaceId: string,
    private readonly now: () => number = Date.now,
  ) {}
  workspace(): WorkspaceInfo {
    const r = row(
      this.db
        .prepare('SELECT current_article_id FROM workspace WHERE singleton=1')
        .get(),
    );
    return {
      workspaceId: this.workspaceId,
      currentArticleId:
        r.current_article_id === null ? null : string(r.current_article_id),
    };
  }
  private replay(id: string, requestHash: string): unknown {
    const value = this.db
      .prepare('SELECT request_hash,result_json FROM mutations WHERE id=?')
      .get(id);
    if (!value) return undefined;
    const r = row(value);
    if (r.request_hash !== requestHash)
      throw new ArticleError(
        'IDEMPOTENCY_MISMATCH',
        409,
        '同一请求标识不能用于不同内容。',
      );
    return JSON.parse(string(r.result_json)) as unknown;
  }
  mutation(id: string): unknown {
    const value = this.db
      .prepare('SELECT result_json FROM mutations WHERE id=?')
      .get(id);
    if (!value)
      throw new ArticleError('NOT_FOUND', 404, '该请求尚无提交记录。');
    return JSON.parse(string(row(value).result_json)) as unknown;
  }
  private remember(
    id: string,
    articleId: string,
    operation: string,
    requestHash: string,
    result: unknown,
    revisionId: string,
  ) {
    this.db
      .prepare('INSERT INTO mutations VALUES(?,?,?,?,?,?,?)')
      .run(
        id,
        articleId,
        operation,
        requestHash,
        JSON.stringify(result),
        revisionId,
        this.now(),
      );
  }
  ensure(mutationId: string): ArticleSnapshot {
    return this.db
      .transaction(() => {
        const requestHash = hash({ operation: 'create' }),
          old = this.replay(mutationId, requestHash);
        if (old !== undefined) return ArticleSnapshot.parse(old);
        const current = this.workspace().currentArticleId;
        if (current) {
          const result = this.read(current);
          this.remember(
            mutationId,
            current,
            'create',
            requestHash,
            result,
            result.headRevisionId,
          );
          return result;
        }
        const articleId = randomUUID(),
          revisionId = randomUUID(),
          time = this.now();
        const document: ArticleDocument = {
          schemaVersion: 1,
          title: '',
          doc: { type: 'doc', content: [{ type: 'paragraph' }] },
        };
        const json = canonical(document),
          bytes = Buffer.byteLength(json),
          contentHash = hash(document);
        this.db
          .prepare('INSERT INTO articles VALUES(?,?,1,?,?,?)')
          .run(articleId, revisionId, bytes, time, time);
        this.db
          .prepare(
            "INSERT INTO article_revisions VALUES(?,?,1,NULL,'initial',NULL,?,?,?,?)",
          )
          .run(revisionId, articleId, json, contentHash, bytes, time);
        this.db
          .prepare('INSERT INTO revision_markers VALUES(?,?,?,NULL,?)')
          .run(articleId, revisionId, time, time);
        this.db
          .prepare(
            'UPDATE workspace SET current_article_id=? WHERE singleton=1',
          )
          .run(articleId);
        const result = this.read(articleId);
        this.remember(
          mutationId,
          articleId,
          'create',
          requestHash,
          result,
          revisionId,
        );
        return result;
      })
      .immediate();
  }
  read(articleId: string): ArticleSnapshot {
    const r = row(
      this.db
        .prepare(
          'SELECT a.id,a.head_revision_id,a.head_seq,a.revision_bytes,r.document_json,r.content_hash FROM articles a JOIN article_revisions r ON r.id=a.head_revision_id AND r.article_id=a.id WHERE a.id=?',
        )
        .get(articleId),
    );
    let document: ArticleDocument;
    try {
      document = ArticleDocument.parse(JSON.parse(string(r.document_json)));
    } catch (error) {
      throw new ArticleError(
        'STORAGE_CORRUPT',
        500,
        '正文格式损坏，已停止写入。',
        undefined,
        { cause: error },
      );
    }
    if (hash(document) !== r.content_hash)
      throw new ArticleError(
        'STORAGE_CORRUPT',
        500,
        '正文校验失败，请保留数据并恢复。',
      );
    return {
      articleId: string(r.id),
      headRevisionId: string(r.head_revision_id),
      headSeq: number(r.head_seq),
      revisionBytes: number(r.revision_bytes),
      contentHash: string(r.content_hash),
      document,
    };
  }

  private revisionInfo(value: unknown): RevisionInfo {
    const r = row(value);
    return RevisionInfo.parse({
      articleId: r.article_id,
      revisionId: r.id,
      seq: r.seq,
      parentRevisionId: r.parent_revision_id,
      kind: r.kind,
      restoredFromRevisionId: r.restored_from_revision_id,
      createdAt: r.created_at,
      automaticAt: r.automatic_at ?? null,
      name: r.name ?? null,
      current: r.id === r.head_revision_id,
    });
  }
  revisions(articleId: string, query: RevisionQuery): RevisionPage {
    this.read(articleId);
    const rows = this.db
      .prepare(
        `SELECT r.*,m.name,m.automatic_at,a.head_revision_id FROM article_revisions r JOIN articles a ON a.id=r.article_id LEFT JOIN revision_markers m ON m.revision_id=r.id WHERE r.article_id=? AND r.seq<? AND (? OR m.automatic_at IS NOT NULL OR m.name IS NOT NULL) ORDER BY r.seq DESC LIMIT ?`,
      )
      .all(
        articleId,
        query.beforeSeq ?? Number.MAX_SAFE_INTEGER,
        query.all ? 1 : 0,
        query.limit + 1,
      );
    const items = rows.slice(0, query.limit).map((r) => this.revisionInfo(r));
    return {
      items,
      nextBeforeSeq:
        rows.length > query.limit ? (items.at(-1)?.seq ?? null) : null,
    };
  }
  revision(articleId: string, revisionId: string): RevisionDetail {
    const r = row(
      this.db
        .prepare(
          'SELECT r.*,m.name,m.automatic_at,a.head_revision_id FROM article_revisions r JOIN articles a ON a.id=r.article_id LEFT JOIN revision_markers m ON m.revision_id=r.id WHERE r.article_id=? AND r.id=?',
        )
        .get(articleId, revisionId),
    );
    let document: ArticleDocument;
    try {
      document = ArticleDocument.parse(JSON.parse(string(r.document_json)));
    } catch {
      throw new ArticleError(
        'STORAGE_CORRUPT',
        500,
        '历史正文格式损坏，已停止读取。',
      );
    }
    if (hash(document) !== r.content_hash)
      throw new ArticleError('STORAGE_CORRUPT', 500, '历史正文校验失败。');
    return {
      ...this.revisionInfo(r),
      document,
      contentHash: string(r.content_hash),
    };
  }
  name(
    articleId: string,
    revisionId: string,
    command: NameRevisionCommand,
  ): NameRevisionResult {
    return this.db
      .transaction(() => {
        const requestHash = hash({
            operation: 'name',
            articleId,
            revisionId,
            ...command,
          }),
          old = this.replay(command.mutationId, requestHash);
        if (old !== undefined) return NameRevisionResult.parse(old);
        this.read(articleId);
        this.revision(articleId, revisionId);
        const updatedAt = this.now();
        this.db
          .prepare(
            'INSERT INTO revision_markers VALUES(?,?,NULL,?,?) ON CONFLICT(revision_id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at',
          )
          .run(articleId, revisionId, command.name, updatedAt);
        const result = {
          mutationId: command.mutationId,
          articleId,
          revisionId,
          name: command.name,
          updatedAt,
        };
        this.remember(
          command.mutationId,
          articleId,
          'name',
          requestHash,
          result,
          revisionId,
        );
        return result;
      })
      .immediate();
  }

  save(articleId: string, command: SaveArticleCommand): SaveResult {
    return this.commit(articleId, command);
  }
  restore(articleId: string, command: RestoreRevisionCommand): SaveResult {
    return this.commit(articleId, command);
  }
  private commit(
    articleId: string,
    command: SaveArticleCommand | RestoreRevisionCommand,
  ): SaveResult {
    const restoring = 'sourceRevisionId' in command;
    const operation = restoring ? 'restore' : 'save';
    return this.db
      .transaction(() => {
        const requestHash = hash({ operation, articleId, ...command }),
          old = this.replay(command.mutationId, requestHash);
        if (old !== undefined) return SaveResult.parse(old);
        const current = this.read(articleId);
        if (current.headRevisionId !== command.baseRevisionId)
          throw new ArticleError(
            'REVISION_CONFLICT',
            409,
            '稿件已有新版本，请先比较两份内容。',
            {
              currentRevisionId: current.headRevisionId,
              contentHash: current.contentHash,
            },
          );
        const document = restoring
          ? this.revision(articleId, command.sourceRevisionId).document
          : command.document;
        const contentHash = hash(document),
          changed = restoring || contentHash !== current.contentHash,
          time = this.now();
        const revisionId = changed ? randomUUID() : current.headRevisionId,
          seq = current.headSeq + (changed ? 1 : 0);
        if (changed) {
          const json = canonical(document),
            bytes = Buffer.byteLength(json);
          if (current.revisionBytes + bytes > 256 * 1024 * 1024)
            throw new ArticleError(
              'HISTORY_LIMIT',
              507,
              '历史容量已达上限，请先下载恢复稿。',
            );
          this.db
            .prepare(
              'INSERT INTO article_revisions VALUES(?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              revisionId,
              articleId,
              seq,
              current.headRevisionId,
              operation,
              restoring ? command.sourceRevisionId : null,
              json,
              contentHash,
              bytes,
              time,
            );
          this.db
            .prepare(
              'UPDATE articles SET head_revision_id=?,head_seq=?,revision_bytes=revision_bytes+?,updated_at=? WHERE id=? AND head_revision_id=?',
            )
            .run(
              revisionId,
              seq,
              bytes,
              time,
              articleId,
              current.headRevisionId,
            );
          const last = row(
            this.db
              .prepare(
                'SELECT COALESCE(MAX(automatic_at),0) t FROM revision_markers WHERE article_id=?',
              )
              .get(articleId),
          );
          if (restoring || seq === 2 || time - number(last.t) >= 5 * 60_000)
            this.db
              .prepare('INSERT INTO revision_markers VALUES(?,?,?,NULL,?)')
              .run(articleId, revisionId, time, time);
        }
        const result: SaveResult = {
          mutationId: command.mutationId,
          articleId,
          appliedRevisionId: revisionId,
          appliedSeq: seq,
          contentHash,
          committedAt: time,
          changed,
        };
        this.remember(
          command.mutationId,
          articleId,
          operation,
          requestHash,
          result,
          revisionId,
        );
        return result;
      })
      .immediate();
  }
}
