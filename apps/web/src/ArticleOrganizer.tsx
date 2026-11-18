import { useEffect, useRef, useState } from 'react';
import { ArticleTitle, type ArticleListItem } from '@inkling/contracts';
import { useArticleTags } from './use-article-tags';
import { DeskDialog } from './DeskDialog';
export type OrganizerMode = 'rename' | 'tags';
export function ArticleOrganizer({
  mode,
  articleId,
  initialTitle: initial,
  renameTitle,
  locked = false,
  pendingTitle = false,
  onConfirmed,
  close,
}: {
  mode: OrganizerMode;
  articleId: string;
  initialTitle: string;
  renameTitle: (title: string) => Promise<unknown>;
  locked?: boolean;
  pendingTitle?: boolean;
  onConfirmed: (metadata: ArticleListItem) => void;
  close: (notice?: string) => void;
}) {
  const [title, setTitle] = useState(initial),
    [committedTitle, setCommittedTitle] = useState(initial),
    [renaming, setRenaming] = useState(false),
    [titleMessage, setTitleMessage] = useState('');
  const composing = useRef(false),
    renamingRef = useRef(false);
  const tags = useArticleTags(mode === 'tags' ? articleId : null, onConfirmed);
  const tagInput = useRef<HTMLTextAreaElement>(null);
  const tagsLoaded = !!tags.base;
  useEffect(() => {
    if (
      tagsLoaded &&
      tagInput.current?.closest('dialog')?.contains(document.activeElement)
    )
      tagInput.current.focus();
  }, [tagsLoaded]);
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
    const parsed = ArticleTitle.safeParse(title.trim());
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
      close('标题已保存。');
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
  const blocked = renaming || pendingTitle || tags.busy || tags.pending;
  function dismiss() {
    if (blocked || renamingRef.current) return;
    if (composing.current) {
      setTitleMessage('请先完成标题选词。');
      return;
    }
    if (tags.canClose()) close();
  }
  return (
    <DeskDialog
      title={mode === 'rename' ? '重命名文章' : '编辑标签'}
      close={dismiss}
      blocked={blocked}
    >
      {mode === 'rename' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
        >
          <label htmlFor="organizer-title">标题</label>
          <input
            id="organizer-title"
            value={title}
            disabled={pendingTitle || renaming}
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
          <button disabled={renaming || locked} type="submit">
            {pendingTitle ? '核对并重试标题' : '保存'}
          </button>
          {titleMessage && <p role="status">{titleMessage}</p>}
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void tags.save().then((saved) => {
              if (saved) close('标签已保存。');
            });
          }}
        >
          <label htmlFor="organizer-tags">每行一个标签</label>
          <textarea
            ref={tagInput}
            id="organizer-tags"
            rows={4}
            value={tags.text}
            disabled={!tags.base}
            onChange={(event) => tags.change(event.target.value)}
            onCompositionStart={tags.compositionStart}
            onCompositionEnd={tags.compositionEnd}
          />
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
      )}
    </DeskDialog>
  );
}
