import { useEffect, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Feather,
  Bold,
  Heading2,
  List,
  Code2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  ArrowUp,
  RefreshCw,
  CircleCheck,
  CircleAlert,
  MessageSquare,
} from 'lucide-react';
import { useHealth } from './use-health';
import { useAccess } from './access';
import { useArticle } from './use-article';
import { RecoveryPanel } from './RecoveryPanel';
import './styles.css';

export function App() {
  const [title, setTitle] = useState('');
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
  );
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
    <div className="workbench">
      <header className="app-header">
        <div className="brand">
          <Feather size={22} aria-hidden="true" />
          <span>Inkling</span>
        </div>
        <div className="header-divider" />
        <h1>写作工作台</h1>
        <span className="preview-label">本地预览</span>
        <button
          className="focus-button"
          aria-pressed={focused}
          onClick={() => setFocused((value) => !value)}
        >
          {focused ? (
            <PanelRightOpen size={17} aria-hidden="true" />
          ) : (
            <PanelRightClose size={17} aria-hidden="true" />
          )}
          {focused ? '显示讨论' : '专注写作'}
        </button>
      </header>
      <div className={`workspace ${focused ? 'is-focused' : ''}`}>
        <main className="document-pane">
          <div className="format-bar" role="toolbar" aria-label="正文格式">
            <span className="document-label">草稿</span>
            <div className="format-actions">
              {tools.map(({ label, Icon, active, run }) => (
                <button
                  key={label}
                  aria-label={label}
                  aria-pressed={active ?? false}
                  disabled={!editor || !article.editable}
                  onClick={run}
                >
                  <Icon size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
            <span className="format-note">慢慢想，清楚地写。</span>
          </div>
          <article className="writing-sheet">
            {article.status === 'empty' && (
              <button onClick={() => void article.create()}>开始写作</button>
            )}
            {!article.snapshot && access.status !== 'connected' && (
              <p>请先打开终端提供的本机访问链接。</p>
            )}
            <div className="document-eyebrow">
              <span />
              从一个值得追问的问题开始
            </div>
            <input
              className="article-title"
              aria-label="文章标题"
              placeholder="给这个想法一个标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onCompositionStart={article.compositionStart}
              onCompositionEnd={article.compositionEnd}
              disabled={!article.editable}
              maxLength={400}
            />
            <RecoveryPanel
              choices={article.recoveries}
              busy={article.recovering}
              message={article.message}
              recover={article.recover}
            />
            <div className={`editor-wrap ${format?.length ? '' : 'is-empty'}`}>
              <EditorContent editor={editor} />
              {!format?.length && (
                <div className="editor-placeholder" aria-hidden="true">
                  记下一段经历、一个疑问，或一个还没想清楚的判断……
                </div>
              )}
            </div>
            <div className="document-meta">
              <span>{format?.length ?? 0} 字</span>
              <span>中文写作</span>
            </div>
            <div
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
                      : article.status === 'empty'
                        ? '创建稿件后开始写作'
                        : '尚未保存'}
              </span>
              {(article.status === 'error' ||
                article.status === 'conflict') && (
                <>
                  <span>{article.message}</span>
                  {article.status === 'error' && (
                    <button onClick={() => void article.save()}>
                      重试保存
                    </button>
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
                      : '浏览器恢复副本不可用，请勿关闭页面；尚未保存的输入可能丢失。'}
                </div>
              )}
          </article>
        </main>
        <aside className="chat-pane" aria-label="写作讨论" hidden={focused}>
          <div className="chat-heading">
            <Sparkles size={17} aria-hidden="true" />
            <h2>与 Inkling 一起想</h2>
          </div>
          <div className="chat-empty">
            <div className="chat-symbol">
              <MessageSquare size={23} strokeWidth={1.4} aria-hidden="true" />
            </div>
            <h3>让想法慢慢变清楚</h3>
            <p>这里将是你推敲判断、寻找依据、整理表达的地方。</p>
            <div className="connection-note">AI 尚未接入</div>
            <p className="chat-detail">
              先从左侧记下想法。模型连接与文章上下文将在后续版本中加入。
            </p>
          </div>
          <div className="chat-composer">
            <label htmlFor="chat-input">写作讨论</label>
            <textarea
              id="chat-input"
              placeholder="这段判断站得住脚吗？"
              disabled
              rows={3}
            />
            <div className="composer-footer">
              <span>连接模型后可使用</span>
              <button aria-label="发送消息" disabled>
                <ArrowUp size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      </div>
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
