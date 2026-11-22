import { useEffect, useRef, useState } from 'react';
import {
  ArticleSnapshot,
  type ArticleDocument,
  WorkspaceInfo,
  type ArticleListItem,
} from '@inkling/contracts';
import { api, ApiError } from './api';
import { ArticleLibrary } from './ArticleLibrary';
import { LibraryArticleOrganizer } from './LibraryArticleOrganizer';
import { ArticleOrganizer, type OrganizerMode } from './ArticleOrganizer';
import { ArticleLifecycle, type LifecycleTarget } from './ArticleLifecycle';
import { ownDraftClient } from './draft-store';
import type { ArticleSession, LibraryView, useArticle } from './use-article';
type Intent = {
  mutationId: string;
  articleId?: string;
  document?: ArticleDocument;
};
export function ArticleNavigation({
  article,
  navigate,
  open,
  initialView,
  close,
  busyChanged,
}: {
  article: ReturnType<typeof useArticle>;
  open: boolean;
  initialView?: LibraryView;
  close: () => void;
  busyChanged: (busy: boolean) => void;
  navigate: (session: ArticleSession) => void;
}) {
  const [organizing, setOrganizing] = useState<{
    id: string;
    mode: OrganizerMode;
  } | null>(null);
  const [confirmedMetadata, setConfirmedMetadata] =
    useState<ArticleListItem | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleTarget | null>(null);
  const [libraryView, setLibraryView] = useState<LibraryView>(
    initialView ?? { shelf: 'active', filters: { q: '', tag: '' } },
  );
  const [libraryGeneration, setLibraryGeneration] = useState(0);
  const [lifecycleMessage, setLifecycleMessage] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [message, setMessage] = useState('');
  const [choice, setChoice] = useState(false);
  const [running, setRunning] = useState(false);
  const executing = useRef(false),
    sent = useRef(false);
  const busy = !!intent || !!organizing || !!lifecycle;
  useEffect(() => {
    busyChanged(busy);
  }, [busy, busyChanged]);
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
          {
            mutationId: target.mutationId,
            ...(target.document && { document: target.document }),
          },
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
      navigate({
        workspaceId: workspace.workspaceId,
        article: snapshot,
        focusBody: !target.articleId,
        libraryOpen:
          !!target.articleId && !matchMedia('(max-width:820px)').matches,
        libraryView,
      });
    } catch (error) {
      release?.();
      // A definitive first rejection is cancellable. An earlier unknown outcome
      // still needs reconciliation even if a later retry is rejected.
      if (
        !writeReturned &&
        !previouslyUnconfirmed &&
        error instanceof ApiError &&
        [400, 401, 403, 404, 409, 413, 422].includes(error.status)
      )
        sent.current = false;
      setMessage(error instanceof Error ? error.message : '切换失败，请重试。');
    } finally {
      executing.current = false;
      setRunning(false);
    }
  }
  function request(target: Intent) {
    if (intent || organizing || lifecycle || executing.current) return;
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
  function finishOrganizing(notice = '') {
    setMessage(notice);
    setOrganizing(null);
    setLibraryGeneration((n) => n + 1);
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
  function requestLifecycle(target: LifecycleTarget) {
    if (intent || organizing || lifecycle || executing.current) return;
    try {
      article.navigationState();
      setLifecycleMessage('');
      setLifecycle(target);
    } catch (error) {
      setLifecycleMessage(
        error instanceof Error ? error.message : '暂时无法操作。',
      );
    }
  }
  return (
    <section
      className="article-navigation"
      id="article-library"
      aria-label="文章导航"
      hidden={!open}
    >
      {lifecycleMessage && <p role="alert">{lifecycleMessage}</p>}
      {lifecycle && (
        <ArticleLifecycle
          target={lifecycle}
          article={article}
          navigate={navigate}
          close={() => setLifecycle(null)}
          changed={() => setLibraryGeneration((n) => n + 1)}
        />
      )}
      {open && (
        <div hidden={!!lifecycle}>
          <ArticleLibrary
            refreshGeneration={libraryGeneration}
            refreshArticleState={article.refreshState}
            manageState={requestLifecycle}
            initialView={libraryView}
            viewChanged={setLibraryView}
            restoreArticle={(articleId) =>
              requestLifecycle({ articleId, action: 'restore' })
            }
            current={article.snapshot}
            confirmedMetadata={confirmedMetadata}
            organizeArticle={(id, mode) => {
              setMessage('');
              setOrganizing({ id, mode });
            }}
            disabled={busy}
            openArticle={(articleId) =>
              request({ mutationId: crypto.randomUUID(), articleId })
            }
            importArticle={(document) =>
              request({ mutationId: crypto.randomUUID(), document })
            }
            createArticle={() => request({ mutationId: crypto.randomUUID() })}
            close={close}
          />
        </div>
      )}
      {!intent && !organizing && message && (
        <p role="status" className="library-notice">
          {message}
        </p>
      )}
      {organizing &&
        (organizing.id === article.snapshot?.articleId ? (
          <ArticleOrganizer
            articleId={organizing.id}
            mode={organizing.mode}
            initialTitle={article.document?.title ?? ''}
            renameTitle={article.renameTitle}
            locked={article.navigationLocked}
            onConfirmed={setConfirmedMetadata}
            close={finishOrganizing}
          />
        ) : (
          <LibraryArticleOrganizer
            key={organizing.id}
            articleId={organizing.id}
            mode={organizing.mode}
            onConfirmed={setConfirmedMetadata}
            close={finishOrganizing}
          />
        ))}
      {intent && (
        <section
          className="navigation-confirmation"
          role="region"
          aria-label="切换文章确认"
        >
          <h2>
            {intent.articleId
              ? '打开另一篇文章'
              : intent.document
                ? '导入新文章'
                : '创建新文章'}
          </h2>
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
