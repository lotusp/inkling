import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  ArticleDocument,
  ArticleTitle,
  RevisionDetail,
  ArticleSnapshot,
  SaveResult,
  WorkspaceInfo,
  type SaveArticleCommand,
} from '@inkling/contracts';
import { api, ApiError } from './api';
import { connectWorkspace } from './access';
import { useArticleState } from './use-article-state';
import { useArticlePosition } from './use-article-position';
import { downloadRescue } from './draft-rescue';
import { inspectConflict } from './conflict';
import {
  listDrafts,
  discardDraft,
  ownDraftClient,
  putDraft,
  removeRecoveredSource,
  requestHash,
  stableJson,
  type DraftRecord,
  type PendingSave,
  type RecoveryChoice,
} from './draft-store';
export interface ArticleSession {
  workspaceId: string;
  article: ArticleSnapshot | null;
}
export interface RestoreReview {
  source: RevisionDetail;
  baseRevisionId: string;
  seq: number;
  epoch: number;
}
export function useArticle(
  editor: Editor | null,
  title: string,
  setTitle: (value: string) => void,
  connected: boolean,
  initial?: ArticleSession,
) {
  const {
    current: accessState,
    state: articleState,
    check: checkState,
    block: blockState,
  } = useArticleState();
  const [snapshot, setSnapshot] = useState<ArticleSnapshot | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'empty' | 'clean' | 'dirty' | 'saving' | 'error' | 'conflict'
  >('loading');
  const [message, setMessage] = useState('');
  const navigating = useRef(false);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [damagedArticleId, setDamagedArticleId] = useState<string | null>(null);
  const loadingArticleId = useRef<string | null>(null);
  const [editVersion, setEditVersion] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [backup, setBackup] = useState<
    'idle' | 'pending' | 'durable' | 'unavailable'
  >('idle');
  const [recoveries, setRecoveries] = useState<RecoveryChoice[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [comparison, setComparison] = useState<ArticleSnapshot | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [mergePrepared, setMergePrepared] = useState(false);
  const confirmation = useRef<{
    seq: number;
    revisionId: string;
    document: ArticleDocument;
  } | null>(null);
  const resetConfirmation = useCallback(() => {
    const existed = confirmation.current !== null;
    confirmation.current = null;
    setMergePrepared(false);
    return existed;
  }, []);
  const identity = useRef<{ workspaceId: string; clientId: string } | null>(
    null,
  );
  const choosing = useRef(false);
  const writes = useRef(Promise.resolve(true));
  const writeVersion = useRef(0);
  const valid = useRef(true);
  const conflicted = useRef(false);
  const composing = useRef(false);
  const compositionEpoch = useRef(0);
  const compositionStart = useCallback(() => {
    composing.current = true;
    compositionEpoch.current++;
    if (resetConfirmation()) setConflictMessage('草稿已变化，请重新确认合并。');
    setStatus((previous) => (previous === 'clean' ? 'dirty' : previous));
  }, [resetConfirmation]);
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
  const {
    open: openPosition,
    flush: flushPosition,
    unavailable: positionUnavailable,
  } = useArticlePosition(
    editor,
    () => ({
      article: head.current,
      workspaceId: identity.current?.workspaceId,
      clean:
        valid.current &&
        !choosing.current &&
        !conflicted.current &&
        !inFlight.current &&
        editSeq.current === savedSeq.current,
      composing: composing.current || !!editor?.view.composing,
      navigating: navigating.current,
    }),
    snapshot?.headRevisionId,
    status === 'clean',
  );
  titleRef.current = title;
  const persist = useCallback((): Promise<boolean> => {
    if (!identity.current || !head.current || !latest.current) {
      setBackup('unavailable');
      return Promise.resolve(false);
    }
    const record: DraftRecord = structuredClone({
      version: 2,
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
      setComparison(null);
      resetConfirmation();
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
    [editor, setTitle, resetConfirmation],
  );
  useEffect(() => {
    if (!connected || !editor || head.current) return;
    let active = true;
    void (async () => {
      try {
        const workspace = initial
          ? {
              workspaceId: initial.workspaceId,
              currentArticleId: initial.article?.articleId ?? null,
            }
          : WorkspaceInfo.parse(await api('/api/workspace'));
        if (!active) return;
        try {
          const clientId = await ownDraftClient();
          if (!active) return;
          identity.current = { workspaceId: workspace.workspaceId, clientId };
        } catch {
          setBackup('unavailable');
        }
        if (workspace.currentArticleId) {
          loadingArticleId.current = workspace.currentArticleId;
          const article =
            initial?.article ??
            ArticleSnapshot.parse(
              await api('/api/articles/' + workspace.currentArticleId),
            );
          await checkState(article.articleId);
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
            openPosition(workspace.workspaceId, article, choices.length === 0);
          }
        } else setStatus('empty');
      } catch (error) {
        if (active) {
          setStatus('error');
          if (error instanceof ApiError && error.code === 'STORAGE_CORRUPT')
            setDamagedArticleId(loadingArticleId.current);
          setMessage(error instanceof Error ? error.message : '无法加载稿件。');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [
    connected,
    editor,
    display,
    loadAttempt,
    initial,
    checkState,
    openPosition,
  ]);
  const create = useCallback(async () => {
    try {
      setStatus('loading');
      const initial = ArticleSnapshot.parse(
        await api('/api/articles/ensure-current', 'POST', {
          mutationId: crypto.randomUUID(),
        }),
      );
      await checkState(initial.articleId);
      const current = ArticleSnapshot.parse(
        await api('/api/articles/' + initial.articleId),
      );
      display(current);
      if (identity.current)
        openPosition(identity.current.workspaceId, current, true);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '创建失败。');
    }
  }, [display, checkState, openPosition]);
  const save = useCallback(
    async (forNavigation = false) => {
      if (navigating.current && !forNavigation) return;
      if (head.current && accessState.current !== 'active') return;
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
            if (!(error instanceof ApiError && error.status === 404))
              throw error;
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
            '/api/articles/' +
              article.articleId +
              (pending.restoreSourceRevisionId ? '/restore' : '/content'),
            pending.restoreSourceRevisionId ? 'POST' : 'PUT',
            pending.restoreSourceRevisionId
              ? {
                  mutationId: pending.command.mutationId,
                  baseRevisionId: pending.command.baseRevisionId,
                  sourceRevisionId: pending.restoreSourceRevisionId,
                }
              : pending.command,
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
          return result;
        }
        if (pending.restoreSourceRevisionId) {
          inFlight.current = null;
          if (
            editSeq.current === pending.seq &&
            valid.current &&
            !composing.current &&
            !editor?.view.composing
          ) {
            display(next);
          } else {
            head.current = next;
            setSnapshot(next);
            savedSeq.current = -1;
            conflicted.current = true;
            setStatus('conflict');
            setMessage(
              '旧稿已恢复为新版本，等待期间的新输入已保留，请先比较。',
            );
          }
          await persist();
          return result;
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
        return result;
      } catch (error) {
        if (
          error instanceof ApiError &&
          ['ARTICLE_NOT_ACTIVE', 'ARTICLE_TRASHED'].includes(error.code)
        ) {
          blockState();
          void checkState(article.articleId).catch(() => {
            /* Stay paused until explicit successful check. */
          });
        }
        if (error instanceof ApiError && error.code === 'STORAGE_CORRUPT')
          setDamagedArticleId(article.articleId);
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
    },
    [editor, display, persist, accessState, blockState, checkState],
  );
  const flushForVersion = useCallback(async () => {
    if (
      accessState.current !== 'active' ||
      navigating.current ||
      busy.current ||
      choosing.current ||
      conflicted.current ||
      inFlight.current ||
      !head.current ||
      !valid.current ||
      composing.current ||
      editor?.view.composing
    )
      throw new Error('请先完成选词、保存或冲突处理，再命名版本。');
    if (editSeq.current === savedSeq.current)
      return {
        revisionId: head.current.headRevisionId,
        seq: head.current.headSeq,
      };
    const result = await save();
    if (!result) throw new Error('尚未确认保存，请保留输入并重试。');
    return { revisionId: result.appliedRevisionId, seq: result.appliedSeq };
  }, [editor, save, accessState]);
  const reviewRestore = useCallback(
    async (sourceRevisionId: string): Promise<RestoreReview> => {
      if (
        accessState.current !== 'active' ||
        navigating.current ||
        busy.current ||
        choosing.current ||
        conflicted.current ||
        inFlight.current ||
        !head.current ||
        !valid.current ||
        editSeq.current !== savedSeq.current ||
        composing.current ||
        editor?.view.composing
      )
        throw new Error('请先保存当前稿并完成选词或冲突处理，再查看恢复。');
      const ticket = {
        baseRevisionId: head.current.headRevisionId,
        seq: editSeq.current,
        epoch: compositionEpoch.current,
      };
      const source = RevisionDetail.parse(
        await api(
          '/api/articles/' +
            head.current.articleId +
            '/revisions/' +
            sourceRevisionId,
        ),
      );
      if (
        ticket.seq !== editSeq.current ||
        ticket.epoch !== compositionEpoch.current ||
        ticket.baseRevisionId !== head.current?.headRevisionId
      )
        throw new Error('草稿已变化，请重新查看并确认恢复。');
      return { ...ticket, source };
    },
    [editor, accessState],
  );
  const confirmRestore = useCallback(
    async (ticket: RestoreReview) => {
      const check = () => {
        if (
          ticket.seq !== editSeq.current ||
          ticket.epoch !== compositionEpoch.current ||
          ticket.baseRevisionId !== head.current?.headRevisionId ||
          composing.current ||
          editor?.view.composing
        )
          throw new Error('草稿已变化，请重新查看并确认恢复。');
        if (
          accessState.current !== 'active' ||
          navigating.current ||
          busy.current ||
          choosing.current ||
          conflicted.current ||
          inFlight.current ||
          !head.current ||
          !valid.current ||
          editSeq.current !== savedSeq.current
        )
          throw new Error('请先确认当前保存结果，再恢复旧稿。');
      };
      check();
      const command: SaveArticleCommand = {
        mutationId: crypto.randomUUID(),
        baseRevisionId: ticket.baseRevisionId,
        document: ticket.source.document,
      };
      const digest = await requestHash(
        ticket.source.articleId,
        command,
        ticket.source.revisionId,
      );
      check();
      inFlight.current = {
        command,
        seq: ticket.seq,
        requestHash: digest,
        restoreSourceRevisionId: ticket.source.revisionId,
      };
      const result = await save();
      if (!result)
        throw new Error('恢复尚未确认，请在正文保存提示中核对或重试。');
      return result;
    },
    [editor, save, accessState],
  );
  const compare = useCallback(async () => {
    if (
      navigating.current ||
      busy.current ||
      !head.current ||
      !conflicted.current ||
      composing.current ||
      editor?.view.composing
    )
      return;
    busy.current = true;
    setConflictBusy(true);
    setConflictMessage('');
    setComparison(null);
    resetConfirmation();
    try {
      const pending = inFlight.current;
      const { server, applied } = await inspectConflict(
        head.current.articleId,
        pending,
      );
      if (pending && applied) {
        head.current = {
          ...head.current,
          headRevisionId: applied.appliedRevisionId,
          headSeq: applied.appliedSeq,
          contentHash: applied.contentHash,
          document: pending.command.document,
        };
        savedSeq.current = pending.seq;
      }
      inFlight.current = null;
      setComparison(server);
      await persist();
    } catch (error) {
      setConflictMessage(
        error instanceof Error ? error.message : '无法核对冲突，请稍后重试。',
      );
    } finally {
      busy.current = false;
      setConflictBusy(false);
    }
  }, [editor, persist, resetConfirmation]);
  const prepareMerge = useCallback(() => {
    if (
      accessState.current !== 'active' ||
      navigating.current ||
      busy.current ||
      !comparison ||
      !latest.current ||
      !conflicted.current ||
      inFlight.current ||
      !valid.current ||
      composing.current ||
      editor?.view.composing
    )
      return;
    confirmation.current = {
      seq: editSeq.current,
      revisionId: comparison.headRevisionId,
      document: structuredClone(latest.current),
    };
    setMergePrepared(true);
    setConflictMessage('');
  }, [comparison, editor, accessState]);
  const confirmMerge = useCallback(async () => {
    const ticket = confirmation.current;
    if (
      accessState.current !== 'active' ||
      navigating.current ||
      busy.current ||
      !ticket ||
      !comparison ||
      !editor ||
      !conflicted.current ||
      inFlight.current ||
      composing.current ||
      editor.view.composing ||
      !valid.current
    )
      return;
    const document = {
      schemaVersion: 1,
      title: titleRef.current,
      doc: editor.getJSON(),
    };
    if (
      ticket.seq !== editSeq.current ||
      ticket.revisionId !== comparison.headRevisionId ||
      stableJson(ticket.document) !== stableJson(document)
    ) {
      resetConfirmation();
      setConflictMessage('草稿已变化，请重新确认合并。');
      return;
    }
    // This explicit decision authorizes a new CAS save against the viewed head.
    head.current = comparison;
    savedSeq.current = -1;
    conflicted.current = false;
    setComparison(null);
    resetConfirmation();
    setMessage('');
    await save();
  }, [comparison, editor, resetConfirmation, save, accessState]);
  const recover = useCallback(
    async (choice: RecoveryChoice) => {
      if (
        navigating.current ||
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
        if ((await checkState(record.articleId)).state !== 'active')
          throw new Error(
            '文章不可编辑，恢复副本已保留；请先取消归档或从回收站恢复。',
          );
        let result: SaveResult | null = null;
        if (record.pending) {
          if (
            (await requestHash(
              record.articleId,
              record.pending.command,
              record.pending.restoreSourceRevisionId,
            )) !== record.pending.requestHash
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
          (stableJson(record.draft.document) === stableJson(ack.document) ||
            (!!result &&
              !!record.pending?.restoreSourceRevisionId &&
              record.draft.seq === record.pending.seq));
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
    [editor, display, persist, setTitle, checkState],
  );
  const keepServer = useCallback(async () => {
    if (
      navigating.current ||
      busy.current ||
      !head.current ||
      !identity.current ||
      composing.current ||
      editor?.view.composing
    )
      return;
    busy.current = true;
    setRecovering(true);
    try {
      if (conflicted.current && !(await persist()))
        throw new Error(
          '本页草稿未能保留，已停止切换。请先下载救援稿或重试保存副本。',
        );
      await connectWorkspace();
      await checkState(head.current.articleId);
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
  }, [display, editor, persist, checkState]);
  const discard = useCallback(
    async (choice: RecoveryChoice): Promise<boolean> => {
      if (
        navigating.current ||
        busy.current ||
        !identity.current ||
        !choosing.current
      )
        return false;
      busy.current = true;
      setRecovering(true);
      try {
        await discardDraft(choice.record, identity.current.clientId);
        const remaining = recoveries.filter(
          (item) => item.record.clientId !== choice.record.clientId,
        );
        setRecoveries(remaining);
        choosing.current = remaining.length > 0;
        setMessage('');
        return true;
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : '无法放弃副本，原内容已保留。',
        );
        try {
          const refreshed = await listDrafts(
            choice.record.workspaceId,
            choice.record.articleId,
          );
          choosing.current = refreshed.length > 0;
          setRecoveries(refreshed);
        } catch {
          /* Keep the visible snapshot and error until the next successful read. */
        }
        return false;
      } finally {
        busy.current = false;
        setRecovering(false);
      }
    },
    [recoveries],
  );
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
      if (resetConfirmation())
        setConflictMessage('草稿已变化，请重新确认合并。');
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
    if (resetConfirmation()) setConflictMessage('草稿已变化，请重新确认合并。');
    latest.current = parsed.data;
    editSeq.current++;
    setEditVersion((x) => x + 1);
    dirtySince.current ??= Date.now();
    setStatus(conflicted.current ? 'conflict' : 'dirty');
    void persist();
  }, [editor, persist, resetConfirmation]);
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
  const stateReadOnly = articleState !== 'active';
  const lockEditing =
    stateReadOnly && !composing.current && !editor?.view.composing;
  useEffect(() => {
    editor?.view.dom.setAttribute(
      'aria-readonly',
      String(
        lockEditing ||
          snapshot === null ||
          recoveries.length > 0 ||
          recovering ||
          navigationLocked,
      ),
    );
    editor?.setEditable(
      !lockEditing &&
        snapshot !== null &&
        recoveries.length === 0 &&
        !recovering &&
        !navigationLocked,
      false,
    );
  }, [
    editor,
    snapshot,
    recoveries.length,
    recovering,
    navigationLocked,
    lockEditing,
  ]);
  useEffect(() => {
    if (
      stateReadOnly ||
      status !== 'dirty' ||
      recoveries.length ||
      recovering ||
      navigationLocked
    )
      return;
    clearTimeout(timer.current);
    const wait = Math.min(
      1200,
      Math.max(0, 10000 - (Date.now() - (dirtySince.current ?? Date.now()))),
    );
    timer.current = setTimeout(() => {
      void save();
    }, wait);
    return () => clearTimeout(timer.current);
  }, [
    status,
    editVersion,
    save,
    snapshot,
    recoveries.length,
    recovering,
    navigationLocked,
    stateReadOnly,
  ]);
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
  const renameTitle = useCallback(
    async (value: string) => {
      const nextTitle = ArticleTitle.parse(value);
      if (
        accessState.current !== 'active' ||
        navigating.current ||
        busy.current ||
        choosing.current ||
        conflicted.current ||
        inFlight.current ||
        !head.current ||
        !latest.current ||
        !valid.current ||
        composing.current ||
        editor?.view.composing
      )
        throw new Error('请先完成选词、保存核对或冲突处理，再重命名。');
      if (latest.current.title !== nextTitle) {
        resetConfirmation();
        latest.current = { ...latest.current, title: nextTitle };
        titleRef.current = nextTitle;
        setTitle(nextTitle);
        editSeq.current++;
        dirtySince.current ??= Date.now();
        setStatus('dirty');
        setEditVersion((value) => value + 1);
      }
      if (editSeq.current === savedSeq.current) return;
      const result = await save();
      if (!result)
        throw new Error('标题已保留在当前草稿，请在正文保存提示中核对或重试。');
    },
    [editor, resetConfirmation, save, setTitle, accessState],
  );
  const navigationState = useCallback(() => {
    if (composing.current || editor?.view.composing)
      throw new Error('请先完成中文选词，再重新切换文章。');
    if (busy.current || navigating.current)
      throw new Error('正在保存或核对，请等待结束后再切换。');
    if (!head.current && status !== 'empty')
      throw new Error('请等待文章加载完成后再切换。');
    return (
      choosing.current ||
      conflicted.current ||
      !!inFlight.current ||
      !valid.current ||
      editSeq.current !== savedSeq.current
    );
  }, [editor, status]);
  const prepareNavigation = useCallback(
    async (mode: 'save' | 'keep') => {
      navigationState();
      navigating.current = true;
      setNavigationLocked(true);
      editor?.setEditable(false, false);
      clearTimeout(timer.current);
      resetConfirmation();
      const seq = editSeq.current,
        epoch = compositionEpoch.current;
      const release = () => {
        navigating.current = false;
        setNavigationLocked(false);
        editor?.setEditable(
          accessState.current === 'active' &&
            !!head.current &&
            !choosing.current,
          false,
        );
        setEditVersion((value) => value + 1);
      };
      try {
        if (mode === 'save') {
          if (choosing.current || conflicted.current || !valid.current)
            throw new Error('请先处理恢复副本或冲突，或选择保留草稿并切换。');
          if (head.current) await save(true);
          if (
            inFlight.current ||
            conflicted.current ||
            editSeq.current !== savedSeq.current
          )
            throw new Error('尚未确认保存，已停止切换。可重试或保留草稿。');
        } else if (
          !choosing.current &&
          head.current &&
          (inFlight.current ||
            conflicted.current ||
            !valid.current ||
            editSeq.current !== savedSeq.current)
        ) {
          if (!(await persist()))
            throw new Error(
              '恢复副本未能写入，已停止切换。请重试或下载救援稿。',
            );
        }
        // Existing unselected recoveries must never be cleaned by a clean editor.
        await writes.current;
        if (
          editSeq.current !== seq ||
          compositionEpoch.current !== epoch ||
          composing.current ||
          editor?.view.composing
        )
          throw new Error('输入已变化，请完成选词后重新切换。');
        flushPosition();
        return release;
      } catch (error) {
        release();
        throw error;
      }
    },
    [
      editor,
      navigationState,
      persist,
      resetConfirmation,
      save,
      accessState,
      flushPosition,
    ],
  );
  const refreshState = useCallback(async () => {
    if (!head.current) return;
    if (
      composing.current ||
      editor?.view.composing ||
      busy.current ||
      navigating.current
    ) {
      setMessage('请先完成选词、保存或导航，再核对文章状态。');
      return;
    }
    try {
      await checkState(head.current.articleId);
    } catch {
      setMessage('无法核对文章状态，原输入已保留，请重试。');
    }
  }, [editor, checkState]);
  return {
    positionUnavailable,
    articleState,
    stateReadOnly,
    refreshState,
    snapshot,
    navigationState,
    renameTitle,
    prepareNavigation,
    navigationLocked,
    damagedArticleId,
    flushForVersion,
    currentDocument: () => latest.current,
    reviewRestore,
    confirmRestore,
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
    discard,
    clientId: identity.current?.clientId,
    download,
    compare,
    comparison,
    conflictBusy,
    conflictMessage,
    mergePrepared,
    prepareMerge,
    confirmMerge,
    canMerge:
      !stateReadOnly &&
      comparison !== null &&
      !conflictBusy &&
      !inFlight.current &&
      valid.current &&
      !composing.current,
    hasConflict: conflicted.current,
    document: latest.current,
    editable:
      !lockEditing &&
      snapshot !== null &&
      recoveries.length === 0 &&
      !recovering &&
      !navigationLocked,
    dirty: status !== 'clean' && status !== 'empty' && status !== 'loading',
  };
}
