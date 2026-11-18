import { useRef, useState } from 'react';
import { ArticleSearchFilters } from '@inkling/contracts';
import { Search, SlidersHorizontal } from 'lucide-react';
export function ArticleSearchForm({
  apply,
  refresh,
  disabled,
  initialFilters,
  noMatches,
}: {
  apply: (filters: ArticleSearchFilters & { term?: string }) => void;
  refresh: () => void;
  disabled: boolean;
  initialFilters: ArticleSearchFilters & { term?: string };
  noMatches: boolean;
}) {
  const [q, setQ] = useState(initialFilters.q),
    [tag, setTag] = useState(initialFilters.tag),
    [message, setMessage] = useState('');
  const [term, setTerm] = useState(initialFilters.term ?? '');
  const [advanced, setAdvanced] = useState(
    !!(initialFilters.q || initialFilters.tag),
  );
  function search(text: string) {
    const value = text.trim().normalize('NFC');
    if ([...value].length > 100) {
      setMessage('搜索词最多 100 个字符。');
      return;
    }
    setMessage('');
    setQ('');
    setTag('');
    apply({ q: '', tag: '', term: value });
  }
  const composing = useRef(new Set<string>());
  function ready() {
    if (composing.current.size) {
      setMessage('请先完成选词，再查找或清除筛选。');
      return false;
    }
    return true;
  }
  function submit() {
    if (!ready()) return;
    const parsed = ArticleSearchFilters.safeParse({ q, tag });
    if (!parsed.success) {
      setMessage('标题查找最多 100 个字符；标签最多 30 个字符且不能换行。');
      return;
    }
    setMessage('');
    setTerm('');
    apply(parsed.data);
  }
  return (
    <div className="library-query">
      <div className="quick-query">
        <input
          type="search"
          aria-label="搜标题或标签"
          placeholder="搜标题或标签"
          value={term}
          disabled={disabled}
          maxLength={400}
          onChange={(e) => {
            setTerm(e.target.value);
            if (!composing.current.has('term')) search(e.target.value);
          }}
          onCompositionStart={() => composing.current.add('term')}
          onCompositionEnd={(e) => {
            composing.current.delete('term');
            search(e.currentTarget.value);
          }}
        />
        <button
          type="button"
          aria-label="搜索选项"
          aria-expanded={advanced}
          title="搜索选项"
          disabled={disabled}
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>
      <form
        hidden={!advanced}
        className="library-search"
        aria-label="查找文章"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.nativeEvent.isComposing)
            event.preventDefault();
        }}
      >
        <div className="search-field">
          <label htmlFor="article-search-title">按标题查找</label>
          <input
            id="article-search-title"
            type="text"
            placeholder="标题中的字词"
            maxLength={400}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onCompositionStart={() => composing.current.add('q')}
            onCompositionEnd={() => composing.current.delete('q')}
          />
        </div>
        <div className="search-tag">
          <div className="search-field">
            <label htmlFor="article-search-tag">精确标签</label>
            <input
              id="article-search-tag"
              type="text"
              placeholder="完整标签名称"
              maxLength={120}
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              onCompositionStart={() => composing.current.add('tag')}
              onCompositionEnd={() => composing.current.delete('tag')}
            />
          </div>
        </div>
        <div className="search-actions">
          <button type="button" disabled={disabled} onClick={refresh}>
            刷新文章库
          </button>
          <button type="submit" aria-label="查找文章" title="查找文章">
            <Search size={15} aria-hidden="true" />
          </button>
          <button
            hidden={!q && !tag}
            type="button"
            onClick={() => {
              if (!ready()) return;
              setQ('');
              setTag('');
              setMessage('');
              apply({ q: '', tag: '' });
            }}
          >
            清除筛选
          </button>
        </div>
      </form>
      {noMatches && term && (
        <button
          className="text-action"
          disabled={disabled}
          onClick={() => {
            if (ready()) {
              setTerm('');
              search('');
            }
          }}
        >
          清除搜索
        </button>
      )}
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
