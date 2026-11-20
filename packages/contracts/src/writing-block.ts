// Native Markdown block metadata. The editor tree is stored without DOM or view state.
import { z } from 'zod';
const empty = z.strictObject({});
const string = z.string().max(512);
const list = z.strictObject({ marker: string, loose: z.boolean() });
const meta = {
  paragraph: empty,
  'atx-heading': z.strictObject({ level: z.number().int().min(1).max(6) }),
  'setext-heading': z.strictObject({
    level: z.number().int().min(1).max(2),
    underline: string,
  }),
  'thematic-break': empty,
  'code-block': z.strictObject({ type: string, lang: string }),
  'html-block': empty,
  'block-quote': empty,
  'list-item': empty,
  'order-list': z.strictObject({
    start: z.number().int().nonnegative(),
    loose: z.boolean(),
    delimiter: string,
  }),
  'bullet-list': list,
  'task-list': list,
  'task-list-item': z.strictObject({ checked: z.boolean() }),
  table: empty,
  'table.row': empty,
  'table.cell': z.strictObject({
    align: z.enum(['none', 'left', 'right', 'center', '']),
  }),
  'math-block': z.strictObject({ mathStyle: string }),
  frontmatter: z.strictObject({ lang: string, style: string }),
  diagram: z.strictObject({
    lang: string,
    type: z.enum(['mermaid', 'plantuml', 'vega-lite']),
  }),
  footnote: z.strictObject({ identifier: string }),
};
const nested: Record<string, string> = {
  'list-item': 'list',
  'task-list-item': 'task-list',
  'table.row': 'table',
  'table.cell': 'table.row',
};
export function validWritingBlock(
  kind: string,
  attrs: unknown,
  parent: string | undefined,
  children: unknown[],
): boolean {
  if (
    !Object.hasOwn(meta, kind) ||
    !meta[kind as keyof typeof meta].safeParse(attrs).success
  )
    return false;
  const expectedParent = nested[kind];
  if (
    expectedParent === 'list' &&
    parent !== 'md:order-list' &&
    parent !== 'md:bullet-list'
  )
    return false;
  if (
    expectedParent &&
    expectedParent !== 'list' &&
    parent !== 'md:' + expectedParent
  )
    return false;
  if (
    !expectedParent &&
    ![
      'doc',
      'md:list-item',
      'md:task-list-item',
      'md:block-quote',
      'md:footnote',
    ].includes(parent ?? '')
  )
    return false;
  const types = children.map((n) =>
    typeof n === 'object' && n && 'type' in n ? n.type : null,
  );
  if (kind === 'order-list' || kind === 'bullet-list')
    return types.length > 0 && types.every((t) => t === 'md:list-item');
  if (kind === 'task-list')
    return types.length > 0 && types.every((t) => t === 'md:task-list-item');
  if (kind === 'table') {
    const width = (children[0] as { content?: unknown[] } | undefined)?.content
      ?.length;
    return (
      !!width &&
      types.every((t) => t === 'md:table.row') &&
      children.every(
        (c) => (c as { content?: unknown[] }).content?.length === width,
      )
    );
  }
  if (kind === 'table.row')
    return types.length > 0 && types.every((t) => t === 'md:table.cell');
  if (['list-item', 'task-list-item', 'block-quote', 'footnote'].includes(kind))
    return (
      types.length > 0 &&
      types.every((t) => typeof t === 'string' && t.startsWith('md:'))
    );
  return types.length === 0 || (types.length === 1 && types[0] === 'text');
}
