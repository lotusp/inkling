import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  ArticleDocument,
  ArticleSnapshot,
  SaveResult,
  WorkspaceInfo,
  type SaveArticleCommand,
} from '@inkling/contracts';
import { api, ApiError } from './api';
export function useArticle(
  editor: Editor | null,
  title: string,
  setTitle: (value: string) => void,
  connected: boolean,
) {
  const [snapshot, setSnapshot] = useState<ArticleSnapshot | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'empty' | 'clean' | 'dirty' | 'saving' | 'error' | 'conflict'
  >('loading');
  const [message, setMessage] = useState('');
  const [editVersion, setEditVersion] = useState(0);
  const valid = useRef(true);
  const conflicted = useRef(false);
  const head = useRef<ArticleSnapshot | null>(null),
    latest = useRef<ArticleDocument | null>(null),
    editSeq = useRef(0),
    savedSeq = useRef(0),
    titleRef = useRef(title),
    inFlight = useRef<{
      command: SaveArticleCommand;
      seq: number;
      reconcile?: boolean;
    } | null>(null),
    busy = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    dirtySince = useRef<number | null>(null);
  titleRef.current = title;
  const display = useCallback(
    (article: ArticleSnapshot) => {
      valid.current = true;
      conflicted.current = false;
      head.current = article;
      latest.current = article.document;
      editSeq.current = 0;
      savedSeq.current = 0;
      inFlight.current = null;
      setSnapshot(article);
      setTitle(article.document.title);
      titleRef.current = article.document.title;
      editor?.commands.setContent(article.document.doc, { emitUpdate: false });
      latest.current = ArticleDocument.parse({
        ...article.document,
        doc: editor?.getJSON() ?? article.document.doc,
      });
      setStatus('clean');
      setMessage('');
    },
    [editor, setTitle],
  );
  useEffect(() => {
    if (!connected || !editor) return;
    let active = true;
    void (async () => {
      try {
        const workspace = WorkspaceInfo.parse(await api('/api/workspace'));
        if (!active) return;
        if (workspace.currentArticleId) {
          const article = ArticleSnapshot.parse(
            await api('/api/articles/' + workspace.currentArticleId),
          );
          if (active) display(article);
        } else setStatus('empty');
      } catch (error) {
        if (active) {
          setStatus('error');
          setMessage(error instanceof Error ? error.message : '无法加载稿件。');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [connected, editor, display]);
  const create = useCallback(async () => {
    try {
      setStatus('loading');
      const initial = ArticleSnapshot.parse(
        await api('/api/articles/ensure-current', 'POST', {
          mutationId: crypto.randomUUID(),
        }),
      );
      display(
        ArticleSnapshot.parse(await api('/api/articles/' + initial.articleId)),
      );
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '创建失败。');
    }
  }, [display]);
  const save = useCallback(async () => {
    if (
      busy.current ||
      conflicted.current ||
      !head.current ||
      !latest.current ||
      !valid.current ||
      editor?.view.composing
    )
      return;
    if (editSeq.current === savedSeq.current && !inFlight.current) return;
    const article = head.current;
    if (!inFlight.current)
      inFlight.current = {
        command: {
          mutationId: crypto.randomUUID(),
          baseRevisionId: article.headRevisionId,
          document: latest.current,
        },
        seq: editSeq.current,
      };
    const pending = inFlight.current;
    busy.current = true;
    setStatus('saving');
    try {
      let result: SaveResult | undefined;
      if (pending.reconcile) {
        try {
          result = SaveResult.parse(
            await api('/api/mutations/' + pending.command.mutationId),
          );
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
          const current = ArticleSnapshot.parse(
            await api('/api/articles/' + article.articleId),
          );
          if (current.headRevisionId !== pending.command.baseRevisionId)
            throw new ApiError(
              409,
              'REVISION_CONFLICT',
              '稿件已有新版本，请先比较两份内容。',
            );
        }
      }
      result ??= SaveResult.parse(
        await api(
          '/api/articles/' + article.articleId + '/content',
          'PUT',
          pending.command,
        ),
      );
      if (
        result.mutationId !== pending.command.mutationId ||
        result.articleId !== article.articleId
      )
        throw new Error('保存确认与当前请求不匹配。');
      const next = ArticleSnapshot.parse(
        await api('/api/articles/' + article.articleId),
      );
      if (next.headRevisionId !== result.appliedRevisionId) {
        inFlight.current = null;
        savedSeq.current = pending.seq;
        if (editSeq.current === pending.seq && valid.current) {
          display(next);
        } else {
          conflicted.current = true;
          head.current = next;
          setSnapshot(next);
          setStatus('conflict');
          setMessage('另一标签页已更新稿件，当前新输入已保留，请先比较。');
        }
        return;
      }
      head.current = next;
      setSnapshot(next);
      savedSeq.current = pending.seq;
      inFlight.current = null;
      setMessage('');
      if (!valid.current) {
        setStatus('error');
      } else if (editSeq.current === pending.seq) {
        setStatus('clean');
        dirtySince.current = null;
      } else setStatus('dirty');
    } catch (error) {
      pending.reconcile = true;
      conflicted.current =
        error instanceof ApiError && error.code === 'REVISION_CONFLICT';
      setStatus(conflicted.current ? 'conflict' : 'error');
      setMessage(
        error instanceof Error ? error.message : '保存未确认，请保留输入。',
      );
    } finally {
      busy.current = false;
    }
  }, [editor, display]);
  const changed = useCallback(() => {
    if (!editor || !head.current) return;
    const parsed = ArticleDocument.safeParse({
      schemaVersion: 1,
      title: titleRef.current,
      doc: editor.getJSON(),
    });
    if (!parsed.success) {
      valid.current = false;
      editSeq.current++;
      setEditVersion((x) => x + 1);
      setStatus('error');
      setMessage('正文结构或标题长度不符合保存要求。');
      return;
    }
    const wasInvalid = !valid.current;
    valid.current = true;
    if (
      JSON.stringify(latest.current) === JSON.stringify(parsed.data) &&
      !wasInvalid
    )
      return;
    if (!conflicted.current) setMessage('');
    latest.current = parsed.data;
    editSeq.current++;
    setEditVersion((x) => x + 1);
    dirtySince.current ??= Date.now();
    setStatus(conflicted.current ? 'conflict' : 'dirty');
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    editor.on('update', changed);
    const end = () => setEditVersion((x) => x + 1);
    const element = editor.view.dom;
    element.addEventListener('compositionend', end);
    return () => {
      editor.off('update', changed);
      element.removeEventListener('compositionend', end);
    };
  }, [editor, changed]);
  useEffect(() => {
    changed();
  }, [title, changed]);
  useEffect(() => {
    editor?.setEditable(snapshot !== null);
  }, [editor, snapshot]);
  useEffect(() => {
    if (status !== 'dirty') return;
    clearTimeout(timer.current);
    const wait = Math.min(
      1200,
      Math.max(0, 10000 - (Date.now() - (dirtySince.current ?? Date.now()))),
    );
    timer.current = setTimeout(() => {
      void save();
    }, wait);
    return () => clearTimeout(timer.current);
  }, [status, editVersion, save, snapshot]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [save]);
  return {
    snapshot,
    status,
    message,
    create,
    save,
    dirty: status !== 'clean' && status !== 'empty' && status !== 'loading',
  };
}
