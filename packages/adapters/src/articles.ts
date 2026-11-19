import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import {
  ArticleError,
  transitionArticle,
  canonical,
  DEFAULT_HISTORY_POLICY,
  validateHistoryPolicy,
  checkHistoryCapacity,
  type HistoryPolicy,
  type ArticleRepository,
} from '@inkling/core';
import {
  ArticleDocument,
  ArticleState,
  type ArticleLifecycleCommand,
  ArticleLifecycleResult,
  ArticleListItem,
  type UpdateArticleMetadataCommand,
  UpdateArticleMetadataResult,
  type ArticleListQuery,
  type ArticleListPage,
  type CreateArticleCommand,
  type OpenArticleCommand,
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
  if (Number(db.pragma('user_version', { simple: true })) >= 2) return;
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
  private readonly damaged = new Set<string>();
  private readonly historyPolicy: Readonly<HistoryPolicy>;
  constructor(
    private readonly db: Database.Database,
    private readonly workspaceId: string,
    private readonly now: () => number = Date.now,
    historyPolicy: HistoryPolicy = DEFAULT_HISTORY_POLICY,
  ) {
    this.historyPolicy = validateHistoryPolicy(historyPolicy);
    // Validate existing history once at startup; quarantine is derived again on reopen.
    for (const value of this.db
      .prepare(
        'SELECT article_id,document_json,content_hash FROM article_revisions',
      )
      .iterate()) {
      const r = row(value),
        id = string(r.article_id);
      try {
        this.checkedDocument(id, r.document_json, r.content_hash);
      } catch (error) {
        if (!(
          error instanceof ArticleError && error.code === 'STORAGE_CORRUPT'
        ))
          throw error;
      }
    }
  }
  private assertHealthy(articleId: string) {
    if (this.damaged.has(articleId))
      throw new ArticleError(
        'STORAGE_CORRUPT',
        500,
        '文章历史存在损坏，已停止写入；请下载经校验的旧版本。',
      );
  }
  private checkedDocument(
    articleId: string,
    json: unknown,
    expectedHash: unknown,
  ): ArticleDocument {
    let document: ArticleDocument;
    try {
      document = ArticleDocument.parse(JSON.parse(string(json)));
    } catch {
      this.damaged.add(articleId);
      throw new ArticleError(
        'STORAGE_CORRUPT',
        500,
        '正文格式损坏，已停止写入。',
      );
    }
    if (hash(document) !== expectedHash) {
      this.damaged.add(articleId);
      throw new ArticleError(
        'STORAGE_CORRUPT',
        500,
        '正文校验失败，已停止写入。',
      );
    }
    return document;
  }
  private recentActive(): string | null {
    const value = this.db
      .prepare(
        "SELECT article_id FROM article_library WHERE state='active' ORDER BY updated_at DESC,created_at DESC,article_id DESC LIMIT 1",
      )
      .get();
    return value ? string(row(value).article_id) : null;
  }
  workspace(): WorkspaceInfo {
    const current = this.db
      .prepare(
        "SELECT l.article_id FROM workspace w JOIN article_library l ON l.article_id=w.current_article_id WHERE w.singleton=1 AND l.state!='trashed'",
      )
      .get();
    return {
      workspaceId: this.workspaceId,
      currentArticleId: current
        ? string(row(current).article_id)
        : this.recentActive(),
    };
  }
  private state(articleId: string) {
    const value = row(
      this.db
        .prepare(
          'SELECT state,previous_state FROM article_library WHERE article_id=?',
        )
        .get(articleId),
    );
    return {
      state: ArticleState.parse(value.state),
      previousState: ArticleState.nullable().parse(value.previous_state),
    };
  }
  private assertActive(articleId: string) {
    if (this.state(articleId).state !== 'active')
      throw new ArticleError(
        'ARTICLE_NOT_ACTIVE',
        409,
        '文章当前不可编辑，请保留本地输入并刷新文章库。',
      );
  }
  private assertReadable(articleId: string) {
    if (this.state(articleId).state === 'trashed')
      throw new ArticleError(
        'ARTICLE_TRASHED',
        409,
        '文章已在回收站中，请先恢复后再查看正文与历史。',
      );
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
        const selected = this.workspace().currentArticleId;
        const current =
          selected && this.state(selected).state === 'active'
            ? selected
            : this.recentActive();
        if (current) {
          const result = this.read(current);
          this.db
            .prepare(
              'UPDATE workspace SET current_article_id=? WHERE singleton=1',
            )
            .run(current);
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
        const result = this.insertArticle('');
        this.remember(
          mutationId,
          result.articleId,
          'create',
          requestHash,
          result,
          result.headRevisionId,
        );
        return result;
      })
      .immediate();
  }
  private insertArticle(title: string): ArticleSnapshot {
    const articleId = randomUUID(),
      revisionId = randomUUID(),
      time = this.now();
    const document: ArticleDocument = {
      schemaVersion: 1,
      title,
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
      .prepare("INSERT INTO article_library VALUES(?,?,'active',NULL,1,?,?)")
      .run(articleId, title, time, time);
    this.db
      .prepare('UPDATE workspace SET current_article_id=? WHERE singleton=1')
      .run(articleId);
    return this.read(articleId);
  }
  create(command: CreateArticleCommand): ArticleSnapshot {
    return this.db
      .transaction(() => {
        const requestHash = hash({ operation: 'create-article', ...command });
        const old = this.replay(command.mutationId, requestHash);
        if (old !== undefined) return ArticleSnapshot.parse(old);
        const result = this.insertArticle(command.title);
        this.remember(
          command.mutationId,
          result.articleId,
          'create-article',
          requestHash,
          result,
          result.headRevisionId,
        );
        return result;
      })
      .immediate();
  }
  open(articleId: string, command: OpenArticleCommand): ArticleSnapshot {
    return this.db
      .transaction(() => {
        const requestHash = hash({ operation: 'open', articleId, ...command });
        const old = this.replay(command.mutationId, requestHash);
        if (old !== undefined) return ArticleSnapshot.parse(old);
        const result = this.read(articleId);
        this.db
          .prepare(
            'UPDATE workspace SET current_article_id=? WHERE singleton=1',
          )
          .run(articleId);
        this.remember(
          command.mutationId,
          articleId,
          'open',
          requestHash,
          result,
          result.headRevisionId,
        );
        return result;
      })
      .immediate();
  }
  list(query: ArticleListQuery): ArticleListPage {
    const shelf =
      query.state === 'all' ? "state IN ('active','archived')" : 'state = ?';
    const filters = [shelf];
    const args: string[] = query.state === 'all' ? [] : [query.state];
    if (query.q) {
      filters.push('instr(lower(title),lower(?)) > 0');
      args.push(query.q);
    }
    if (query.tag) {
      filters.push(
        'EXISTS(SELECT 1 FROM article_tags t WHERE t.article_id=article_library.article_id AND t.tag=?)',
      );
      args.push(query.tag);
    }
    if (query.term) {
      filters.push(
        "(instr(lower(CASE WHEN title='' THEN '未命名文章' ELSE title END),lower(?)) > 0 OR EXISTS(SELECT 1 FROM article_tags t WHERE t.article_id=article_library.article_id AND instr(lower(t.tag),lower(?)) > 0))",
      );
      args.push(query.term, query.term);
    }
    const from = ' FROM article_library WHERE ' + filters.join(' AND ');
    const total = Number(
      row(this.db.prepare('SELECT count(*) AS total' + from).get(...args))
        .total,
    );
    const values = this.db
      .prepare(
        'SELECT article_id,title,state,metadata_version,created_at,updated_at,(SELECT json_group_array(tag) FROM article_tags WHERE article_tags.article_id=article_library.article_id) tags_json' +
          from +
          ' AND (? IS NULL OR created_at < ? OR (created_at = ? AND article_id < ?)) ORDER BY created_at DESC,article_id DESC LIMIT ?',
      )
      .all(
        ...args,
        query.beforeCreatedAt ?? null,
        query.beforeCreatedAt ?? null,
        query.beforeCreatedAt ?? null,
        query.beforeId ?? null,
        query.limit + 1,
      );
    const items = values
      .slice(0, query.limit)
      .map((value) => this.libraryItem(value));
    const last = items.at(-1);
    return {
      items,
      total,
      nextCursor:
        values.length > query.limit && last
          ? { createdAt: last.createdAt, articleId: last.articleId }
          : null,
    };
  }
  private libraryItem(value: unknown): ArticleListItem {
    const r = row(value);
    return ArticleListItem.parse({
      articleId: r.article_id,
      title: r.title,
      state: r.state,
      metadataVersion: r.metadata_version,
      tags: JSON.parse(string(r.tags_json)),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  metadata(articleId: string): ArticleListItem {
    return this.libraryItem(
      this.db
        .prepare(
          'SELECT article_id,title,state,metadata_version,created_at,updated_at,(SELECT json_group_array(tag) FROM article_tags WHERE article_tags.article_id=article_library.article_id) tags_json FROM article_library WHERE article_id=?',
        )
        .get(articleId),
    );
  }
  updateMetadata(
    articleId: string,
    command: UpdateArticleMetadataCommand,
  ): UpdateArticleMetadataResult {
    return this.db
      .transaction(() => {
        const requestHash = hash({
          operation: 'metadata',
          articleId,
          ...command,
        });
        const old = this.replay(command.mutationId, requestHash);
        if (old !== undefined) return UpdateArticleMetadataResult.parse(old);
        const current = this.metadata(articleId);
        if (current.state !== 'active')
          throw new ArticleError(
            'ARTICLE_NOT_ACTIVE',
            409,
            '文章当前不可编辑，请刷新文章库。',
          );
        if (current.metadataVersion !== command.baseMetadataVersion)
          throw new ArticleError(
            'METADATA_CONFLICT',
            409,
            '标签已被更新，请查看最新标签后重新编辑。',
          );
        if (JSON.stringify(current.tags) !== JSON.stringify(command.tags)) {
          this.db
            .prepare('DELETE FROM article_tags WHERE article_id=?')
            .run(articleId);
          const insert = this.db.prepare(
            'INSERT INTO article_tags VALUES(?,?)',
          );
          for (const tag of command.tags) insert.run(articleId, tag);
          this.db
            .prepare(
              'UPDATE article_library SET metadata_version=metadata_version+1,updated_at=? WHERE article_id=?',
            )
            .run(this.now(), articleId);
        }
        const result = {
          mutationId: command.mutationId,
          metadata: this.metadata(articleId),
        };
        const revision = row(
          this.db
            .prepare('SELECT head_revision_id FROM articles WHERE id=?')
            .get(articleId),
        );
        this.remember(
          command.mutationId,
          articleId,
          'metadata',
          requestHash,
          result,
          string(revision.head_revision_id),
        );
        return result;
      })
      .immediate();
  }
  lifecycle(
    articleId: string,
    command: ArticleLifecycleCommand,
  ): ArticleLifecycleResult {
    return this.db
      .transaction(() => {
        const requestHash = hash({
          operation: 'lifecycle',
          articleId,
          ...command,
        });
        const old = this.replay(command.mutationId, requestHash);
        if (old !== undefined) return ArticleLifecycleResult.parse(old);
        const current = this.metadata(articleId);
        if (current.metadataVersion !== command.baseMetadataVersion)
          throw new ArticleError(
            'METADATA_CONFLICT',
            409,
            '文章状态或标签已被更新，请查看最新信息后重新确认。',
          );
        const next = transitionArticle(
          current.state,
          this.state(articleId).previousState,
          command.action,
        );
        this.db
          .prepare(
            'UPDATE article_library SET state=?,previous_state=?,metadata_version=metadata_version+1,updated_at=? WHERE article_id=?',
          )
          .run(next.state, next.previousState, this.now(), articleId);
        if (next.state !== 'active')
          this.db
            .prepare(
              'UPDATE workspace SET current_article_id=NULL WHERE singleton=1 AND current_article_id=?',
            )
            .run(articleId);
        const result = {
          mutationId: command.mutationId,
          metadata: this.metadata(articleId),
        };
        const revision = row(
          this.db
            .prepare('SELECT head_revision_id FROM articles WHERE id=?')
            .get(articleId),
        );
        this.remember(
          command.mutationId,
          articleId,
          'lifecycle',
          requestHash,
          result,
          string(revision.head_revision_id),
        );
        return result;
      })
      .immediate();
  }
  read(articleId: string): ArticleSnapshot {
    this.assertReadable(articleId);
    this.assertHealthy(articleId);
    const r = row(
      this.db
        .prepare(
          'SELECT a.id,a.head_revision_id,a.head_seq,a.revision_bytes,r.document_json,r.content_hash FROM articles a JOIN article_revisions r ON r.id=a.head_revision_id AND r.article_id=a.id WHERE a.id=?',
        )
        .get(articleId),
    );
    const document = this.checkedDocument(
      articleId,
      r.document_json,
      r.content_hash,
    );
    return {
      articleId: string(r.id),
      headRevisionId: string(r.head_revision_id),
      headSeq: number(r.head_seq),
      revisionBytes: number(r.revision_bytes),
      historyWarningBytes: this.historyPolicy.warningBytes,
      historyLimitBytes: this.historyPolicy.limitBytes,
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
    this.assertReadable(articleId);
    const rows = this.db
      .prepare(
        `SELECT r.id,r.article_id,r.seq,r.parent_revision_id,r.kind,r.restored_from_revision_id,r.created_at,m.name,m.automatic_at,a.head_revision_id FROM article_revisions r JOIN articles a ON a.id=r.article_id LEFT JOIN revision_markers m ON m.revision_id=r.id WHERE r.article_id=? AND r.seq<? AND (? OR m.automatic_at IS NOT NULL OR m.name IS NOT NULL) ORDER BY r.seq DESC LIMIT ?`,
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
    this.assertReadable(articleId);
    const r = row(
      this.db
        .prepare(
          'SELECT r.*,m.name,m.automatic_at,a.head_revision_id FROM article_revisions r JOIN articles a ON a.id=r.article_id LEFT JOIN revision_markers m ON m.revision_id=r.id WHERE r.article_id=? AND r.id=?',
        )
        .get(articleId, revisionId),
    );
    const document = this.checkedDocument(
      articleId,
      r.document_json,
      r.content_hash,
    );
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
        this.assertActive(articleId);
        this.read(articleId);
        const revision = this.revision(articleId, revisionId);
        const retainedName =
          revision.kind === 'initial'
            ? '初稿'
            : revision.kind === 'restore'
              ? '恢复的稿件'
              : command.name;
        const name = command.keepExistingName
          ? (revision.name ?? retainedName)
          : command.name;
        const updatedAt = this.now();
        this.db
          .prepare(
            'INSERT INTO revision_markers VALUES(?,?,NULL,?,?) ON CONFLICT(revision_id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at',
          )
          .run(articleId, revisionId, name, updatedAt);
        const result = {
          mutationId: command.mutationId,
          articleId,
          revisionId,
          name,
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
        this.assertActive(articleId);
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
        let document = restoring
          ? this.revision(articleId, command.sourceRevisionId).document
          : command.document;
        if (document.schemaVersion < current.document.schemaVersion) {
          if (!restoring)
            throw new ArticleError(
              'DOCUMENT_VERSION',
              422,
              '请使用当前正文格式保存稿件。',
            );
          document = {
            ...document,
            schemaVersion: current.document.schemaVersion,
          };
        }
        const contentHash = hash(document),
          changed = restoring || contentHash !== current.contentHash,
          time = this.now();
        const revisionId = changed ? randomUUID() : current.headRevisionId,
          seq = current.headSeq + (changed ? 1 : 0);
        if (changed) {
          const json = canonical(document),
            bytes = Buffer.byteLength(json);
          checkHistoryCapacity(
            current.revisionBytes,
            bytes,
            this.historyPolicy,
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
          this.db
            .prepare(
              'UPDATE article_library SET title=?,updated_at=? WHERE article_id=?',
            )
            .run(document.title, time, articleId);
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
