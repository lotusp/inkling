import type { ArticleLifecycleCommand, ArticleState } from '@inkling/contracts';
import { ArticleError } from './article';

export function transitionArticle(
  state: ArticleState,
  previousState: ArticleState | null,
  action: ArticleLifecycleCommand['action'],
): { state: ArticleState; previousState: ArticleState | null } {
  if (action === 'archive' && state === 'active')
    return { state: 'archived', previousState: null };
  if (action === 'unarchive' && state === 'archived')
    return { state: 'active', previousState: null };
  if (action === 'trash' && state !== 'trashed')
    return { state: 'trashed', previousState: state };
  if (action === 'restore' && state === 'trashed') {
    if (previousState !== 'active' && previousState !== 'archived')
      throw new ArticleError(
        'STORAGE_CORRUPT',
        500,
        '回收站来源状态损坏，已停止恢复。',
      );
    return { state: previousState, previousState: null };
  }
  throw new ArticleError(
    'INVALID_LIFECYCLE_TRANSITION',
    409,
    '文章状态已不适用此操作，请刷新文章库后重新选择。',
  );
}
