import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type { useArticle } from './use-article';
import { downloadRawDrafts } from './draft-rescue';

export function ArticleSaveFeedback({
  article,
}: {
  article: ReturnType<typeof useArticle>;
}) {
  const [showSaved, setShowSaved] = useState(true);
  const articleId = article.snapshot?.articleId;
  const saveProblem =
    article.status === 'error' ||
    article.hasConflict ||
    article.backup === 'unavailable' ||
    (article.stateReadOnly && article.dirty);
  useEffect(() => {
    if (article.status !== 'clean') {
      setShowSaved(true);
      return;
    }
    const timer = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [article.status]);
  return (
    <div className={saveProblem ? 'save-problem' : 'save-feedback'}>
      <div
        hidden={
          (article.status === 'clean' && !showSaved) ||
          article.status === 'empty'
        }
        className={`save-notice ${article.status === 'clean' ? 'is-saved' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {article.status === 'clean' ? (
          <CircleCheck size={15} aria-hidden="true" />
        ) : (
          <CircleAlert size={15} aria-hidden="true" />
        )}
        <span>
          {article.status === 'clean'
            ? '已保存'
            : article.status === 'saving'
              ? '保存中…'
              : article.status === 'loading'
                ? '正在打开稿件…'
                : '草稿未保存'}
        </span>
        {(article.status === 'error' || article.status === 'conflict') && (
          <>
            <span>{article.message}</span>
            {article.status === 'error' && (
              <button onClick={() => void article.save()}>重试保存</button>
            )}
          </>
        )}
      </div>
      {article.snapshot &&
        article.recoveries.length === 0 &&
        article.backup !== 'idle' && (
          <div className="backup-notice" aria-live="polite">
            {article.backup === 'durable'
              ? '浏览器恢复副本已更新'
              : article.backup === 'pending'
                ? '正在更新浏览器恢复副本…'
                : '浏览器恢复副本不可用。未保存内容仅留在本页，请先重试保存或下载备份。'}
          </div>
        )}
      {article.snapshot && article.recoveries.length === 0 && saveProblem && (
        <div className="rescue-actions">
          <button onClick={article.download}>下载备份</button>
          <span>包含正文与恢复信息的 JSON，不含访问凭证。</span>
        </div>
      )}
      {articleId && article.unreadableDrafts.length > 0 && (
        <div className="rescue-actions">
          <span>有浏览器副本的格式无法识别，原始内容已保留。</span>
          <button
            onClick={() =>
              downloadRawDrafts(articleId, article.unreadableDrafts)
            }
          >
            下载原始副本
          </button>
        </div>
      )}
    </div>
  );
}
