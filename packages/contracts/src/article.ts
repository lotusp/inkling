import { z } from 'zod';
import { tableGridSize } from './table';
export interface DocumentMark {
  type: string;
  attrs?: Record<string, string | null>;
}
export interface DocumentNode {
  type: string;
  attrs?: Record<string, string | number | number[] | null>;
  content?: DocumentNode[];
  text?: string;
  marks?: DocumentMark[];
}
const blocks = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'horizontalRule',
]);
const inline = new Set(['text', 'hardBreak']);
const marks = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
]);
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validArticleHref(href: unknown): href is string {
  return (
    typeof href === 'string' &&
    href.length <= 4096 &&
    /^(https?:\/\/|mailto:|#)/i.test(href) &&
    ![...href].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  );
}
export type DocumentVersion = 1 | 2;
export function requiresDocumentV2(type: string) {
  return type === 'table' || type === 'formulaBlock';
}
const maxNodes = 50_000;
const cellTypes = new Set(['tableHeader', 'tableCell']);
export function validDocumentNode(
  value: unknown,
  version: DocumentVersion = 1,
): value is DocumentNode {
  const stack: { node: unknown; depth: number; parent: string | undefined }[] =
    [{ node: value, depth: 0, parent: undefined }];
  let count = 0;
  let remainingTableSlots = maxNodes;
  while (stack.length) {
    const item = stack.pop();
    if (!item) return false;
    const { node, depth, parent } = item;
    if (
      ++count > maxNodes ||
      depth > 32 ||
      !record(node) ||
      typeof node.type !== 'string'
    )
      return false;
    const type = node.type;
    if (
      Object.keys(node).some(
        (k) => !['type', 'attrs', 'content', 'text', 'marks'].includes(k),
      )
    )
      return false;
    if (parent === undefined && type !== 'doc') return false;
    const isBlock =
      blocks.has(type) || (version === 2 && requiresDocumentV2(type));
    const plainText = parent === 'codeBlock' || parent === 'formulaBlock';
    if (
      parent === 'doc' ||
      parent === 'blockquote' ||
      parent === 'listItem' ||
      cellTypes.has(parent ?? '')
    ) {
      if (!isBlock) return false;
    } else if (parent === 'table') {
      if (type !== 'tableRow') return false;
    } else if (parent === 'tableRow') {
      if (!cellTypes.has(type)) return false;
    } else if (parent === 'bulletList' || parent === 'orderedList') {
      if (type !== 'listItem') return false;
    } else if (parent === 'paragraph' || parent === 'heading') {
      if (!inline.has(type)) return false;
    } else if (plainText && type !== 'text') return false;
    if (
      node.text !== undefined &&
      (type !== 'text' || typeof node.text !== 'string' || !node.text.length)
    )
      return false;
    if (type === 'text' && typeof node.text !== 'string') return false;
    if (node.attrs !== undefined && !record(node.attrs)) return false;
    const attrs = node.attrs ?? {};
    if (!record(attrs)) return false;
    const allowed =
      type === 'heading'
        ? ['level']
        : type === 'codeBlock'
          ? ['language']
          : type === 'orderedList'
            ? ['start', 'type']
            : cellTypes.has(type)
              ? ['colspan', 'rowspan', 'colwidth', 'align']
              : [];
    if (Object.keys(attrs).some((k) => !allowed.includes(k))) return false;
    if (cellTypes.has(type)) {
      const { colwidth, align } = attrs;
      if (
        colwidth != null &&
        (!Array.isArray(colwidth) ||
          colwidth.length !== (attrs.colspan ?? 1) ||
          !colwidth.every(
            (width: unknown) =>
              typeof width === 'number' &&
              Number.isSafeInteger(width) &&
              width >= 0,
          ))
      )
        return false;
      if (
        align != null &&
        align !== 'left' &&
        align !== 'right' &&
        align !== 'center'
      )
        return false;
    }
    if (type === 'heading' && attrs.level !== 2 && attrs.level !== 3)
      return false;
    if (
      type === 'codeBlock' &&
      attrs.language !== undefined &&
      attrs.language !== null &&
      (typeof attrs.language !== 'string' || attrs.language.length > 100)
    )
      return false;
    if (
      type === 'orderedList' &&
      ((attrs.start !== undefined &&
        (!Number.isSafeInteger(attrs.start) || Number(attrs.start) < 1)) ||
        (attrs.type !== undefined &&
          attrs.type !== null &&
          (typeof attrs.type !== 'string' ||
            !['1', 'a', 'A', 'i', 'I'].includes(attrs.type))))
    )
      return false;
    if (node.marks !== undefined) {
      if (!inline.has(type) || plainText || !Array.isArray(node.marks))
        return false;
      const seen = new Set<string>();
      for (const mark of node.marks) {
        if (
          !record(mark) ||
          typeof mark.type !== 'string' ||
          !marks.has(mark.type) ||
          seen.has(mark.type) ||
          Object.keys(mark).some((k) => !['type', 'attrs'].includes(k))
        )
          return false;
        seen.add(mark.type);
        if (mark.type === 'code' && node.marks.length !== 1) return false;
        if (mark.attrs !== undefined && !record(mark.attrs)) return false;
        const a = mark.attrs ?? {};
        if (!record(a)) return false;
        if (mark.type !== 'link') {
          if (Object.keys(a).length) return false;
          continue;
        }
        if (
          Object.keys(a).some(
            (k) => !['href', 'target', 'rel', 'class', 'title'].includes(k),
          )
        )
          return false;
        if (!validArticleHref(a.href)) return false;
        if (
          a.target !== undefined &&
          a.target !== null &&
          (typeof a.target !== 'string' ||
            !['_blank', '_self'].includes(a.target))
        )
          return false;
        for (const k of ['rel', 'class', 'title'])
          if (
            a[k] !== undefined &&
            a[k] !== null &&
            (typeof a[k] !== 'string' || String(a[k]).length > 500)
          )
            return false;
      }
    }
    if (node.content !== undefined && !Array.isArray(node.content))
      return false;
    const children = node.content ?? [];
    if (!Array.isArray(children)) return false;
    if (type === 'table') {
      const slots = tableGridSize(children, remainingTableSlots);
      if (!slots) return false;
      remainingTableSlots -= slots;
    }
    if (cellTypes.has(type) && !children.length) return false;
    if (inline.has(type) || type === 'horizontalRule') {
      if (children.length) return false;
    }
    if (
      ['doc', 'blockquote', 'bulletList', 'orderedList', 'listItem'].includes(
        type,
      ) &&
      !children.length
    )
      return false;
    if (
      type === 'listItem' &&
      (!record(children[0]) || children[0].type !== 'paragraph')
    )
      return false;
    for (const child of children)
      stack.push({ node: child, depth: depth + 1, parent: type });
  }
  return true;
}
export const ArticleTitle = z
  .string()
  .refine((x) => [...x].length <= 200, '标题不能超过 200 字符');
const documentSchema = <V extends DocumentVersion>(version: V) =>
  z
    .object({
      schemaVersion: z.literal(version),
      title: ArticleTitle,
      doc: z.custom<DocumentNode>(
        (doc) => validDocumentNode(doc, version),
        '不支持的正文结构',
      ),
    })
    .strict();
export const ArticleDocument = z
  .discriminatedUnion('schemaVersion', [documentSchema(1), documentSchema(2)])
  .refine(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).length <= 2 * 1024 * 1024,
    '正文超过 2 MiB',
  );
export type ArticleDocument = z.infer<typeof ArticleDocument>;
export const Id = z.string().uuid();
export const EnsureArticleCommand = z.object({ mutationId: Id }).strict();
export const SaveArticleCommand = z
  .object({ mutationId: Id, baseRevisionId: Id, document: ArticleDocument })
  .strict();
export type SaveArticleCommand = z.infer<typeof SaveArticleCommand>;
export const ArticleSnapshot = z.object({
  articleId: Id,
  headRevisionId: Id,
  headSeq: z.number().int().positive(),
  contentHash: z.string(),
  document: ArticleDocument,
  revisionBytes: z.number().nonnegative(),
  historyWarningBytes: z
    .number()
    .int()
    .positive()
    .default(64 * 1024 * 1024),
  historyLimitBytes: z
    .number()
    .int()
    .positive()
    .default(256 * 1024 * 1024),
});
export type ArticleSnapshot = z.infer<typeof ArticleSnapshot>;
export const SaveResult = z.object({
  mutationId: Id,
  articleId: Id,
  appliedRevisionId: Id,
  appliedSeq: z.number().int().positive(),
  contentHash: z.string(),
  committedAt: z.number(),
  changed: z.boolean(),
});
export type SaveResult = z.infer<typeof SaveResult>;
export const WorkspaceInfo = z.object({
  workspaceId: Id,
  currentArticleId: Id.nullable(),
});
export type WorkspaceInfo = z.infer<typeof WorkspaceInfo>;
