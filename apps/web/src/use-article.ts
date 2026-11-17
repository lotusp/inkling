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
import { connectWorkspace } from './access';
import { downloadRescue } from './draft-rescue';
import {
  listDrafts,
  ownDraftClient,
  putDraft,
  removeRecoveredSource,
  requestHash,
  stableJson,
  type DraftRecord,
  type PendingSave,
  type RecoveryChoice,
} from './draft-store';
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [backup, setBackup] = useState<
    'idle' | 'pending' | 'durable' | 'unavailable'
  >('idle');
  const [recoveries, setRecoveries] = useState<RecoveryChoice[]>([]);
  const [recovering, setRecovering] = useState(false);
  const identity = useRef<{ workspaceId: string; clientId: string } | null>(
    null,
  );
  const choosing = useRef(false);
  const writes = useRef(Promise.resolve(true));
  const writeVersion = useRef(0);
  const valid = useRef(true);
  const conflicted = useRef(false);
  const composing = useRef(false);
  const compositionStart = useCallback(() => {
    composing.current = true;
    setStatus((previous) => (previous === 'clean' ? 'dirty' : previous));
  }, []);
  const compositionEnd = useCallback(() => {
    composing.current = false;
    setEditVersion((version) => version + 1);
  }, []);
  const head = useRef<ArticleSnapshot | null>(null),
    latest = useRef<ArticleDocument | null>(null),
    editSeq = useRef(0),
    savedSeq = useRef(0),
    titleRef = useRef(title),
    inFlight = useRef<PendingSave | null>(null),
    busy = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    dirtySince = useRef<number | null>(null);
  titleRef.current = title;
  const persist = useCallback((): Promise<boolean> => {
    if (!identity.current || !head.current || !latest.current) {
      setBackup('unavailable');
      return Promise.resolve(false);
    }
    const record: DraftRecord = structuredClone({
      version: 1,
      ...identity.current,
      articleId: head.current.articleId,
      ack: head.current,
      draft: { document: latest.current, seq: editSeq.current },
      pending: inFlight.current,
      updatedAt: Date.now(),
    });
    const clean =
      valid.current &&
      !conflicted.current &&
      !record.pending &&
      editSeq.current === savedSeq.current;
    const version = ++writeVersion.current;
    setBackup('pending');
    writes.current = writes.current.then(async () => {
      try {
        await putDraft(record, clean);
        if (version === writeVersion.current)
          setBackup(clean ? 'idle' : 'durable');
        return true;
      } catch {
        if (version === writeVersion.current) setBackup('unavailable');
        return false;
      }
    });
    return writes.current;
  }, []);
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
    if (!connected || !editor || head.current) return;
    let active = true;
    void (async () => {
      try {
        const workspace = WorkspaceInfo.parse(await api('/api/workspace'));
        if (!active) return;
        try {
          const clientId = await ownDraftClient();
          if (!active) return;
          identity.current = { workspaceId: workspace.workspaceId, clientId };
        } catch {
          setBackup('unavailable');
        }
        if (workspace.currentArticleId) {
          const article = ArticleSnapshot.parse(
            await api('/api/articles/' + workspace.currentArticleId),
          );
          let choices: RecoveryChoice[] = [];
          try {
            choices = await listDrafts(
              workspace.workspaceId,
              article.articleId,
            );
          } catch {
            // Preserve unreadable/blocked records; never overwrite their client key.
            identity.current = null;
            setBackup('unavailable');
          }
          if (active) {
            choosing.current = choices.length > 0;
            setRecoveries(choices);
            display(article);
          }
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
  }, [connected, editor, display, loadAttempt]);
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
    if (!head.current) {
      setLoadAttempt((value) => value + 1);
      return;
    }
    if (
      busy.current ||
      choosing.current ||
      conflicted.current ||
      !head.current ||
      !latest.current ||
      !valid.current ||
      composing.current ||
      editor?.view.composing
    )
      return;
    if (editSeq.current === savedSeq.current && !inFlight.current) {
      setStatus('clean');
      return;
    }
    const article = head.current;
    busy.current = true;
    setStatus('saving');
    let pending = inFlight.current;
    try {
      if (!pending) {
        const command: SaveArticleCommand = {
          mutationId: crypto.randomUUID(),
          baseRevisionId: article.headRevisionId,
          document: latest.current,
        };
        const seq = editSeq.current;
        pending = {
          command,
          seq,
          requestHash: await requestHash(article.articleId, command),
        };
        inFlight.current = pending;
      }
      // Persist the immutable request before sending; newer typing stays in draft.
      await persist();
      let result: SaveResult | undefined;
      if (pending.reconcile) {
        await connectWorkspace();
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
        if (
          editSeq.current === pending.seq &&
          valid.current &&
          !composing.current &&
          !editor?.view.composing
        ) {
          display(next);
        } else {
          conflicted.current = true;
          head.current = {
            ...article,
            headRevisionId: result.appliedRevisionId,
            headSeq: result.appliedSeq,
            contentHash: result.contentHash,
            document: pending.command.document,
          };
          setSnapshot(next);
          setStatus('conflict');
          setMessage('另一标签页已更新稿件，当前新输入已保留，请先比较。');
        }
        await persist();
        return;
      }
      head.current = next;
      setSnapshot(next);
      savedSeq.current = pending.seq;
      inFlight.current = null;
      if (!valid.current) {
        setStatus('error');
        setMessage('正文结构或标题长度不符合保存要求。');
      } else if (
        editSeq.current === pending.seq &&
        !composing.current &&
        !editor?.view.composing
      ) {
        setMessage('');
        setStatus('clean');
        dirtySince.current = null;
      } else setStatus('dirty');
      await persist();
    } catch (error) {
      if (pending) pending.reconcile = true;
      conflicted.current =
        error instanceof ApiError && error.code === 'REVISION_CONFLICT';
      setStatus(conflicted.current ? 'conflict' : 'error');
      setMessage(
        error instanceof ApiError
          ? error.message
          : '无法确认保存。本地服务恢复后请重试；服务停止期间刷新页面无法打开工作台。',
      );
      await persist();
    } finally {
      busy.current = false;
      setEditVersion((value) => value + 1);
    }
  }, [editor, display, persist]);
  const recover = useCallback(
    async (choice: RecoveryChoice) => {
      if (
        busy.current ||
        composing.current ||
        editor?.view.composing ||
        !identity.current
      )
        return;
      busy.current = true;
      setRecovering(true);
      setMessage('');
      try {
        const record = choice.record;
        await connectWorkspace();
        let result: SaveResult | null = null;
        if (record.pending) {
          if (
            (await requestHash(record.articleId, record.pending.command)) !==
            record.pending.requestHash
          )
            throw new Error('恢复副本中的保存请求校验失败，原数据已保留。');
          try {
            result = SaveResult.parse(
              await api('/api/mutations/' + record.pending.command.mutationId),
            );
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 404))
              throw error;
          }
          if (
            result &&
            (result.articleId !== record.articleId ||
              result.mutationId !== record.pending.command.mutationId)
          )
            throw new Error('保存确认与恢复副本不匹配。');
        }
        const current = ArticleSnapshot.parse(
          await api('/api/articles/' + record.articleId),
        );
        const ack =
          result && record.pending
            ? {
                ...record.ack,
                headRevisionId: result.appliedRevisionId,
                headSeq: result.appliedSeq,
                contentHash: result.contentHash,
                document: record.pending.command.document,
              }
            : record.ack;
        const stillPending =
          record.pending && !result
            ? { ...record.pending, reconcile: true }
            : null;
        const noLocalChanges =
          !stillPending &&
          stableJson(record.draft.document) === stableJson(ack.document);
        if (noLocalChanges) display(current);
        else {
          head.current = ack;
          setSnapshot(current);
          latest.current = record.draft.document;
          editSeq.current = record.draft.seq;
          savedSeq.current = result && record.pending ? record.pending.seq : -1;
          inFlight.current = stillPending;
          valid.current = ArticleDocument.safeParse(
            record.draft.document,
          ).success;
          conflicted.current = current.headRevisionId !== ack.headRevisionId;
          setTitle(record.draft.document.title);
          titleRef.current = record.draft.document.title;
          editor?.commands.setContent(record.draft.document.doc, {
            emitUpdate: false,
          });
          latest.current = {
            ...record.draft.document,
            doc: editor?.getJSON() ?? record.draft.document.doc,
          };
          setStatus(
            conflicted.current ? 'conflict' : valid.current ? 'dirty' : 'error',
          );
          setMessage(
            conflicted.current
              ? '服务器已有新版本。恢复草稿已保留，普通保存已暂停，请先比较两份内容。'
              : valid.current
                ? ''
                : '正文结构或标题长度不符合保存要求。',
          );
          dirtySince.current = Date.now();
          setEditVersion((value) => value + 1);
        }
        const durable = await persist();
        if (durable)
          await removeRecoveredSource(record, identity.current.clientId);
        choosing.current = false;
        setRecoveries([]);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : '无法核对恢复副本，请保留后重试。',
        );
      } finally {
        busy.current = false;
        setRecovering(false);
      }
    },
    [editor, display, persist, setTitle],
  );
  const keepServer = useCallback(async () => {
    if (busy.current || !head.current || !identity.current) return;
    busy.current = true;
    setRecovering(true);
    try {
      await connectWorkspace();
      const current = ArticleSnapshot.parse(
        await api('/api/articles/' + head.current.articleId),
      );
      await writes.current;
      identity.current = {
        ...identity.current,
        clientId: await ownDraftClient(true),
      };
      display(current);
      choosing.current = false;
      setRecoveries([]);
      setBackup('idle');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : '无法核对服务器版本，请保留副本。',
      );
    } finally {
      busy.current = false;
      setRecovering(false);
    }
  }, [display]);
  const download = useCallback(() => {
    if (!head.current || !editor) return;
    downloadRescue({
      workspaceId: identity.current?.workspaceId ?? null,
      clientId: identity.current?.clientId ?? null,
      ack: head.current,
      draft: {
        document: {
          schemaVersion: 1,
          title: titleRef.current,
          doc: editor.getJSON(),
        },
        seq: editSeq.current,
      },
      pending: inFlight.current,
    });
  }, [editor]);
  const changed = useCallback(() => {
    if (!editor || !head.current || choosing.current) return;
    const document: ArticleDocument = {
      schemaVersion: 1,
      title: titleRef.current,
      doc: editor.getJSON(),
    };
    const parsed = ArticleDocument.safeParse(document);
    if (!parsed.success) {
      valid.current = false;
      editSeq.current++;
      latest.current = document;
      setEditVersion((x) => x + 1);
      setStatus('error');
      setMessage('正文结构或标题长度不符合保存要求。');
      void persist();
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
    void persist();
  }, [editor, persist]);
  useEffect(() => {
    if (!editor) return;
    editor.on('update', changed);
    const element = editor.view.dom;
    element.addEventListener('compositionstart', compositionStart);
    element.addEventListener('compositionend', compositionEnd);
    return () => {
      editor.off('update', changed);
      element.removeEventListener('compositionstart', compositionStart);
      element.removeEventListener('compositionend', compositionEnd);
    };
  }, [editor, changed, compositionStart, compositionEnd]);
  useEffect(() => {
    changed();
  }, [title, changed]);
  useEffect(() => {
    editor?.view.dom.setAttribute(
      'aria-readonly',
      String(snapshot === null || recoveries.length > 0 || recovering),
    );
    editor?.setEditable(
      snapshot !== null && recoveries.length === 0 && !recovering,
      false,
    );
  }, [editor, snapshot, recoveries.length, recovering]);
  useEffect(() => {
    if (status !== 'dirty' || recoveries.length || recovering) return;
    clearTimeout(timer.current);
    const wait = Math.min(
      1200,
      Math.max(0, 10000 - (Date.now() - (dirtySince.current ?? Date.now()))),
    );
    timer.current = setTimeout(() => {
      void save();
    }, wait);
    return () => clearTimeout(timer.current);
  }, [status, editVersion, save, snapshot, recoveries.length, recovering]);
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
    compositionStart,
    compositionEnd,
    backup,
    recoveries,
    recovering,
    recover,
    keepServer,
    download,
    editable: snapshot !== null && recoveries.length === 0 && !recovering,
    dirty: status !== 'clean' && status !== 'empty' && status !== 'loading',
  };
}
