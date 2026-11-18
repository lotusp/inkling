import { useEffect, useRef, useState } from 'react';
import {
  NameRevisionResult,
  RevisionDetail,
  type ArticleSnapshot,
  type ArticleDocument,
  type NameRevisionCommand,
  type RevisionInfo,
} from '@inkling/contracts';
import { api, ApiError } from './api';
import {
  useRevisionIndex,
  versionName,
  versionDate,
  matchingVersions,
  versionId,
} from './use-revision-index';
import { DeskMenu } from './DeskMenu';
import { Ellipsis } from 'lucide-react';
import { DeskDialog } from './DeskDialog';
import { RevisionComparison } from './RevisionComparison';
import type { RestoreReview } from './use-article';
export function VersionPanel({
  article,
  visit,
  visible,
  currentDocument,
  readOnly,
  flush,
  reviewRestore,
  confirmRestore,
}: {
  article: ArticleSnapshot;
  readOnly: boolean;
  visible: boolean;
  visit: number;
  currentDocument: () => ArticleDocument | null;
  flush: () => Promise<{ revisionId: string; seq: number }>;
  reviewRestore: (source: string) => Promise<RestoreReview>;
  confirmRestore: (review: RestoreReview) => Promise<unknown>;
}) {
  const [query, setQuery] = useState('');
  const [showBackups, setShowBackups] = useState(false);
  const [limit, setLimit] = useState(20);
  const [rename, setRename] = useState<RevisionInfo | null>(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false);
  const [pair, setPair] = useState<{
    from: RevisionDetail;
    to: RevisionDetail | null;
  } | null>(null);
  const readGeneration = useRef(0);
  const namingComposing = useRef(false);
  useEffect(
    () => () => {
      readGeneration.current++;
    },
    [visible, visit],
  );
  const [pending, setPending] = useState<{
    revisionId: string;
    seq: number;
    command: NameRevisionCommand;
  } | null>(null);
  const [review, setReview] = useState<RestoreReview | null>(null);
  const [lastVisit, setLastVisit] = useState(visit);
  if (visit !== lastVisit) {
    setLastVisit(visit);
    setQuery('');
    setPair(null);
    setReview(null);
    if (!pending) setRename(null);
    setShowBackups(false);
    setLimit(20);
  }
  const action = useRef(false);
  const detailPane = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pair) detailPane.current?.scrollIntoView({ block: 'nearest' });
  }, [pair]);
  const writeBlocked = useRef(readOnly);
  writeBlocked.current = readOnly;
  const path = '/api/articles/' + article.articleId;
  const { items, listError, load } = useRevisionIndex(
    path,
    visible,
    article.headRevisionId,
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(timer);
  }, [notice]);
  const run = async (fn: () => Promise<void>) => {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未确认，请重试。');
    } finally {
      action.current = false;
      setBusy(false);
    }
  };
  const submit = async (target: {
    revisionId: string;
    seq: number;
    command: NameRevisionCommand;
  }) => {
    if (writeBlocked.current) throw new Error('文章当前只读，不能命名版本。');
    setPending(target);
    try {
      const result = NameRevisionResult.parse(
        await api(
          path + '/revisions/' + target.revisionId + '/name',
          'PUT',
          target.command,
        ),
      );
      if (
        result.articleId !== article.articleId ||
        result.revisionId !== target.revisionId ||
        result.mutationId !== target.command.mutationId
      )
        throw new Error('版本确认不匹配，请核对并重试。');
    } catch (error) {
      if (
        !pending &&
        error instanceof ApiError &&
        [400, 401, 403, 404, 409, 422].includes(error.status)
      )
        setPending(null);
      throw error;
    }
    setPending(null);
    setRename(null);
    setNotice(
      target.command.keepExistingName
        ? '版本已保存 · #' + target.seq
        : `已命名版本 #${target.seq}；之后继续输入的内容不包含在这个版本中。`,
    );
    await load();
  };
  const label = (r: RevisionInfo) => versionId(r) + ' · ' + versionName(r);
  const matches = matchingVersions(items, query);
  const retained = (r: RevisionInfo) => !!r.name || r.kind !== 'save';
  const backups = matches.filter((r) => !retained(r));
  async function compare(from: string, to: string) {
    const generation = ++readGeneration.current;
    const detail = async (id: string) =>
      RevisionDetail.parse(await api(path + '/revisions/' + id));
    const [source, target] = await Promise.all([
      detail(from),
      to === 'draft' ? null : detail(to),
    ]);
    if (readGeneration.current !== generation) return;
    setPair({ from: source, to: target });
    setReview(null);
    setRename(null);
  }
  function rows(versions: RevisionInfo[]) {
    return (
      <ol className="revision-list">
        {versions.slice(0, limit).map((r) => (
          <li key={r.revisionId}>
            <div className="revision-caption">
              <strong>{versionName(r)}</strong>
              <small title={'#' + r.seq}>{versionDate(r.createdAt)}</small>
            </div>
            <button
              className="text-action"
              disabled={busy}
              onClick={() => void run(() => compare(r.revisionId, 'draft'))}
            >
              比较
            </button>
            {!readOnly && (
              <DeskMenu
                label={'版本 #' + r.seq + '的更多操作'}
                trigger={<Ellipsis size={15} />}
                disabled={busy || !!pending}
              >
                <button
                  aria-label={'命名版本 #' + r.seq}
                  onClick={() => {
                    namingComposing.current = false;
                    setRename(r);
                    setName(r.name || '');
                    setReview(null);
                    setPair(null);
                  }}
                >
                  命名
                </button>
                {!r.current && (
                  <button
                    aria-label={'查看并恢复版本 #' + r.seq}
                    onClick={() =>
                      void run(async () => {
                        setRename(null);
                        setPair(null);
                        setReview(null);
                        const generation = ++readGeneration.current;
                        const ticket = await reviewRestore(r.revisionId);
                        if (generation === readGeneration.current)
                          setReview(ticket);
                      })
                    }
                  >
                    恢复…
                  </button>
                )}
              </DeskMenu>
            )}
          </li>
        ))}
      </ol>
    );
  }
  const kept = matches.filter(retained);
  return (
    <section className="version-panel" aria-label="版本历史">
      {!readOnly && (
        <div className="version-tools">
          <button
            className="save-version"
            disabled={busy || !!pending}
            onClick={() =>
              void run(async () => {
                const target = await flush();
                await submit({
                  ...target,
                  command: {
                    name: '手动保存',
                    mutationId: crypto.randomUUID(),
                    keepExistingName: true,
                  },
                });
              })
            }
          >
            保存版本
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="version-notice">
          {notice}
        </p>
      )}
      {error && !rename && <p role="alert">{error}</p>}
      {listError && <p role="alert">{listError}</p>}
      {listError && <button onClick={() => void load()}>刷新历史</button>}
      {pending && !rename && !busy && (
        <button
          disabled={readOnly}
          onClick={() => void run(() => submit(pending))}
        >
          重试{pending.command.keepExistingName ? '保存版本' : '命名'}
        </button>
      )}
      {visible && rename && (
        <DeskDialog
          title="命名稿次"
          close={() => {
            if (!namingComposing.current) setRename(null);
          }}
          blocked={busy || !!pending}
        >
          <form
            className="version-rename"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !busy &&
                !pending &&
                !namingComposing.current &&
                !readOnly &&
                name.trim() &&
                [...name].length <= 80
              )
                void run(() =>
                  submit({
                    ...rename,
                    command: {
                      name: name.trim(),
                      mutationId: crypto.randomUUID(),
                    },
                  }),
                );
            }}
          >
            <label>
              稿次名称
              <input
                value={name}
                maxLength={160}
                disabled={!!pending || busy}
                onCompositionStart={() => {
                  namingComposing.current = true;
                }}
                onCompositionEnd={() => {
                  namingComposing.current = false;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.nativeEvent.isComposing)
                    event.preventDefault();
                }}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              disabled={
                readOnly ||
                busy ||
                !!pending ||
                !name.trim() ||
                [...name].length > 80
              }
            >
              保存名称
            </button>
            <button
              type="button"
              hidden={!pending}
              disabled={busy || readOnly}
              onClick={() => pending && void run(() => submit(pending))}
            >
              重试命名
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        </DeskDialog>
      )}
      {visible && pair && (
        <section ref={detailPane} className="version-compare">
          <strong>比较改动</strong>
          <label>
            从 {label(pair.from)} 到
            <select
              aria-label="比较目标版本"
              disabled={busy}
              value={pair.to?.revisionId ?? 'draft'}
              onChange={(event) =>
                void run(() =>
                  compare(pair.from.revisionId, event.target.value),
                )
              }
            >
              <option value="draft">当前稿</option>
              {items
                .filter((r) => r.revisionId !== pair.from.revisionId)
                .map((r) => (
                  <option
                    key={r.revisionId}
                    data-seq={r.seq}
                    value={r.revisionId}
                  >
                    {label(r)}
                  </option>
                ))}
            </select>
          </label>
          <RevisionComparison
            before={pair.from.document}
            after={pair.to?.document ?? currentDocument() ?? article.document}
          />
          <button
            className="text-action"
            onClick={() => {
              readGeneration.current++;
              setPair(null);
            }}
          >
            结束比较
          </button>
        </section>
      )}
      {visible && review && (
        <DeskDialog
          title={'恢复「' + versionId(review.source) + '」？'}
          close={() => setReview(null)}
        >
          <section aria-label="待恢复版本" className="restore-preview">
            <p>当前稿会保留为恢复前稿。以下是恢复将带来的改动。</p>
            <RevisionComparison
              before={review.before}
              after={review.source.document}
            />
            <button
              disabled={readOnly || busy}
              onClick={() =>
                void run(async () => {
                  setReview(null);
                  await confirmRestore(review);
                  setNotice(
                    '恢复已提交；如等待期间继续输入，请先核对正文中的提示。',
                  );
                  await load();
                })
              }
            >
              恢复为新版本
            </button>
            <button disabled={busy} onClick={() => setReview(null)}>
              返回
            </button>
          </section>
        </DeskDialog>
      )}
      <h3>保留的版本</h3>
      <input
        type="search"
        aria-label="查找日期、名称或版本号"
        placeholder="查找日期、名称或版本号"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(20);
        }}
      />
      {rows(kept)}
      {backups.length > 0 && (
        <>
          <button
            className="text-action"
            aria-expanded={showBackups}
            onClick={() => setShowBackups(!showBackups)}
          >
            {showBackups
              ? '收起自动备份'
              : '查看自动备份（' + backups.length + '）'}
          </button>
          {showBackups && rows(backups)}
        </>
      )}
      {(kept.length > limit || (showBackups && backups.length > limit)) && (
        <button onClick={() => setLimit(limit + 20)}>加载更早版本</button>
      )}
      {query && !matches.length && <p>没有匹配的版本。</p>}
    </section>
  );
}
