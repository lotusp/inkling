import type { ArticleDocument, ArticleSnapshot } from '@inkling/contracts';
import { DocumentComparison } from './DocumentComparison';
export function ConflictPanel({
  local,
  server,
  canMerge,
  prepared,
  prepare,
  confirm,
}: {
  local: ArticleDocument;
  server: ArticleSnapshot;
  canMerge: boolean;
  prepared: boolean;
  prepare: () => void;
  confirm: () => Promise<void>;
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
      {prepared ? (
        <div className="merge-confirmation" role="group" aria-label="合并确认">
          <p>
            将当前正文作为合并结果，基于服务器版本 #{server.headSeq}{' '}
            保存。继续输入会使本次确认失效。
          </p>
          <button disabled={!canMerge} onClick={() => void confirm()}>
            确认保存合并稿
          </button>
        </div>
      ) : (
        <button disabled={!canMerge} onClick={prepare}>
          准备保存合并稿
        </button>
      )}
    </section>
  );
}
