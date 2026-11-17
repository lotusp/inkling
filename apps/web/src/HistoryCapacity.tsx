import type { ArticleSnapshot } from '@inkling/contracts';
function size(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
export function HistoryCapacity({ article }: { article: ArticleSnapshot }) {
  if (article.revisionBytes < article.historyWarningBytes) return null;
  return (
    <p className="backup-notice" role="status" aria-label="历史容量">
      历史占用较多：{size(article.revisionBytes)} /{' '}
      {size(article.historyLimitBytes)}
      。超过上限将暂停新增正文版本，历史不会自动删除；请下载需要保留的稿件。
    </p>
  );
}
