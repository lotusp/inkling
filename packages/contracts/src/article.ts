import { z } from 'zod';
export interface DocumentMark {
  type: string;
  attrs?: Record<string, string | null>;
}
export interface DocumentNode {
  type: string;
  attrs?: Record<string, string | number | null>;
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
export function validDocumentNode(value: unknown): value is DocumentNode {
  const stack: { node: unknown; depth: number; parent: string | undefined }[] =
    [{ node: value, depth: 0, parent: undefined }];
  let count = 0;
  while (stack.length) {
    const item = stack.pop();
    if (!item) return false;
    const { node, depth, parent } = item;
    if (
      ++count > 50_000 ||
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
    if (parent === 'doc' || parent === 'blockquote') {
      if (!blocks.has(type)) return false;
    }
    if (parent === 'bulletList' || parent === 'orderedList') {
      if (type !== 'listItem') return false;
    }
    if (parent === 'listItem' && !blocks.has(type)) return false;
    if (parent === 'paragraph' || parent === 'heading') {
      if (!inline.has(type)) return false;
    }
    if (parent === 'codeBlock' && type !== 'text') return false;
    if (!['doc', 'listItem', ...blocks, ...inline].includes(type)) return false;
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
            : [];
    if (Object.keys(attrs).some((k) => !allowed.includes(k))) return false;
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
      if (
        !inline.has(type) ||
        parent === 'codeBlock' ||
        !Array.isArray(node.marks)
      )
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
        if (
          typeof a.href !== 'string' ||
          a.href.length > 4096 ||
          !/^(https?:\/\/|mailto:|#)/i.test(a.href) ||
          [...a.href].some(
            (character) =>
              character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
          )
        )
          return false;
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
export const ArticleDocument = z
  .object({
    schemaVersion: z.literal(1),
    title: z
      .string()
      .refine((x) => [...x].length <= 200, '标题不能超过 200 字符'),
    doc: z.custom<DocumentNode>(validDocumentNode, '不支持的正文结构'),
  })
  .strict()
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
