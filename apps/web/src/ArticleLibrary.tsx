import { useEffect, useRef, useState } from 'react';
import {
  ArticleListPage,
  type ArticleSnapshot,
  type ArticleListItem,
  type ArticleSearchFilters,
  ArticleShelf,
} from '@inkling/contracts';
import { Ellipsis, Plus, X } from 'lucide-react';
import { api } from './api';
import { DeskMenu } from './DeskMenu';
import type { OrganizerMode } from './ArticleOrganizer';
import type { LifecycleTarget } from './ArticleLifecycle';
import { ArticleSearchForm } from './ArticleSearchForm';
import type { LibraryView } from './use-article';
export function ArticleLibrary({
  current,
  initialView,
  refreshGeneration,
  refreshArticleState,
  manageState,
  viewChanged,
  restoreArticle,
  disabled,
  openArticle,
  organizeArticle,
  confirmedMetadata,
  createArticle,
  close,
}: {
  current: ArticleSnapshot | null;
  initialView: LibraryView;
  refreshGeneration: number;
  refreshArticleState: () => void;
  manageState: (target: LifecycleTarget) => void;
  viewChanged: (view: LibraryView) => void;
  restoreArticle: (id: string) => void;
  confirmedMetadata: ArticleListItem | null;
  organizeArticle: (id: string, mode: OrganizerMode) => void;
  disabled: boolean;
  openArticle: (id: string) => void;
  createArticle: () => void;
  close: () => void;
}) {
  const [page, setPage] = useState<ArticleListPage>({
    items: [],
    total: 0,
    nextCursor: null,
  });
  const [query, setQuery] = useState<{
    attempt: number;
    state: ArticleShelf;
    cursor: ArticleListPage['nextCursor'];
    filters: ArticleSearchFilters & { term?: string };
  }>({
    attempt: 0,
    cursor: null,
    filters: initialView.filters,
    state: initialView.shelf,
  });
  const generation = useRef(0);
  const previousRefresh = useRef(refreshGeneration);
  const [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (previousRefresh.current !== refreshGeneration) {
      previousRefresh.current = refreshGeneration;
      load(null);
      return;
    }
    let active = true;
    const requestGeneration = query.attempt;
    const isCurrent = () => active && requestGeneration === generation.current;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: '20' });
    if (query.state !== 'active') params.set('state', query.state);
    if (query.filters.term) params.set('term', query.filters.term);
    if (query.filters.q) params.set('q', query.filters.q);
    if (query.filters.tag) params.set('tag', query.filters.tag);
    if (query.cursor) {
      params.set('beforeCreatedAt', String(query.cursor.createdAt));
      params.set('beforeId', query.cursor.articleId);
    }
    void api('/api/articles?' + params.toString())
      .then((value) => {
        const result = ArticleListPage.parse(value);
        if (!isCurrent()) return;
        setPage((previous) => ({
          items: query.cursor
            ? [
                ...previous.items,
                ...result.items.filter(
                  (item) =>
                    !previous.items.some(
                      (old) => old.articleId === item.articleId,
                    ),
                ),
              ]
            : result.items,
          nextCursor: result.nextCursor,
          total: result.total,
        }));
        setLoaded(true);
      })
      .catch(() => {
        if (isCurrent()) setError('文章库读取失败，请重试。');
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, refreshGeneration]);
  function load(cursor: ArticleListPage['nextCursor']) {
    setLoading(true);
    generation.current++;
    setQuery((previous) => ({
      ...previous,
      attempt: previous.attempt + 1,
      cursor,
    }));
  }
  function applyFilters(filters: ArticleSearchFilters & { term?: string }) {
    viewChanged({ shelf: query.state, filters });
    generation.current++;
    setLoading(true);
    setError('');
    if (
      filters.term !== query.filters.term ||
      filters.q !== query.filters.q ||
      filters.tag !== query.filters.tag
    ) {
      setPage({ items: [], total: 0, nextCursor: null });
      setLoaded(false);
    }
    setQuery((previous) => ({
      ...previous,
      attempt: previous.attempt + 1,
      cursor: null,
      filters,
    }));
  }
  const stateLabels = {
    all: '全部文章',
    active: '活动文章',
    archived: '已归档',
    trashed: '回收站',
  };
  function changeState(state: ArticleShelf) {
    if (disabled || state === query.state) return;
    generation.current++;
    setPage({ items: [], total: 0, nextCursor: null });
    setLoading(true);
    setLoaded(false);
    setError('');
    setQuery((previous) => ({
      ...previous,
      state,
      cursor: null,
      attempt: previous.attempt + 1,
    }));
    viewChanged({ shelf: state, filters: query.filters });
  }
  const hasFilters = !!(
    query.filters.q ||
    query.filters.tag ||
    query.filters.term
  );
  const filterSummary = [
    query.filters.term ? '“' + query.filters.term + '”' : '',
    query.filters.q ? '标题“' + query.filters.q + '”' : '',
    query.filters.tag ? '标签“' + query.filters.tag + '”' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section className="article-library" aria-label="文章列表">
      <div className="library-heading">
        <div className="library-tabs">
          <button type="button" aria-pressed="true">
            文章
          </button>
          <button type="button" disabled title="素材尚未接入">
            素材
          </button>
        </div>
        <div className="library-actions">
          <button
            disabled={disabled}
            className="library-new"
            aria-label="新建文章"
            onClick={createArticle}
          >
            <Plus size={15} />
            新建
          </button>
          <button disabled={disabled} aria-label="关闭文章库" onClick={close}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ArticleSearchForm
        initialFilters={initialView.filters}
        noMatches={loaded && !loading && !error && page.total === 0}
        apply={applyFilters}
        disabled={disabled}
        refresh={() => {
          load(null);
          refreshArticleState();
        }}
      />
      <div className="library-scope">
        <select
          aria-label="文章范围"
          disabled={disabled}
          value={query.state}
          onChange={(e) => {
            const value = e.target.value;
            const parsed = ArticleShelf.safeParse(value);
            if (parsed.success) changeState(parsed.data);
          }}
        >
          <option value="active">写作中</option>
          <option value="all">全部文章</option>
          <option value="published" disabled>
            已发表
          </option>
          <option value="archived">已归档</option>
          <option value="trashed">回收站</option>
        </select>
        <small>{!loading && !error ? page.total + ' 篇' : ''}</small>
      </div>
      <p
        className="search-summary"
        hidden={!query.filters.q && !query.filters.tag}
      >
        当前筛选：{filterSummary}
      </p>
      {error && (
        <div className="library-error">
          <p role="alert">{error}</p>
          <button onClick={() => load(query.cursor)} disabled={loading}>
            重试列表
          </button>
        </div>
      )}
      {loading && <p role="status">正在读取文章…</p>}
      {loaded && !loading && !error && page.items.length === 0 && (
        <p className="library-empty">
          {hasFilters
            ? '没有匹配的文章，试试其他标题或标签。'
            : query.state === 'active' || query.state === 'all'
              ? '还没有文章，从一个问题开始写作。'
              : query.state === 'archived'
                ? '还没有归档文章。'
                : '回收站为空。'}
        </p>
      )}
      <ul className="library-items" aria-label={stateLabels[query.state]}>
        {page.items.map((item) => {
          const selected = item.articleId === current?.articleId;
          const name =
            (selected ? current.document.title : item.title) || '未命名文章';
          return (
            <li key={item.articleId} className={selected ? 'is-current' : ''}>
              <button
                disabled={disabled || item.state === 'trashed'}
                aria-label={'打开：' + name}
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  if (!selected) openArticle(item.articleId);
                  else if (matchMedia('(max-width:820px)').matches) close();
                }}
              >
                <span className="library-item-title">{name}</span>
                <span className="library-item-meta">
                  <span>
                    {selected
                      ? '当前文章'
                      : item.state === 'archived'
                        ? '只读归档'
                        : item.state === 'trashed'
                          ? '回收站'
                          : '草稿'}
                  </span>
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                  </time>
                </span>
                <span className="article-tags" aria-label="文章标签">
                  {(confirmedMetadata?.articleId === item.articleId &&
                  confirmedMetadata.metadataVersion >= item.metadataVersion
                    ? confirmedMetadata.tags
                    : item.tags
                  ).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </span>
              </button>
              <div className="library-card-details">
                {item.state !== 'trashed' && (
                  <DeskMenu
                    label={name + '的更多操作'}
                    trigger={<Ellipsis size={16} />}
                    disabled={disabled}
                  >
                    {item.state === 'active' && (
                      <>
                        <button
                          onClick={() =>
                            organizeArticle(item.articleId, 'rename')
                          }
                        >
                          重命名
                        </button>
                        <button
                          onClick={() =>
                            organizeArticle(item.articleId, 'tags')
                          }
                        >
                          编辑标签
                        </button>
                      </>
                    )}
                    <button
                      onClick={() =>
                        manageState({
                          articleId: item.articleId,
                          action:
                            item.state === 'archived' ? 'unarchive' : 'archive',
                        })
                      }
                    >
                      {item.state === 'archived' ? '移回草稿' : '归档'}
                    </button>
                    <button
                      onClick={() =>
                        manageState({
                          articleId: item.articleId,
                          action: 'trash',
                        })
                      }
                    >
                      移入回收站…
                    </button>
                  </DeskMenu>
                )}
                {item.state === 'trashed' && (
                  <button
                    className="organize-button"
                    disabled={disabled}
                    aria-label={'恢复：' + name}
                    onClick={() => restoreArticle(item.articleId)}
                  >
                    恢复
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {page.nextCursor && (
        <button
          className="library-more"
          disabled={loading}
          onClick={() => load(page.nextCursor)}
        >
          加载更多文章
        </button>
      )}
    </section>
  );
}
