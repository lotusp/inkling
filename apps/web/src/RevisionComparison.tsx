import type { ArticleDocument } from '@inkling/contracts';
import { DocumentPart } from './DocumentComparison';
import { documentChanges, type TextChange } from './document-diff';
function Changes({ items }: { items: TextChange[] }) {
  return (
    <>
      {items.map((item, i) =>
        item.kind === 'removed' ? (
          <del key={i}>{item.text}</del>
        ) : item.kind === 'added' ? (
          <ins key={i}>{item.text}</ins>
        ) : (
          <span key={i}>{item.text}</span>
        ),
      )}
    </>
  );
}
export interface ComparedDraft {
  seq: number | null;
  name: string | null;
  document: ArticleDocument;
}
const versionLabel = (r: ComparedDraft) =>
  r.seq === null ? '当前稿' : '#' + r.seq;
export function RevisionComparison({
  left,
  right,
}: {
  left: ComparedDraft;
  right: ComparedDraft;
}) {
  const diff = documentChanges(left.document, right.document);
  return (
    <section className="revision-comparison" aria-label="版本差异">
      <h3>
        版本 {versionLabel(left)} → {versionLabel(right)}
      </h3>
      <p>删除用删除线标注，新增用下划线标注；预览不会替换正文。</p>
      <p>
        标题：
        <Changes items={diff.title} />
      </p>
      <ul aria-label="版本变化">
        {diff.blocks.map((block, i) => (
          <li key={i}>
            {block.label}
            {block.format ? ' · 格式或结构变化' : ''}
            <pre>
              <Changes items={block.changes} />
            </pre>
          </li>
        ))}
        {!diff.blocks.length &&
          left.document.title === right.document.title && <li>两份内容一致</li>}
      </ul>
      <div className="comparison-columns">
        {[left, right].map((r, i) => (
          <section aria-label={i ? '右侧历史版本' : '左侧历史版本'} key={i}>
            <h4>
              {versionLabel(r)} {r.name}
            </h4>
            <h4>{r.document.title || '未命名文章'}</h4>
            <DocumentPart node={r.document.doc} />
          </section>
        ))}
      </div>
    </section>
  );
}
