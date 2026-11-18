import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArticleListItem,
  ArticleLifecycleResult,
  ArticleSnapshot,
  WorkspaceInfo,
  type ArticleLifecycleCommand,
} from '@inkling/contracts';
import { api, ApiError } from './api';
import { ownDraftClient } from './draft-store';
import type { ArticleSession, useArticle } from './use-article';
export interface LifecycleTarget {
  articleId: string;
  action: ArticleLifecycleCommand['action'];
}
const labels = {
  archive: '归档',
  unarchive: '取消归档',
  trash: '移入回收站',
  restore: '恢复文章',
};
export function ArticleLifecycle({
  target,
  article,
  navigate,
  close,
  changed,
}: {
  target: LifecycleTarget;
  article: ReturnType<typeof useArticle>;
  navigate: (session: ArticleSession) => void;
  close: () => void;
  changed: () => void;
}) {
  const [base, setBase] = useState<ArticleListItem | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const working = useRef(false);
  const sent = useRef(false);
  const command = useRef<ArticleLifecycleCommand | null>(null);
  const confirmed = useRef<ArticleLifecycleResult | null>(null);
  const mode = useRef<'save' | 'keep'>('save');
  const openIds = useRef(new Map<string, string>());
  const path = '/api/articles/' + target.articleId;
  const label = labels[target.action];
  useEffect(() => {
    let active = true;
    void api(path + '/metadata')
      .then((value) => {
        if (!active) return;
        const metadata = ArticleListItem.parse(value);
        if (metadata.articleId !== target.articleId)
          throw new Error('文章信息不匹配。');
        command.current = {
          mutationId: crypto.randomUUID(),
          baseMetadataVersion: metadata.metadataVersion,
          action: target.action,
        };
        setBase(metadata);
        setMessage('');
      })
      .catch((error) => {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : '无法读取文章信息，请重试。',
          );
      });
    return () => {
      active = false;
    };
  }, [path, target.articleId, target.action, loadAttempt]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  const checkResult = useCallback(
    (value: unknown, operation: ArticleLifecycleCommand) => {
      const result = ArticleLifecycleResult.parse(value);
      const expected =
        operation.action === 'archive'
          ? 'archived'
          : operation.action === 'trash'
            ? 'trashed'
            : operation.action === 'unarchive'
              ? 'active'
              : null;
      if (
        result.mutationId !== operation.mutationId ||
        result.metadata.articleId !== target.articleId ||
        result.metadata.metadataVersion !== operation.baseMetadataVersion + 1 ||
        (expected
          ? result.metadata.state !== expected
          : result.metadata.state === 'trashed')
      )
        throw new Error('状态确认与本次操作不匹配，请保留输入并核对。');
      return result;
    },
    [target.articleId],
  );
  const affectsEditor = article.snapshot?.articleId === target.articleId;
  async function execute(protection: 'save' | 'keep') {
    if (working.current || !command.current || rejected) return;
    const operation = command.current;
    working.current = true;
    setBusy(true);
    setMessage('');
    mode.current = protection;
    let release: (() => void) | undefined;
    const wasUnknown = sent.current;
    let rejectedWrite = false;
    try {
      if (affectsEditor) release = await article.prepareNavigation(protection);
      if (!confirmed.current && sent.current) {
        try {
          confirmed.current = checkResult(
            await api('/api/mutations/' + operation.mutationId),
            operation,
          );
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
          const current = ArticleListItem.parse(await api(path + '/metadata'));
          if (current.metadataVersion !== operation.baseMetadataVersion) {
            // No recorded commit and a newer CAS baseline make the old operation impossible.
            sent.current = false;
            setPending(false);
            setRejected(true);
            throw new Error(
              '文章状态或标签已被更新，请取消后重新查看并确认。',
              { cause: error },
            );
          }
        }
      }
      if (!confirmed.current) {
        sent.current = true;
        setPending(true);
        let value: unknown;
        try {
          value = await api(path + '/lifecycle', 'POST', operation);
        } catch (error) {
          rejectedWrite =
            error instanceof ApiError &&
            [400, 401, 403, 404, 409, 422].includes(error.status);
          throw error;
        }
        confirmed.current = checkResult(value, operation);
      }
      const current = ArticleListItem.parse(await api(path + '/metadata'));
      if (affectsEditor) {
        const workspace = WorkspaceInfo.parse(await api('/api/workspace'));
        const destination =
          current.state === 'trashed'
            ? workspace.currentArticleId
            : target.articleId;
        let snapshot: ArticleSnapshot | null = null;
        if (destination) {
          const mutationId =
            openIds.current.get(destination) ?? crypto.randomUUID();
          openIds.current.set(destination, mutationId);
          await api(`/api/articles/${destination}/open`, 'POST', {
            mutationId,
          });
          snapshot = ArticleSnapshot.parse(
            await api('/api/articles/' + destination),
          );
          // Complete reads before handing ownership over to a new editor session.
          ArticleListItem.parse(
            await api(`/api/articles/${destination}/metadata`),
          );
        }
        try {
          await ownDraftClient(true);
        } catch {
          /* The new session reports unavailable backup. */
        }
        navigate({ workspaceId: workspace.workspaceId, article: snapshot });
      } else {
        changed();
        close();
      }
    } catch (error) {
      release?.();
      if (rejectedWrite && !wasUnknown) {
        sent.current = false;
        setPending(false);
        setRejected(true);
      }
      setMessage(
        error instanceof Error ? error.message : '结果尚未确认，请核对后重试。',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const unsafe =
    affectsEditor &&
    (article.dirty || article.recoveries.length > 0 || article.hasConflict);
  return (
    <section className="navigation-confirmation" aria-label="文章状态操作确认">
      <h2>{target.action === 'restore' ? label : label + '文章'}</h2>
      {base ? (
        <>
          <p>
            {base.title || '未命名文章'} ·{' '}
            {base.state === 'active'
              ? '活动文章'
              : base.state === 'archived'
                ? '已归档'
                : '回收站'}
          </p>
          <p>
            {target.action === 'trash'
              ? '确认后移入回收站，保留正文、历史和浏览器恢复副本，不会永久删除。'
              : target.action === 'restore'
                ? '恢复到移入回收站前的状态，保留原文章和全部历史。'
                : target.action === 'archive'
                  ? '归档后只读查看正文与历史，可随时取消归档。'
                  : '取消归档后可继续编辑，未选择的恢复副本仍会保留。'}
          </p>
          {unsafe && (
            <p>当前稿有未确认输入或恢复副本，请先保存或明确保留草稿。</p>
          )}
          {!pending && !rejected && (
            <>
              {(!unsafe || !article.stateReadOnly) && (
                <button disabled={busy} onClick={() => void execute('save')}>
                  {unsafe ? '保存并' : '确认'}
                  {label}
                </button>
              )}
              {unsafe && (
                <button disabled={busy} onClick={() => void execute('keep')}>
                  保留草稿并{label}
                </button>
              )}
            </>
          )}
          {pending && (
            <>
              <p>
                {confirmed.current
                  ? '操作已提交，正在核对最新状态与打开结果。'
                  : '结果尚未确认，请核对同一次操作。'}
              </p>
              <button
                disabled={busy}
                onClick={() => void execute(mode.current)}
              >
                核对并重试
              </button>
              {unsafe && (
                <button disabled={busy} onClick={() => void execute('keep')}>
                  保留草稿并核对
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <p>正在读取操作基线…</p>
          {message && (
            <button onClick={() => setLoadAttempt((n) => n + 1)}>
              重试读取文章状态
            </button>
          )}
        </>
      )}
      {message && <p role="alert">{message}</p>}
      {busy && <p role="status">正在保护输入并核对文章状态…</p>}
      {!pending && (
        <button disabled={busy} onClick={close}>
          取消操作
        </button>
      )}
    </section>
  );
}
