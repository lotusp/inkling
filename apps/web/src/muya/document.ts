import {
  mapWritingImages,
  imageNamePattern,
  type DocumentNode,
} from '@inkling/contracts';
import type { TState } from '@muyajs/core';

const containers = new Set([
  'table',
  'table.row',
  'block-quote',
  'order-list',
  'bullet-list',
  'list-item',
  'task-list',
  'task-list-item',
  'footnote',
]);
const leafText = (text: string): DocumentNode[] =>
  text ? [{ type: 'text', text }] : [];
function assetText(kind: string, text: string, storing: boolean) {
  if (
    !['paragraph', 'atx-heading', 'setext-heading', 'table.cell'].includes(kind)
  )
    return text;
  const prefix = location.origin + '/api/images/',
    scheme = 'inkling-image:';
  return mapWritingImages(text, (src) => {
    const from = storing ? prefix : scheme,
      to = storing ? scheme : prefix;
    return src.startsWith(from) && imageNamePattern.test(src.slice(from.length))
      ? to + src.slice(from.length)
      : src;
  });
}
function encode(block: TState): DocumentNode {
  const meta = 'meta' in block ? block.meta : undefined;
  return {
    type: 'md:' + block.name,
    ...(meta ? { attrs: { ...meta } } : {}),
    ...('children' in block
      ? { content: block.children.map(encode) }
      : { content: leafText(assetText(block.name, block.text, true)) }),
  };
}
function commonBlock(block: TState): DocumentNode {
  if (block.name === 'paragraph') {
    const bold = /^\*\*([^*\n]+)\*\*$/.exec(block.text);
    if (bold)
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: bold[1]!, marks: [{ type: 'bold' }] }],
      };
    if (!/[\\*_~`[<]/.test(block.text))
      return block.text
        ? { type: 'paragraph', content: leafText(block.text) }
        : { type: 'paragraph' };
  }
  if (block.name === 'atx-heading' && [2, 3].includes(block.meta.level)) {
    const prefix = '#'.repeat(block.meta.level) + ' ';
    if (
      block.text.startsWith(prefix) &&
      !/[\\*_~`[<]/.test(block.text.slice(prefix.length))
    )
      return {
        type: 'heading',
        attrs: { level: block.meta.level },
        content: leafText(block.text.slice(prefix.length)),
      };
  }
  if (block.name === 'code-block' && block.meta.type === 'fenced')
    return {
      type: 'codeBlock',
      attrs: { language: block.meta.lang || null },
      content: leafText(block.text),
    };
  if (block.name === 'math-block' && !block.meta.mathStyle)
    return { type: 'formulaBlock', content: leafText(block.text) };
  if (block.name === 'diagram' && block.meta.type === 'mermaid')
    return { type: 'mermaidBlock', content: leafText(block.text) };
  if (
    block.name === 'block-quote' &&
    block.children.every(
      (b) => b.name === 'paragraph' && commonBlock(b).type === 'paragraph',
    )
  )
    return { type: 'blockquote', content: block.children.map(commonBlock) };
  if (
    block.name === 'table' &&
    block.children.every((r) =>
      r.children.every((c) => !/[\\*_~`[<]/.test(c.text)),
    )
  )
    return {
      type: 'table',
      content: block.children.map((r, i) => ({
        type: 'tableRow',
        content: r.children.map((c) => ({
          type: i === 0 ? 'tableHeader' : 'tableCell',
          attrs: {
            colspan: 1,
            rowspan: 1,
            colwidth: null,
            align: c.meta.align === 'none' ? null : c.meta.align,
          },
          content: [
            c.text
              ? { type: 'paragraph', content: leafText(c.text) }
              : { type: 'paragraph' },
          ],
        })),
      })),
    };
  return encode(block);
}
export function writeBlocks(blocks: TState[]): DocumentNode {
  return { type: 'doc', content: blocks.map(commonBlock) };
}
function inline(node: DocumentNode): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type !== 'text') return (node.content ?? []).map(inline).join('');
  let text = node.text ?? '';
  for (const mark of node.marks ?? []) {
    const delimiter: Record<string, string> = {
      bold: '**',
      italic: '*',
      strike: '~~',
      code: '`',
    };
    if (mark.type === 'link') text = '[' + text + '](' + mark.attrs?.href + ')';
    else if (mark.type === 'underline') text = '<u>' + text + '</u>';
    else if (delimiter[mark.type])
      text = delimiter[mark.type] + text + delimiter[mark.type];
  }
  return text;
}
function decode(node: DocumentNode): TState {
  const kind = node.type.slice(3);
  const meta = node.attrs ? { meta: node.attrs } : {};
  const children = node.content ?? [];
  // The shared document validator checks each native block kind, metadata and child shape.
  if (node.type.startsWith('md:'))
    return (
      containers.has(kind)
        ? { name: kind, ...meta, children: children.map(decode) }
        : { name: kind, ...meta, text: assetText(kind, inline(node), false) }
    ) as TState;
  switch (node.type) {
    case 'paragraph':
      return { name: 'paragraph', text: inline(node) };
    case 'heading': {
      const level = Number(node.attrs?.level ?? 2);
      return {
        name: 'atx-heading',
        meta: { level },
        text: '#'.repeat(level) + ' ' + inline(node),
      };
    }
    case 'codeBlock':
      return {
        name: 'code-block',
        meta: { type: 'fenced', lang: String(node.attrs?.language ?? '') },
        text: inline(node),
      };
    case 'horizontalRule':
      return { name: 'thematic-break', text: '---' };
    case 'formulaBlock':
      return {
        name: 'math-block',
        meta: { mathStyle: '' },
        text: inline(node),
      };
    case 'mermaidBlock':
      return {
        name: 'diagram',
        meta: { type: 'mermaid', lang: 'yaml' },
        text: inline(node),
      };
    case 'blockquote':
      return { name: 'block-quote', children: children.map(decode) };
    case 'bulletList':
    case 'orderedList': {
      const items = children.map((item) => ({
        name: 'list-item' as const,
        children: (item.content ?? []).map(decode),
      }));
      return node.type === 'bulletList'
        ? {
            name: 'bullet-list',
            meta: { marker: '-', loose: false },
            children: items,
          }
        : {
            name: 'order-list',
            meta: {
              start: Number(node.attrs?.start ?? 1),
              delimiter: '.',
              loose: false,
            },
            children: items,
          };
    }
    case 'table':
      return {
        name: 'table',
        children: children.map((row) => ({
          name: 'table.row',
          children: (row.content ?? []).map((cell) => ({
            name: 'table.cell',
            meta: { align: String(cell.attrs?.align ?? 'none') },
            text: (cell.content ?? []).map(inline).join('\n'),
          })),
        })),
      };
    default:
      throw new Error('正文结构不受支持，请保留原稿。');
  }
}
export function readBlocks(doc: DocumentNode): TState[] {
  return doc.content?.length
    ? doc.content.map(decode)
    : [{ name: 'paragraph', text: '' }];
}
