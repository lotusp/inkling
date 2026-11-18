import { useEffect, useState } from 'react';
import {
  ArticleSnapshot,
  SaveResult,
  type ArticleListItem,
  type SaveArticleCommand,
} from '@inkling/contracts';
import { DeskDialog } from './DeskDialog';
import { ArticleOrganizer, type OrganizerMode } from './ArticleOrganizer';
import { api, ApiError } from './api';

export function LibraryArticleOrganizer({
  articleId,
  mode,
  close,
  onConfirmed,
}: {
  articleId: string;
  mode: OrganizerMode;
  close: (notice?: string) => void;
  onConfirmed: (metadata: ArticleListItem) => void;
}) {
  const [snapshot, setSnapshot] = useState<ArticleSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<SaveArticleCommand | null>(null);
  const path = '/api/articles/' + articleId;
  useEffect(() => {
    if (mode === 'tags') return;
    let active = true;
    setLoadError('');
    void api(path)
      .then((value) => {
        const loaded = ArticleSnapshot.parse(value);
        if (loaded.articleId !== articleId) throw new Error();
        if (active) setSnapshot(loaded);
      })
      .catch(() => {
        if (active) setLoadError('无法读取这篇文章。');
      });
    return () => {
      active = false;
    };
  }, [path, articleId, attempt, mode]);
  if (!snapshot && mode === 'rename')
    return (
      <DeskDialog title="重命名文章" close={close}>
        <p role="status">{loadError || '正在读取文章…'}</p>
        {loadError && (
          <button onClick={() => setAttempt(attempt + 1)}>重试读取</button>
        )}
      </DeskDialog>
    );
  // Reuse the content CAS with this article's own body and revision. Retrying an
  // unknown outcome must use the original command, even after the draft moves on.
  async function rename(title: string) {
    if (!snapshot) return;
    const command = pending ?? {
      mutationId: crypto.randomUUID(),
      baseRevisionId: snapshot.headRevisionId,
      document: { ...snapshot.document, title },
    };
    setPending(command);
    let confirmed: SaveResult | undefined;
    if (pending) {
      try {
        confirmed = SaveResult.parse(
          await api('/api/mutations/' + command.mutationId),
        );
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
    }
    if (!confirmed) {
      try {
        confirmed = SaveResult.parse(
          await api(path + '/content', 'PUT', command),
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          ((!pending &&
            [400, 401, 403, 404, 409, 422].includes(error.status)) ||
            error.code === 'REVISION_CONFLICT')
        ) {
          setPending(null);
          if (error.status === 409)
            throw new Error(
              '文章已变化。请关闭窗口，重新打开后核对最新标题。',
              { cause: error },
            );
        }
        throw error;
      }
    }
    if (
      confirmed.articleId !== articleId ||
      confirmed.mutationId !== command.mutationId
    )
      throw new Error('标题保存结果待核对，请重试。');
    setSnapshot({
      ...snapshot,
      document: command.document,
      headRevisionId: confirmed.appliedRevisionId,
      headSeq: confirmed.appliedSeq,
      contentHash: confirmed.contentHash,
    });
    setPending(null);
  }
  return (
    <ArticleOrganizer
      mode={mode}
      articleId={articleId}
      initialTitle={snapshot?.document.title ?? ''}
      renameTitle={rename}
      pendingTitle={!!pending}
      onConfirmed={onConfirmed}
      close={close}
    />
  );
}
