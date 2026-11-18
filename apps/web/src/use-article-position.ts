import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Editor } from '@tiptap/react';
import { Selection, TextSelection } from '@tiptap/pm/state';
import type { ArticleSnapshot } from '@inkling/contracts';
import { stableJson } from './draft-store';
interface PositionContext {
  article: ArticleSnapshot | null;
  workspaceId?: string;
  clean: boolean;
  composing: boolean;
  navigating: boolean;
}
interface Position {
  version: 1;
  workspaceId: string;
  articleId: string;
  revisionId: string;
  anchor: number;
  head: number;
  scrollTop: number;
}
function positionKey(workspaceId: string, articleId: string) {
  return `inkling:position:v1:${workspaceId}:${articleId}`;
}
function readPosition(
  raw: string | null,
  workspaceId: string,
  article: ArticleSnapshot,
  editor: Editor,
): Position | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const r = Object.fromEntries(Object.entries(value));
    if (
      r.version !== 1 ||
      r.workspaceId !== workspaceId ||
      r.articleId !== article.articleId ||
      r.revisionId !== article.headRevisionId
    )
      return null;
    const { anchor, head, scrollTop } = r;
    if (
      typeof anchor !== 'number' ||
      typeof head !== 'number' ||
      typeof scrollTop !== 'number' ||
      !Number.isSafeInteger(anchor) ||
      !Number.isSafeInteger(head) ||
      anchor < 1 ||
      head < 1 ||
      anchor > editor.state.doc.content.size ||
      head > editor.state.doc.content.size ||
      !editor.state.doc.resolve(anchor).parent.inlineContent ||
      !editor.state.doc.resolve(head).parent.inlineContent ||
      !Number.isFinite(scrollTop) ||
      scrollTop < 0 ||
      scrollTop > editor.view.dom.getBoundingClientRect().height
    )
      return null;
    return {
      version: 1,
      workspaceId,
      articleId: article.articleId,
      revisionId: article.headRevisionId,
      anchor,
      head,
      scrollTop,
    };
  } catch {
    return null;
  }
}
export function useArticlePosition(
  editor: Editor | null,
  getContext: () => PositionContext,
  revisionId: string | undefined,
  clean: boolean,
) {
  const context = useRef(getContext);
  context.current = getContext;
  const [unavailable, setUnavailable] = useState(false);
  const interacted = useRef(false),
    restoring = useRef(false),
    scrollTop = useRef(0);
  const frame = useRef<number | undefined>(undefined),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelRestore = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    restoring.current = false;
  }, []);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const current = context.current();
    if (
      !editor ||
      !current.article ||
      !current.workspaceId ||
      !interacted.current ||
      restoring.current ||
      !current.clean ||
      current.composing
    )
      return;
    if (
      stableJson(editor.getJSON()) !== stableJson(current.article.document.doc)
    )
      return;
    const selection = editor.state.selection;
    if (!(selection instanceof TextSelection)) return;
    const bounds = editor.view.dom.getBoundingClientRect();
    const offset = -bounds.top;
    if (offset >= 0 && offset <= bounds.height) scrollTop.current = offset;
    const value: Position = {
      version: 1,
      workspaceId: current.workspaceId,
      articleId: current.article.articleId,
      revisionId: current.article.headRevisionId,
      anchor: selection.anchor,
      head: selection.head,
      scrollTop: scrollTop.current,
    };
    try {
      localStorage.setItem(
        positionKey(value.workspaceId, value.articleId),
        JSON.stringify(value),
      );
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, [editor]);
  const [request, setRequest] = useState<{
    workspaceId: string;
    article: ArticleSnapshot;
    allowRestore: boolean;
  } | null>(null);
  const open = useCallback(
    (workspaceId: string, article: ArticleSnapshot, allowRestore: boolean) => {
      setRequest({ workspaceId, article, allowRestore });
    },
    [],
  );
  useLayoutEffect(() => {
    if (!request) return;
    const { workspaceId, article, allowRestore } = request;
    cancelRestore();
    clearTimeout(timer.current);
    interacted.current = false;
    scrollTop.current = 0;
    if (!editor || !allowRestore) return;
    let saved: Position | null = null;
    try {
      saved = readPosition(
        localStorage.getItem(positionKey(workspaceId, article.articleId)),
        workspaceId,
        article,
        editor,
      );
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
    restoring.current = true;
    frame.current = requestAnimationFrame(() => {
      const current = context.current();
      if (
        current.article?.headRevisionId !== article.headRevisionId ||
        current.article.articleId !== article.articleId ||
        !current.clean ||
        current.composing ||
        current.navigating
      ) {
        cancelRestore();
        return;
      }
      const selection = saved
        ? TextSelection.create(editor.state.doc, saved.anchor, saved.head)
        : Selection.atStart(editor.state.doc);
      editor.view.dispatch(editor.state.tr.setSelection(selection));
      scrollTop.current = saved?.scrollTop ?? 0;
      window.scrollTo({
        top:
          scrollTop.current > 0
            ? window.scrollY +
              editor.view.dom.getBoundingClientRect().top +
              scrollTop.current
            : 0,
        behavior: 'instant',
      });
      frame.current = requestAnimationFrame(cancelRestore);
    });

    return cancelRestore;
  }, [request, editor, cancelRestore]);
  useEffect(() => {
    if (!editor) return;
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const schedule = () => {
      const current = context.current();
      if (restoring.current || current.navigating || current.composing) return;
      interacted.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 150);
    };
    const scroll = () => {
      const bounds = editor.view.dom.getBoundingClientRect();
      if (bounds.top <= 0 && bounds.bottom >= 0) schedule();
    };
    const input = () => {
      cancelRestore();
      interacted.current = true;
    };
    const selection = ({
      transaction,
    }: {
      transaction: { docChanged: boolean };
    }) => {
      if (!transaction.docChanged) schedule();
    };
    editor.on('selectionUpdate', selection);
    editor.on('update', input);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pointerdown', cancelRestore, true);
    window.addEventListener('keydown', cancelRestore, true);
    window.addEventListener('wheel', cancelRestore, { passive: true });
    window.addEventListener('compositionstart', cancelRestore, true);
    return () => {
      cancelRestore();
      clearTimeout(timer.current);
      history.scrollRestoration = previous;
      editor.off('selectionUpdate', selection);
      editor.off('update', input);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pointerdown', cancelRestore, true);
      window.removeEventListener('keydown', cancelRestore, true);
      window.removeEventListener('wheel', cancelRestore);
      window.removeEventListener('compositionstart', cancelRestore, true);
    };
  }, [editor, cancelRestore, flush]);
  useEffect(() => {
    if (clean) flush();
  }, [revisionId, clean, flush]);
  return { open, flush, unavailable };
}
