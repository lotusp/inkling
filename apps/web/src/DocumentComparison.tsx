import type { ReactNode } from 'react';
import type { ArticleDocument, DocumentNode } from '@inkling/contracts';
import { stableJson } from './draft-store';

function textOf(node: DocumentNode): string {
  if (node.type === 'hardBreak') return '\n';
  return node.text ?? node.content?.map(textOf).join('') ?? '';
}
function orderedType(value: unknown) {
  return value === '1' ||
    value === 'a' ||
    value === 'A' ||
    value === 'i' ||
    value === 'I'
    ? value
    : undefined;
}
function renderNode(node: DocumentNode): ReactNode {
  let content: ReactNode =
    node.text ??
    node.content?.map((child, index) => (
      <DocumentPart key={index} node={child} />
    ));
  for (const mark of [...(node.marks ?? [])].reverse()) {
    switch (mark.type) {
      case 'bold':
        content = <strong>{content}</strong>;
        break;
      case 'italic':
        content = <em>{content}</em>;
        break;
      case 'strike':
        content = <s>{content}</s>;
        break;
      case 'underline':
        content = <u>{content}</u>;
        break;
      case 'code':
        content = <code>{content}</code>;
        break;
      case 'link':
        content = (
          <span className="preview-link" title={mark.attrs?.href ?? ''}>
            {content}
          </span>
        );
        break;
    }
  }
  switch (node.type) {
    case 'doc':
    case 'text':
      return content;
    case 'paragraph':
      return <p>{content ?? <br />}</p>;
    case 'heading':
      return node.attrs?.level === 2 ? <h4>{content}</h4> : <h5>{content}</h5>;
    case 'blockquote':
      return <blockquote>{content}</blockquote>;
    case 'bulletList':
      return <ul>{content}</ul>;
    case 'orderedList':
      return (
        <ol
          start={typeof node.attrs?.start === 'number' ? node.attrs.start : 1}
          type={orderedType(node.attrs?.type)}
        >
          {content}
        </ol>
      );
    case 'listItem':
      return <li>{content}</li>;
    case 'codeBlock':
      return (
        <pre>
          <code>{content}</code>
        </pre>
      );
    case 'hardBreak':
      return <br />;
    case 'horizontalRule':
      return <hr />;
    default:
      return <p>此结构暂不支持预览。</p>;
  }
}
function DocumentPart({ node }: { node: DocumentNode }) {
  return renderNode(node);
}
export function DocumentComparison({
  local,
  remote,
}: {
  local: ArticleDocument;
  remote: ArticleDocument;
}) {
  const left = local.doc.content ?? [],
    right = remote.doc.content ?? [];
  const differences: string[] = [];
  if (local.title !== remote.title) differences.push('标题不同');
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index],
      b = right[index];
    if (stableJson(a ?? null) === stableJson(b ?? null)) continue;
    differences.push(
      `第 ${index + 1} 段：${!a || !b ? '段落数量不同' : textOf(a) !== textOf(b) ? '文字不同' : '格式或结构不同'}`,
    );
  }
  return (
    <>
      <ul className="difference-summary" aria-label="差异摘要">
        {differences.length ? (
          differences.map((item) => <li key={item}>{item}</li>)
        ) : (
          <li>两份内容一致</li>
        )}
      </ul>
      <div className="comparison-columns">
        <section aria-label="本页草稿预览">
          <h3>本页草稿</h3>
          <h4>{local.title || '未命名文章'}</h4>
          <DocumentPart node={local.doc} />
        </section>
        <section aria-label="服务器版本预览">
          <h3>服务器版本</h3>
          <h4>{remote.title || '未命名文章'}</h4>
          <DocumentPart node={remote.doc} />
        </section>
      </div>
    </>
  );
}
