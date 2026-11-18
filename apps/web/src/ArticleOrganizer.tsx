import { useEffect, useRef, useState } from 'react';
import { ArticleTitle, type ArticleListItem } from '@inkling/contracts';
import { useArticleTags } from './use-article-tags';
export function ArticleOrganizer({
  articleId,
  initialTitle: initial,
  renameTitle,
  locked = false,
  pendingTitle = false,
  onConfirmed,
  close,
}: {
  articleId: string;
  initialTitle: string;
  renameTitle: (title: string) => Promise<unknown>;
  locked?: boolean;
  pendingTitle?: boolean;
  onConfirmed: (metadata: ArticleListItem) => void;
  close: () => void;
}) {
  const [title, setTitle] = useState(initial),
    [committedTitle, setCommittedTitle] = useState(initial),
    [renaming, setRenaming] = useState(false),
    [titleMessage, setTitleMessage] = useState('');
  const composing = useRef(false),
    renamingRef = useRef(false);
  const tags = useArticleTags(articleId, onConfirmed);
  const dirty = title !== committedTitle || tags.dirty;
  useEffect(() => {
    if (!dirty && !renaming) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, renaming]);
  async function rename() {
    if (renamingRef.current) return;
    if (composing.current) {
      setTitleMessage('请先完成标题选词。');
      return;
    }
    const parsed = ArticleTitle.safeParse(title);
    if (!parsed.success) {
      setTitleMessage('标题不能超过 200 个字符。');
      return;
    }
    renamingRef.current = true;
    setRenaming(true);
    setTitleMessage('');
    try {
      await renameTitle(parsed.data);
      setCommittedTitle(parsed.data);
      setTitleMessage('标题已保存。');
    } catch (error) {
      setTitleMessage(
        error instanceof Error
          ? error.message
          : '标题尚未确认保存，请在正文中核对。',
      );
    } finally {
      renamingRef.current = false;
      setRenaming(false);
    }
  }
  return (
    <section className="article-organizer" aria-label="整理文章">
      <div className="organizer-heading">
        <div>
          <h2>整理文章</h2>
          <p>标题跟随正文保存，标签帮助你整理想法。</p>
        </div>
        <button
          disabled={renaming || pendingTitle || tags.busy || tags.pending}
          onClick={() => {
            if (composing.current) {
              setTitleMessage('请先完成标题选词。');
              return;
            }
            if (!renamingRef.current && tags.canClose()) close();
          }}
        >
          {dirty ? '放弃未提交输入并关闭' : '关闭整理'}
        </button>
      </div>
      <div className="organizer-fields">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
        >
          <label htmlFor="organizer-title">新标题</label>
          <input
            id="organizer-title"
            value={title}
            disabled={pendingTitle}
            maxLength={400}
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
          <p>改名会生成一个文章版本。</p>
          <button disabled={renaming || locked} type="submit">
            {pendingTitle ? '核对并重试标题' : '保存标题'}
          </button>
          {titleMessage && <p role="status">{titleMessage}</p>}
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void tags.save();
          }}
        >
          <label htmlFor="organizer-tags">文章标签（一行一个）</label>
          <textarea
            id="organizer-tags"
            rows={4}
            value={tags.text}
            disabled={!tags.base}
            onChange={(event) => tags.change(event.target.value)}
            onCompositionStart={tags.compositionStart}
            onCompositionEnd={tags.compositionEnd}
          />
          <p>最多 10 个，每个 1–30 个字符。留空可清除标签。</p>
          {!tags.base ? (
            <button type="button" onClick={tags.retryLoad}>
              重试读取标签
            </button>
          ) : (
            <button type="submit" disabled={tags.busy || tags.conflict}>
              {tags.pending ? '核对并重试标签' : '保存标签'}
            </button>
          )}
          {tags.message && <p role="status">{tags.message}</p>}
          {tags.conflict && (
            <div className="tag-conflict">
              <p>
                {tags.remote
                  ? '服务器最新标签：' +
                    (tags.remote.tags.join('、') || '无标签')
                  : '尚未读到最新标签，原输入仍保留。'}
              </p>
              <button
                type="button"
                disabled={tags.busy}
                onClick={() => void tags.reload()}
              >
                放弃输入并载入最新标签
              </button>
            </div>
          )}
          {tags.pending && <p>标签结果尚未确认，请先核对；当前输入会保留。</p>}
        </form>
      </div>
    </section>
  );
}
