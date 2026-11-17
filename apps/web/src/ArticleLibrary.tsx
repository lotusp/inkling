import { useEffect, useRef, useState } from 'react';
import {
  ArticleListPage,
  ArticleTitle,
  type ArticleSnapshot,
  type ArticleListItem,
  type ArticleSearchFilters,
  type ArticleState,
} from '@inkling/contracts';
import { BookOpen, FilePlus2, RefreshCw, X } from 'lucide-react';
import { api } from './api';
import { ArticleSearchForm } from './ArticleSearchForm';
export function ArticleLibrary({
  current,
  initialState,
  stateChanged,
  restoreArticle,
  disabled,
  openArticle,
  organizeArticle,
  confirmedMetadata,
  createArticle,
  close,
}: {
  current: ArticleSnapshot | null;
  initialState: ArticleState;
  stateChanged: (state: ArticleState) => void;
  restoreArticle: (id: string) => void;
  confirmedMetadata: ArticleListItem | null;
  organizeArticle: (id: string) => void;
  disabled: boolean;
  openArticle: (id: string) => void;
  createArticle: (title: string) => void;
  close: () => void;
}) {
  const [page, setPage] = useState<ArticleListPage>({
    items: [],
    nextCursor: null,
  });
  const [query, setQuery] = useState<{
    attempt: number;
    state: ArticleState;
    cursor: ArticleListPage['nextCursor'];
    filters: ArticleSearchFilters;
  }>({
    attempt: 0,
    cursor: null,
    filters: { q: '', tag: '' },
    state: initialState,
  });
  const generation = useRef(0);
  const [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState('');
  const [title, setTitle] = useState(''),
    [titleError, setTitleError] = useState('');
  const composing = useRef(false);
  useEffect(() => {
    let active = true;
    const requestGeneration = query.attempt;
    const isCurrent = () => active && requestGeneration === generation.current;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: '20' });
    if (query.state !== 'active') params.set('state', query.state);
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
  }, [query]);
  function load(cursor: ArticleListPage['nextCursor']) {
    setLoading(true);
    generation.current++;
    setQuery((previous) => ({
      ...previous,
      attempt: previous.attempt + 1,
      cursor,
    }));
  }
  function applyFilters(filters: ArticleSearchFilters) {
    generation.current++;
    setLoading(true);
    setError('');
    if (filters.q !== query.filters.q || filters.tag !== query.filters.tag) {
      setPage({ items: [], nextCursor: null });
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
    active: '活动文章',
    archived: '已归档',
    trashed: '回收站',
  };
  function changeState(state: ArticleState) {
    if (disabled || state === query.state) return;
    generation.current++;
    setPage({ items: [], nextCursor: null });
    setLoading(true);
    setLoaded(false);
    setError('');
    setQuery((previous) => ({
      ...previous,
      state,
      cursor: null,
      attempt: previous.attempt + 1,
    }));
    stateChanged(state);
  }
  const hasFilters = !!(query.filters.q || query.filters.tag);
  const filterSummary = [
    query.filters.q ? '标题“' + query.filters.q + '”' : '',
    query.filters.tag ? '标签“' + query.filters.tag + '”' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section className="article-library" aria-label="文章列表">
      <div className="library-heading">
        <div>
          <h2>
            <BookOpen size={18} aria-hidden="true" />
            我的文章
          </h2>
          <p>让每个值得记录的想法，都有自己的位置。</p>
        </div>
        <div className="library-actions">
          <button aria-label="刷新文章库" onClick={() => load(null)}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button aria-label="关闭文章库" onClick={close}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <form
        className="library-create"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          if (composing.current) {
            setTitleError('请先完成新标题的选词。');
            return;
          }
          const parsed = ArticleTitle.safeParse(title);
          if (!parsed.success) {
            setTitleError('标题不能超过 200 个字符。');
            return;
          }
          setTitleError('');
          createArticle(parsed.data);
        }}
      >
        <label htmlFor="new-article-title">新文章标题（可选）</label>
        <div>
          <input
            id="new-article-title"
            placeholder="一个值得展开的问题…"
            value={title}
            maxLength={400}
            disabled={disabled}
            onChange={(event) => setTitle(event.target.value)}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing)
                event.preventDefault();
            }}
          />
          <button type="submit" disabled={disabled}>
            <FilePlus2 size={16} aria-hidden="true" />
            新建文章
          </button>
        </div>
        {titleError && <p role="alert">{titleError}</p>}
      </form>
      <div
        className="library-state-tabs"
        role="group"
        aria-label="文章状态筛选"
      >
        {(['active', 'archived', 'trashed'] as const).map((state) => (
          <button
            key={state}
            disabled={disabled}
            aria-pressed={query.state === state}
            onClick={() => changeState(state)}
          >
            {stateLabels[state]}
          </button>
        ))}
      </div>
      <ArticleSearchForm apply={applyFilters} />
      <p className="search-summary">
        {hasFilters
          ? '当前筛选：' + filterSummary
          : '全部' + stateLabels[query.state] + ' · 可按标题或标签查找'}
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
            : query.state === 'active'
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
                disabled={disabled || selected || item.state === 'trashed'}
                aria-label={'打开：' + name}
                aria-current={selected ? 'page' : undefined}
                onClick={() => openArticle(item.articleId)}
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
              </button>
              <div className="library-card-details">
                <div className="article-tags" aria-label="文章标签">
                  {(selected &&
                  confirmedMetadata &&
                  confirmedMetadata.metadataVersion >= item.metadataVersion
                    ? confirmedMetadata.tags
                    : item.tags
                  ).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                {item.state === 'active' && (
                  <button
                    className="organize-button"
                    disabled={disabled}
                    aria-label={'整理：' + name}
                    onClick={() => organizeArticle(item.articleId)}
                  >
                    整理
                  </button>
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
      {loaded && page.items.length > 0 && (
        <p className="library-count">
          已显示 {page.items.length} 篇 · 按创建时间排序
        </p>
      )}
    </section>
  );
}
