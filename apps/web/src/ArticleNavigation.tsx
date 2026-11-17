import { useRef, useState } from 'react';
import {
  ArticleListPage,
  ArticleSnapshot,
  WorkspaceInfo,
} from '@inkling/contracts';
import { api } from './api';
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
  const [items, setItems] = useState<ArticleListPage['items']>([]);
  const [listError, setListError] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [message, setMessage] = useState('');
  const [choice, setChoice] = useState(false);
  const [running, setRunning] = useState(false);
  const executing = useRef(false),
    sent = useRef(false);
  async function load() {
    try {
      setListError('');
      setItems(ArticleListPage.parse(await api('/api/articles')).items);
    } catch {
      setListError('文章库读取失败，请重试。');
    }
  }
  async function execute(target: Intent, mode: 'save' | 'keep') {
    if (executing.current) return;
    executing.current = true;
    setRunning(true);
    setMessage('');
    let release: (() => void) | undefined;
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
          if (!open) void load();
        }}
      >
        文章库
      </button>
      {open && (
        <div aria-label="文章列表" role="region">
          <button
            disabled={!!intent}
            onClick={() => request({ mutationId: crypto.randomUUID() })}
          >
            新建文章
          </button>
          {listError && (
            <p role="alert">
              {listError}
              <button onClick={() => void load()}>重试列表</button>
            </p>
          )}
          {items.map((item) => (
            <button
              key={item.articleId}
              disabled={
                !!intent || item.articleId === article.snapshot?.articleId
              }
              onClick={() =>
                request({
                  mutationId: crypto.randomUUID(),
                  articleId: item.articleId,
                })
              }
            >
              打开：{item.title || '未命名文章'}
            </button>
          ))}
        </div>
      )}
      {intent && (
        <section role="region" aria-label="切换文章确认">
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
          {sent.current && message && (
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
