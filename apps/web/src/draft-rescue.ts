import type { ArticleSnapshot } from '@inkling/contracts';
import type { DraftRecord } from './draft-store';

interface RescueContent {
  workspaceId: string | null;
  clientId: string | null;
  ack: ArticleSnapshot;
  draft: DraftRecord['draft'];
  pending: DraftRecord['pending'];
}
export function downloadRescue(content: RescueContent) {
  const payload = {
    format: 'inkling-recovery',
    version: 1,
    exportedAt: new Date().toISOString(),
    workspaceId: content.workspaceId,
    articleId: content.ack.articleId,
    clientId: content.clientId,
    ack: content.ack,
    draft: content.draft,
    pending: content.pending,
  };
  downloadJson(payload, 'inkling-recovery-' + content.ack.articleId + '.json');
}
export function downloadRawDrafts(articleId: string, records: unknown[]) {
  downloadJson(
    { format: 'inkling-raw-drafts', articleId, records },
    'inkling-raw-drafts-' + articleId + '.json',
  );
}
function downloadJson(payload: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
