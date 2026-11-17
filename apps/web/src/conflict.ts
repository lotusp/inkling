import { ArticleSnapshot, SaveResult } from '@inkling/contracts';
import { api, ApiError } from './api';
import { connectWorkspace } from './access';
import type { PendingSave } from './draft-store';

export async function inspectConflict(
  articleId: string,
  pending: PendingSave | null,
) {
  await connectWorkspace();
  let applied: SaveResult | null = null;
  if (pending) {
    try {
      applied = SaveResult.parse(
        await api('/api/mutations/' + pending.command.mutationId),
      );
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
    if (
      applied &&
      (applied.articleId !== articleId ||
        applied.mutationId !== pending.command.mutationId)
    )
      throw new Error('保存确认与当前草稿不匹配。');
  }
  const server = ArticleSnapshot.parse(await api('/api/articles/' + articleId));
  // Only a changed server head makes an absent old request impossible to commit later.
  if (
    pending &&
    !applied &&
    server.headRevisionId === pending.command.baseRevisionId
  )
    throw new Error('原保存仍待核对，请保留草稿后重试。');
  return { server, applied };
}
