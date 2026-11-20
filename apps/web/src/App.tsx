import {
  useEffect,
  useLayoutEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { WritingSurface } from './muya/surface';
import {
  Library,
  Ellipsis,
  X,
  Sparkles,
  RefreshCw,
  CircleCheck,
  CircleAlert,
} from 'lucide-react';
import { useHealth } from './use-health';
import { useAccess } from './access';
import { useArticle, type ArticleSession } from './use-article';
import { ArticleSaveFeedback } from './ArticleSaveFeedback';
import { ArticleNavigation } from './ArticleNavigation';
import { RecoveryPanel } from './RecoveryPanel';
import { ConflictPanel } from './ConflictPanel';
import { WritingTools } from './muya/WritingTools';
import { ArticleOutline } from './ArticleOutline';
import { DeskMenu } from './DeskMenu';
import { VersionPanel } from './VersionPanel';
import { DamagedArticlePanel } from './DamagedArticlePanel';
import { HistoryCapacity } from './HistoryCapacity';
import './styles.css';

export function App() {
  const [session, setSession] = useState<{
    generation: number;
    initial?: ArticleSession;
  }>({ generation: 0 });
  return (
    <Workbench
      key={session.generation}
      initial={session.initial}
      navigate={(initial) =>
        setSession((previous) => ({
          generation: previous.generation + 1,
          initial,
        }))
      }
    />
  );
}
function Workbench({
  initial,
  navigate,
}: {
  initial?: ArticleSession;
  navigate: (session: ArticleSession) => void;
}) {
  const [title, setTitle] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(!!initial?.libraryOpen);
  const [panel, setPanel] = useState<'assistant' | 'history' | null>(null);
  const [lastRail, setLastRail] = useState<'left' | 'right'>('left');
  const [compact, setCompact] = useState(
    () => matchMedia('(max-width:1100px)').matches,
  );
  useEffect(() => {
    const query = matchMedia('(max-width:1100px)');
    const change = () => setCompact(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const [historyVisit, setHistoryVisit] = useState(0);
  const [navigationBusy, setNavigationBusy] = useState(false);
  const libraryButton = useRef<HTMLButtonElement>(null);
  const assistantButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const [focused, setFocused] = useState(false);
  const leftVisible =
    !focused && libraryOpen && (!compact || !panel || lastRail === 'left');
  const rightVisible =
    !focused && !!panel && (!compact || !libraryOpen || lastRail === 'right');
  function closeLibrary() {
    setLibraryOpen(false);
    libraryButton.current?.focus();
  }
  function closeRight() {
    setPanel(null);
    if (matchMedia('(max-width:820px)').matches) setLibraryOpen(false);
    if (panel === 'assistant') assistantButton.current?.focus();
    else
      header.current
        ?.querySelector<HTMLButtonElement>('[aria-label="文章菜单"]')
        ?.focus();
  }
  function openRight(view: 'assistant' | 'history') {
    setPanel(view);
    setLastRail('right');
  }
  const health = useHealth();
  const access = useAccess();
  const host = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<WritingSurface | null>(null);
  const [length, setLength] = useState(0);
  const [empty, setEmpty] = useState(true);
  useLayoutEffect(() => {
    if (!host.current) return;
    const surface = new WritingSurface(host.current);
    setEditor(surface);
    const count = () => {
      const container = surface.dom.querySelector('.mu-container');
      if (!container) return;
      const fields = container.querySelectorAll(
        '.mu-content:not(.mu-language-input)',
      );
      let characters = 0;
      for (const field of fields) {
        const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (
            !walker.currentNode.parentElement?.closest(
              '.mu-remove,.mu-output-remove,.mu-inline-image',
            )
          ) {
            characters += (walker.currentNode.textContent ?? '').replace(
              /[\s\u200b]/g,
              '',
            ).length;
          }
        }
      }
      setLength(characters);
      setEmpty(
        container.childElementCount === 1 &&
          !!container.firstElementChild?.matches('p.mu-paragraph') &&
          !container.textContent?.replace(/[\s\u200b]/g, '') &&
          !container.querySelector('img'),
      );
    };
    surface.dom.addEventListener('inkling-load', count);
    const unsubscribe = surface.subscribe(count);
    return () => {
      surface.dom.removeEventListener('inkling-load', count);
      unsubscribe();
      surface.destroy();
    };
  }, []);
  const article = useArticle(
    editor,
    title,
    setTitle,
    access.status === 'connected',
    initial,
  );
  const focusNewArticle = useRef(initial?.focusBody);
  useEffect(() => {
    if (!focusNewArticle.current || !article.editable || !editor) return;
    focusNewArticle.current = false;
    editor.focus();
  }, [article.editable, editor]);
  const hasText = article.dirty;
  useEffect(() => {
    if (!hasText) return;
    const confirmLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [hasText]);
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== 'Escape' ||
      event.isComposing ||
      event.defaultPrevented ||
      navigationBusy ||
      document.querySelector(':popover-open,dialog[open]')
    )
      return;
    if (focused) setFocused(false);
    else if (leftVisible && (!rightVisible || lastRail === 'left'))
      closeLibrary();
    else if (rightVisible) closeRight();
  });
  useEffect(() => {
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);
  return (
    <div className={focused ? 'workbench is-focused' : 'workbench'}>
      <header ref={header} className="app-header" hidden={focused}>
        <img
          className="brand"
          src="/inkling-logo.svg"
          width={112}
          height={32}
          alt="Inkling"
        />
        <span className="header-divider" />
        <button
          ref={libraryButton}
          aria-controls="article-library"
          aria-expanded={leftVisible}
          disabled={access.status !== 'connected' || navigationBusy}
          onClick={() => {
            if (leftVisible) closeLibrary();
            else {
              setLastRail('left');
              setLibraryOpen(true);
            }
          }}
        >
          <Library size={16} />
          文章库
        </button>
        <span className="header-space" />
        <button
          ref={assistantButton}
          aria-label="闻一 · AI 写作助手"
          title="闻一 · AI 写作助手"
          disabled={navigationBusy || article.stateReadOnly}
          aria-controls="assistant-panel"
          aria-expanded={rightVisible && panel === 'assistant'}
          onClick={() =>
            rightVisible && panel === 'assistant'
              ? closeRight()
              : openRight('assistant')
          }
        >
          <Sparkles size={20} />
        </button>
        <DeskMenu
          label="文章菜单"
          trigger={<Ellipsis size={20} />}
          disabled={navigationBusy}
        >
          <button
            disabled={!article.snapshot || article.articleState === 'trashed'}
            onClick={() => {
              setHistoryVisit((n) => n + 1);
              openRight('history');
            }}
          >
            版本历史
          </button>
          <button disabled title="文件导出尚未接入">
            导出文件…
          </button>
          <button disabled title="博客发布尚未接入">
            发布到博客…
          </button>
          <hr />
          <button disabled title="写作偏好尚未接入">
            写作偏好
          </button>
          <button onClick={() => setFocused(true)}>专注写作</button>
        </DeskMenu>
      </header>
      {focused && (
        <button className="exit-focus" onClick={() => setFocused(false)}>
          退出专注
        </button>
      )}
      <div
        className={
          'workspace' +
          (leftVisible ? ' with-library' : '') +
          (rightVisible ? ' with-' + panel : '')
        }
      >
        {access.status === 'connected' && (
          <ArticleNavigation
            article={article}
            navigate={navigate}
            open={leftVisible}
            initialView={initial?.libraryView}
            close={closeLibrary}
            busyChanged={setNavigationBusy}
          />
        )}
        <main className="document-pane" aria-label="写作工作台">
          <article className="writing-sheet">
            {article.status === 'empty' && (
              <button onClick={() => void article.create()}>开始写作</button>
            )}
            {!article.snapshot && access.status !== 'connected' && (
              <p>请先打开终端提供的本机访问链接。</p>
            )}
            <div className="document-eyebrow">
              <span />
              {article.articleState === 'archived' ? '已归档' : '草稿'}
            </div>
            <div className="title-row">
              <input
                className="article-title"
                aria-label="文章标题"
                placeholder="文章标题"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onCompositionStart={article.compositionStart}
                onCompositionEnd={article.compositionEnd}
                disabled={!article.editable}
                maxLength={400}
              />
              {article.snapshot && editor && (
                <ArticleOutline editor={editor} editable={article.editable} />
              )}
            </div>
            {editor && (
              <WritingTools editor={editor} editable={article.editable} />
            )}
            {article.snapshot && article.stateReadOnly && (
              <section className="article-state" aria-label="文章状态">
                <p role="status">
                  {article.articleState === 'archived'
                    ? '文章已归档，当前为只读。'
                    : article.articleState === 'trashed'
                      ? '文章已移入回收站，本页输入仍保留。'
                      : '文章状态尚未确认，已暂停编辑。'}
                </p>
                <button
                  disabled={article.navigationLocked}
                  onClick={() => void article.refreshState()}
                >
                  核对文章状态
                </button>
                <p>
                  可保留草稿后切换文章；重新启用编辑前请先恢复文章状态并核对。
                </p>
              </section>
            )}
            {article.positionUnavailable && (
              <p className="backup-notice" role="status">
                编辑位置无法保留，正文保存不受影响。
              </p>
            )}
            {article.snapshot && <HistoryCapacity article={article.snapshot} />}
            {article.damagedArticleId && (
              <DamagedArticlePanel articleId={article.damagedArticleId} />
            )}
            <RecoveryPanel
              choices={article.recoveries}
              busy={article.recovering || article.navigationLocked}
              readOnly={article.stateReadOnly}
              message={article.message}
              recover={article.recover}
              keepServer={article.keepServer}
              discard={article.discard}
              clientId={article.clientId}
            />
            <div className={`editor-wrap ${empty ? 'is-empty' : ''}`}>
              <div ref={host} className="writing-body" />
              {empty && (
                <div className="editor-placeholder" aria-hidden="true">
                  记下一段经历、一个疑问，或一个还没想清楚的判断……
                </div>
              )}
            </div>
            {article.hasConflict && (
              <div className="conflict-actions">
                <button
                  disabled={article.conflictBusy}
                  onClick={() => void article.compare()}
                >
                  {article.conflictBusy ? '正在核对冲突…' : '查看冲突'}
                </button>
                {article.conflictMessage && (
                  <p role="alert">{article.conflictMessage}</p>
                )}
                <button
                  disabled={article.conflictBusy || article.recovering}
                  onClick={() => void article.keepServer()}
                >
                  保留本页草稿，使用服务器版本
                </button>
              </div>
            )}
            {article.comparison && article.document && (
              <ConflictPanel
                local={article.document}
                server={article.comparison}
                canMerge={article.canMerge}
                prepared={article.mergePrepared}
                prepare={article.prepareMerge}
                confirm={article.confirmMerge}
              />
            )}
            <div className="document-meta">
              <span>{length ?? 0} 字</span>
            </div>
          </article>
        </main>
        <aside
          className="desk-rail"
          id="assistant-panel"
          aria-label="写作讨论"
          hidden={!rightVisible || panel !== 'assistant'}
        >
          <header className="rail-heading">
            <h2>闻一</h2>
            <button aria-label="关闭闻一" onClick={closeRight}>
              <X size={17} />
            </button>
          </header>
          <p className="rail-note">AI 尚未接入</p>
          <textarea
            aria-label="给闻一的消息"
            placeholder="和闻一聊聊这篇文章…"
            disabled
          />
          <button aria-label="发送消息" disabled>
            发送
          </button>
        </aside>
        <aside
          className="desk-rail history-rail"
          hidden={!rightVisible || panel !== 'history'}
          aria-label="历史侧栏"
        >
          <header className="rail-heading">
            <h2>版本历史</h2>
            <button aria-label="关闭版本历史" onClick={closeRight}>
              <X size={17} />
            </button>
          </header>
          {historyVisit > 0 && article.snapshot && (
            <VersionPanel
              article={article.snapshot}
              visit={historyVisit}
              visible={rightVisible && panel === 'history'}
              readOnly={article.stateReadOnly || article.navigationLocked}
              currentDocument={article.currentDocument}
              flush={article.flushForVersion}
              reviewRestore={article.reviewRestore}
              confirmRestore={article.confirmRestore}
            />
          )}
        </aside>
      </div>
      <ArticleSaveFeedback article={article} />
      <footer className="app-footer">
        <div
          className={`service-state ${health.status}`}
          role="status"
          aria-live="polite"
        >
          {health.status === 'connected' ? (
            <CircleCheck size={14} aria-hidden="true" />
          ) : (
            <CircleAlert size={14} aria-hidden="true" />
          )}
          {health.status === 'connected'
            ? '本地服务已连接'
            : health.status === 'checking'
              ? '正在连接本地服务…'
              : '本地服务未连接'}
        </div>
        {health.status === 'unavailable' && (
          <button className="retry-button" onClick={health.retry}>
            <RefreshCw size={13} aria-hidden="true" />
            重新连接
          </button>
        )}
        <span className="footer-note">
          {access.status === 'connected'
            ? '工作空间已连接'
            : access.status === 'checking'
              ? '正在连接工作空间…'
              : '工作空间未连接'}
        </span>
        {access.status === 'disconnected' && (
          <button
            className="retry-button"
            onClick={access.reconnect}
            title="在终端运行 corepack pnpm local:access，打开输出的本机访问链接。"
          >
            连接工作空间
          </button>
        )}
      </footer>
    </div>
  );
}
