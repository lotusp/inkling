import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  List,
  Code2,
  Library,
  Ellipsis,
  X,
  ListTree,
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
  const [panel, setPanel] = useState<
    'library' | 'assistant' | 'history' | null
  >(null);
  const [historyVisited, setHistoryVisited] = useState(false);
  const [navigationBusy, setNavigationBusy] = useState(false);
  const libraryButton = useRef<HTMLButtonElement>(null);
  const assistantButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const [outline, setOutline] = useState<HTMLElement[]>([]);
  function closePanel() {
    setPanel(null);
    if (panel === 'assistant') assistantButton.current?.focus();
    else if (panel === 'library') libraryButton.current?.focus();
    else
      header.current
        ?.querySelector<HTMLButtonElement>('[aria-label="文章菜单"]')
        ?.focus();
  }
  const [focused, setFocused] = useState(false);
  const health = useHealth();
  const access = useAccess();
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false },
      }),
    ],
    content: '',
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': '文章正文',
        'aria-multiline': 'true',
        spellcheck: 'false',
      },
    },
  });
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
    editor.commands.focus('start');
  }, [article.editable, editor]);
  const format = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      heading: editor?.isActive('heading', { level: 2 }) ?? false,
      list: editor?.isActive('bulletList') ?? false,
      code: editor?.isActive('codeBlock') ?? false,
      length: editor?.getText().replace(/\s/g, '').length ?? 0,
    }),
  });
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
  const tools = [
    {
      label: '二级标题',
      Icon: Heading2,
      active: format?.heading,
      run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: '加粗',
      Icon: Bold,
      active: format?.bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: '无序列表',
      Icon: List,
      active: format?.list,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: '代码块',
      Icon: Code2,
      active: format?.code,
      run: () => editor?.chain().focus().toggleCodeBlock().run(),
    },
  ];
  return (
    <div
      className={focused ? 'workbench is-focused' : 'workbench'}
      onKeyDown={(event) => {
        if (
          event.key !== 'Escape' ||
          event.nativeEvent.isComposing ||
          navigationBusy ||
          document.querySelector(':popover-open')
        )
          return;
        if (focused) setFocused(false);
        else if (panel) closePanel();
      }}
    >
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
          aria-expanded={panel === 'library'}
          disabled={access.status !== 'connected' || navigationBusy}
          onClick={() => setPanel(panel === 'library' ? null : 'library')}
        >
          <Library size={16} />
          文章库
        </button>
        <span className="header-space" />
        <button
          ref={assistantButton}
          aria-label="闻一 · AI 写作助手"
          title="闻一 · AI 写作助手"
          disabled={navigationBusy}
          aria-controls="assistant-panel"
          aria-expanded={panel === 'assistant'}
          onClick={() => setPanel(panel === 'assistant' ? null : 'assistant')}
        >
          <Sparkles size={20} />
        </button>
        <DeskMenu
          label="文章菜单"
          trigger={<Ellipsis size={20} />}
          disabled={navigationBusy}
        >
          <button
            disabled={!article.snapshot}
            onClick={() => {
              setHistoryVisited(true);
              setPanel('history');
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
        className={'workspace' + (!focused && panel ? ' with-' + panel : '')}
      >
        {access.status === 'connected' && (
          <ArticleNavigation
            article={article}
            navigate={navigate}
            open={!focused && panel === 'library'}
            close={closePanel}
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
              {article.snapshot && (
                <DeskMenu
                  label="本文大纲"
                  onOpen={() =>
                    setOutline(
                      Array.from(
                        editor?.view.dom.querySelectorAll<HTMLElement>(
                          'h2,h3',
                        ) ?? [],
                      ),
                    )
                  }
                  trigger={
                    <>
                      <ListTree size={15} />
                      大纲
                    </>
                  }
                >
                  {outline.map((heading, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        heading.scrollIntoView({ block: 'center' })
                      }
                    >
                      {heading.textContent || '未命名章节'}
                    </button>
                  ))}
                  {!outline.length && <small>还没有章节标题</small>}
                </DeskMenu>
              )}
            </div>
            {article.editable && (
              <div
                className="format-actions"
                role="toolbar"
                aria-label="正文格式"
              >
                {tools.map(({ label, Icon, active, run }) => (
                  <button
                    key={label}
                    aria-label={label}
                    title={label}
                    aria-pressed={active ?? false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={run}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
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
            <div className={`editor-wrap ${format?.length ? '' : 'is-empty'}`}>
              <EditorContent editor={editor} />
              {!format?.length && (
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
              <span>{format?.length ?? 0} 字</span>
            </div>
          </article>
        </main>
        <aside
          className="desk-rail"
          id="assistant-panel"
          aria-label="写作讨论"
          hidden={focused || panel !== 'assistant'}
        >
          <header className="rail-heading">
            <h2>闻一</h2>
            <button aria-label="关闭闻一" onClick={closePanel}>
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
          hidden={focused || panel !== 'history'}
          aria-label="历史侧栏"
        >
          <header className="rail-heading">
            <h2>版本历史</h2>
            <button aria-label="关闭版本历史" onClick={closePanel}>
              <X size={17} />
            </button>
          </header>
          {historyVisited && article.snapshot && (
            <VersionPanel
              article={article.snapshot}
              visible={panel === 'history' && !focused}
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
