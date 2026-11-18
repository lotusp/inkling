import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NameRevisionResult,
  RevisionDetail,
  RevisionPage,
  type ArticleSnapshot,
  type NameRevisionCommand,
  type RevisionInfo,
} from '@inkling/contracts';
import { api } from './api';
import { RevisionComparison } from './RevisionComparison';
import { DocumentPart } from './DocumentComparison';
import type { RestoreReview } from './use-article';
export function VersionPanel({
  article,
  visible,
  readOnly,
  flush,
  reviewRestore,
  confirmRestore,
}: {
  article: ArticleSnapshot;
  readOnly: boolean;
  visible: boolean;
  flush: () => Promise<{ revisionId: string; seq: number }>;
  reviewRestore: (source: string) => Promise<RestoreReview>;
  confirmRestore: (review: RestoreReview) => Promise<unknown>;
}) {
  const [items, setItems] = useState<RevisionInfo[]>([]),
    [all, setAll] = useState(false),
    [cursor, setCursor] = useState<number | null>(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(''),
    [right, setRight] = useState(''),
    [pair, setPair] = useState<[RevisionDetail, RevisionDetail] | null>(null);
  const [pending, setPending] = useState<{
    revisionId: string;
    seq: number;
    command: NameRevisionCommand;
  } | null>(null);
  const [review, setReview] = useState<RestoreReview | null>(null);
  const generation = useRef(0),
    action = useRef(false);
  const writeBlocked = useRef(readOnly);
  writeBlocked.current = readOnly;
  const path = '/api/articles/' + article.articleId;
  const load = useCallback(
    async (before?: number) => {
      const ticket = ++generation.current;
      try {
        const page = RevisionPage.parse(
          await api(
            path +
              `/revisions?all=${all}&limit=20` +
              (before ? `&beforeSeq=${before}` : ''),
          ),
        );
        if (ticket !== generation.current) return;
        setItems((old) =>
          before
            ? [
                ...old,
                ...page.items.filter(
                  (x) => !old.some((y) => y.revisionId === x.revisionId),
                ),
              ]
            : page.items,
        );
        setCursor(page.nextBeforeSeq);
        setError('');
      } catch (e) {
        if (ticket === generation.current)
          setError(e instanceof Error ? e.message : '历史加载失败，请重试。');
      }
    },
    [path, all],
  );
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    if (visible) void load();
    return invalidate;
  }, [load, invalidate, visible]);
  const run = async (fn: () => Promise<void>) => {
    if (action.current) return;
    action.current = true;
    setBusy(true);
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
    NameRevisionResult.parse(
      await api(
        path + `/revisions/${target.revisionId}/name`,
        'PUT',
        target.command,
      ),
    );
    setPending(null);
    setNotice(
      `已命名版本 #${target.seq}；之后继续输入的内容不包含在这个版本中。`,
    );
    await load();
  };
  const label = (r: RevisionInfo) => `#${r.seq}${r.name ? ' · ' + r.name : ''}`;
  return (
    <section className="version-panel" aria-label="版本历史">
      <p>当前已知版本 #{article.headSeq}</p>
      <label>
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />
        所有保存记录
      </label>
      <button onClick={() => void load()}>刷新历史</button>
      <div className="version-name">
        <label>
          版本名称
          <input
            disabled={readOnly}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
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
          onClick={() =>
            void run(async () => {
              const target = await flush();
              await submit({
                ...target,
                command: { mutationId: crypto.randomUUID(), name },
              });
            })
          }
        >
          保存并命名当前稿
        </button>
        {pending && (
          <button
            disabled={readOnly || busy}
            onClick={() => void run(() => submit(pending))}
          >
            重试命名
          </button>
        )}
      </div>

      <p role="status">{notice}</p>
      {error && <p role="alert">{error}</p>}
      <ol className="revision-list">
        {items.map((r) => (
          <li key={r.revisionId}>
            <strong>
              {r.name ||
                (r.seq === 1
                  ? '初稿'
                  : r.kind === 'restore'
                    ? '恢复的稿件'
                    : r.automaticAt !== null
                      ? '自动恢复点'
                      : '保存的稿件')}
            </strong>{' '}
            <small>#{r.seq}</small>
            <span>
              {r.current ? ' · 当前' : ''}
              {r.automaticAt !== null ? ' · 自动恢复点' : ''}
              {r.kind === 'restore' ? ' · 从旧稿恢复' : ''} ·{' '}
              {new Date(r.createdAt).toLocaleString()}
            </span>
            <button
              disabled={
                readOnly ||
                busy ||
                !!pending ||
                !name.trim() ||
                [...name].length > 80
              }
              aria-label={'命名版本 #' + r.seq}
              onClick={() =>
                void run(() =>
                  submit({
                    revisionId: r.revisionId,
                    seq: r.seq,
                    command: { mutationId: crypto.randomUUID(), name },
                  }),
                )
              }
            >
              命名
            </button>
            <button
              disabled={readOnly || busy}
              aria-label={'查看并恢复版本 #' + r.seq}
              onClick={() =>
                void run(async () => {
                  setReview(null);
                  setReview(await reviewRestore(r.revisionId));
                })
              }
            >
              查看并恢复…
            </button>
          </li>
        ))}
      </ol>
      {cursor && (
        <button onClick={() => void load(cursor)}>加载更早版本</button>
      )}
      <details className="compare-options">
        <summary>比较两个版本</summary>
        <div className="version-selectors">
          {(['比较左侧版本', '比较右侧版本'] as const).map((text, i) => (
            <label key={text}>
              {text}
              <select
                disabled={busy}
                value={i ? right : left}
                onChange={(e) => {
                  setPair(null);
                  (i ? setRight : setLeft)(e.target.value);
                }}
              >
                <option value="">选择版本</option>
                {items.map((r) => (
                  <option value={r.revisionId} key={r.revisionId}>
                    {label(r)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button
          disabled={busy || !left || !right}
          onClick={() =>
            void run(async () => {
              const [a, b] = await Promise.all([
                api(path + '/revisions/' + left),
                api(path + '/revisions/' + right),
              ]);
              setPair([RevisionDetail.parse(a), RevisionDetail.parse(b)]);
            })
          }
        >
          比较所选版本
        </button>
      </details>
      {review && (
        <section aria-label="待恢复版本" className="restore-preview">
          <h3>恢复版本 #{review.source.seq}</h3>
          <p>
            将在已查看基线之上新增版本，保留历史。继续输入或选词后需重新确认。
          </p>
          <h4>{review.source.document.title || '未命名文章'}</h4>
          <DocumentPart node={review.source.document.doc} />
          <button
            disabled={readOnly || busy}
            onClick={() =>
              void run(async () => {
                await confirmRestore(review);
                setReview(null);
                setNotice(
                  '恢复已提交；如等待期间继续输入，请先核对正文中的提示。',
                );
                await load();
              })
            }
          >
            确认恢复为新版本
          </button>
          <button disabled={busy} onClick={() => setReview(null)}>
            取消恢复
          </button>
        </section>
      )}
      {pair && <RevisionComparison left={pair[0]} right={pair[1]} />}
    </section>
  );
}
