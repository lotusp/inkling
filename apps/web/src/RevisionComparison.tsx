import { useMemo } from 'react';
import type { ArticleDocument } from '@inkling/contracts';
import { documentChanges, type TextChange } from './document-diff';

function DiffLines({ changes }: { changes: TextChange[] }) {
  if (changes.every((item) => item.kind === 'same')) return null;
  return (
    <>
      {(['removed', 'added'] as const).map((side) => {
        const line = changes.filter(
          (part) => part.kind === 'same' || part.kind === side,
        );
        if (!line.length) return null;
        return (
          <div key={side} className={'diff-line ' + side}>
            <b aria-hidden="true">{side === 'added' ? '+' : '−'}</b>
            <span>
              {line.map((part, i) =>
                part.kind === 'same' ? (
                  part.text
                ) : side === 'removed' ? (
                  <del key={i}>{part.text}</del>
                ) : (
                  <ins key={i}>{part.text}</ins>
                ),
              )}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function RevisionComparison({
  before,
  after,
}: {
  before: ArticleDocument;
  after: ArticleDocument;
}) {
  const diff = useMemo(() => documentChanges(before, after), [before, after]);
  const titleChanged = before.title !== after.title;
  return (
    <section className="revision-comparison" aria-label="版本差异">
      {titleChanged && (
        <div className="revision-change">
          <small>标题</small>
          <DiffLines changes={diff.title} />
        </div>
      )}
      {diff.blocks.map((block, i) => (
        <div key={i} className="revision-change">
          <small>{block.label}</small>
          <DiffLines changes={block.changes} />
          {block.format && <small>格式或结构变化</small>}
        </div>
      ))}
      {!diff.blocks.length && !titleChanged && <p>两份内容一致</p>}
    </section>
  );
}
