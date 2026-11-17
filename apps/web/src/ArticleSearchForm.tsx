import { useRef, useState } from 'react';
import { ArticleSearchFilters } from '@inkling/contracts';
import { Search } from 'lucide-react';
export function ArticleSearchForm({
  apply,
}: {
  apply: (filters: ArticleSearchFilters) => void;
}) {
  const [q, setQ] = useState(''),
    [tag, setTag] = useState(''),
    [message, setMessage] = useState('');
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
    apply(parsed.data);
  }
  return (
    <form
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
      <div className="search-actions">
        <button type="submit">
          <Search size={15} aria-hidden="true" />
          查找文章
        </button>
        <button
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
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
