import type { ArticleDocument, ArticleSnapshot } from '@inkling/contracts';
import { DocumentComparison } from './DocumentComparison';
export function ConflictPanel({
  local,
  server,
}: {
  local: ArticleDocument;
  server: ArticleSnapshot;
}) {
  return (
    <section className="conflict-panel" aria-label="冲突比较">
      <h2>先比较，再整理合并稿</h2>
      <p>
        服务器版本 #{server.headSeq}{' '}
        是本次查看的版本。本页草稿随正文编辑更新，比较不会替换正文。
      </p>
      <DocumentComparison local={local} remote={server.document} />
      <p>请在正文编辑器中整理你的判断，保留需要的两边内容。</p>
    </section>
  );
}
