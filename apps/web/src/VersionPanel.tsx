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
export function VersionPanel({
  article,
  flush,
}: {
  article: ArticleSnapshot;
  flush: () => Promise<{ revisionId: string; seq: number }>;
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
  const generation = useRef(0),
    action = useRef(false);
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
    void load();
    return invalidate;
  }, [load, invalidate]);
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
      <h2>版本历史</h2>
      <p>当前已知版本 #{article.headSeq}。默认展示恢复点和命名版本。</p>
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
          />
        </label>
        <button
          disabled={busy || !!pending || !name.trim() || [...name].length > 80}
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
            disabled={busy}
            onClick={() => void run(() => submit(pending))}
          >
            重试命名
          </button>
        )}
      </div>
      <p>命名前先保存本次内容。命名请求未确认时，请重试同一次请求。</p>
      <p role="status">{notice}</p>
      {error && <p role="alert">{error}</p>}
      <ol className="revision-list">
        {items.map((r) => (
          <li key={r.revisionId}>
            <strong>{label(r)}</strong>
            <span>
              {r.current ? ' · 当前' : ''}
              {r.automaticAt !== null ? ' · 自动恢复点' : ''}
              {r.kind === 'restore' ? ' · 从旧稿恢复' : ''} ·{' '}
              {new Date(r.createdAt).toLocaleString()}
            </span>
            <button
              disabled={
                busy || !!pending || !name.trim() || [...name].length > 80
              }
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
              命名版本 #{r.seq}
            </button>
          </li>
        ))}
      </ol>
      {cursor && (
        <button onClick={() => void load(cursor)}>加载更早版本</button>
      )}
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
      {pair && <RevisionComparison left={pair[0]} right={pair[1]} />}
    </section>
  );
}
