import { useRef, useState } from 'react';
import { ArticleSnapshot, WorkspaceInfo } from '@inkling/contracts';
import { api, ApiError } from './api';
import { ArticleLibrary } from './ArticleLibrary';
import { Library } from 'lucide-react';
import { ownDraftClient } from './draft-store';
import type { ArticleSession, useArticle } from './use-article';
type Intent = { mutationId: string; articleId?: string; title?: string };
export function ArticleNavigation({
  article,
  navigate,
}: {
  article: ReturnType<typeof useArticle>;
  navigate: (session: ArticleSession) => void;
}) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [message, setMessage] = useState('');
  const [choice, setChoice] = useState(false);
  const [running, setRunning] = useState(false);
  const executing = useRef(false),
    sent = useRef(false);
  async function execute(target: Intent, mode: 'save' | 'keep') {
    if (executing.current) return;
    executing.current = true;
    setRunning(true);
    setMessage('');
    let release: (() => void) | undefined;
    let writeReturned = false;
    const previouslyUnconfirmed = sent.current;
    try {
      release = await article.prepareNavigation(mode);
      sent.current = true;
      const result = ArticleSnapshot.parse(
        await api(
          target.articleId
            ? '/api/articles/' + target.articleId + '/open'
            : '/api/articles',
          'POST',
          target.articleId
            ? { mutationId: target.mutationId }
            : { mutationId: target.mutationId, title: target.title ?? '' },
        ),
      );
      writeReturned = true;
      // Replay is immutable; always read the latest target before replacing the old editor.
      const snapshot = ArticleSnapshot.parse(
        await api('/api/articles/' + result.articleId),
      );
      const workspace = WorkspaceInfo.parse(await api('/api/workspace'));
      // All source writes have settled. Release its owner only at the final handoff.
      try {
        await ownDraftClient(true);
      } catch {
        /* The destination reports unavailable browser protection. */
      }
      navigate({ workspaceId: workspace.workspaceId, article: snapshot });
    } catch (error) {
      release?.();
      // A definitive first rejection is cancellable. An earlier unknown outcome
      // still needs reconciliation even if a later retry is rejected.
      if (
        !writeReturned &&
        !previouslyUnconfirmed &&
        error instanceof ApiError &&
        [400, 401, 403, 404, 409].includes(error.status)
      )
        sent.current = false;
      setMessage(error instanceof Error ? error.message : '切换失败，请重试。');
    } finally {
      executing.current = false;
      setRunning(false);
    }
  }
  function request(target: Intent) {
    if (intent || executing.current) return;
    setIntent(target);
    setMessage('');
    sent.current = false;
    try {
      if (article.navigationState()) {
        setChoice(true);
      } else {
        setChoice(false);
        void execute(target, 'save');
      }
    } catch (error) {
      setChoice(true);
      setMessage(error instanceof Error ? error.message : '暂时无法切换。');
    }
  }
  function retry() {
    if (!intent) return;
    try {
      if (article.navigationState()) {
        setChoice(true);
        setMessage('');
      } else void execute(intent, 'save');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '请稍后重试。');
    }
  }
  return (
    <section className="article-navigation" aria-label="文章导航">
      <button
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Library size={16} aria-hidden="true" />
        文章库
      </button>
      {open && (
        <ArticleLibrary
          current={article.snapshot}
          disabled={!!intent}
          openArticle={(articleId) =>
            request({ mutationId: crypto.randomUUID(), articleId })
          }
          createArticle={(title) =>
            request({ mutationId: crypto.randomUUID(), title })
          }
          close={() => setOpen(false)}
        />
      )}
      {intent && (
        <section
          className="navigation-confirmation"
          role="region"
          aria-label="切换文章确认"
        >
          <h2>{intent.articleId ? '打开另一篇文章' : '创建新文章'}</h2>
          <p>切换前请确认当前输入已保存，或保留恢复副本供返回后继续写作。</p>
          {choice && (
            <>
              <button
                disabled={running}
                onClick={() => void execute(intent, 'save')}
              >
                保存后切换
              </button>
              <button
                disabled={running}
                onClick={() => void execute(intent, 'keep')}
              >
                保留草稿并切换
              </button>
            </>
          )}
          {message && <p role="alert">{message}</p>}
          {message && (
            <button disabled={running} onClick={retry}>
              重试切换
            </button>
          )}
          {!sent.current && (
            <button
              disabled={running}
              onClick={() => {
                setIntent(null);
                setChoice(false);
                setMessage('');
              }}
            >
              取消切换
            </button>
          )}
          {running && <p role="status">正在保护输入并打开文章…</p>}
          {sent.current && !running && (
            <p>打开结果尚未确认。请重试同一次操作，避免重复新建。</p>
          )}
        </section>
      )}
    </section>
  );
}
