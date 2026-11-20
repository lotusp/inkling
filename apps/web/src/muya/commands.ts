import type { TState } from '@muyajs/core';
import type { WritingContext } from './context';
import type { ContentBlock } from './context';
type Scroll = Exclude<
  WritingContext['muya']['editor']['scrollPage'],
  void | null
>;
type NativeBlock = Exclude<ContentBlock['outMostBlock'], void | null>;
const paragraph = (text = ''): TState => ({ name: 'paragraph', text });
const cell = () => ({
  name: 'table.cell' as const,
  meta: { align: 'none' },
  text: '',
});
export const tableRow = (width: number) => ({
  name: 'table.row' as const,
  children: Array.from({ length: width }, cell),
});
export function createBlock(
  surface: WritingContext,
  state: TState,
): NativeBlock {
  const scroll = surface.muya.editor.scrollPage!;
  const factory = scroll.constructor as unknown as {
    loadBlock(name: string): {
      create(muya: WritingContext['muya'], state: TState): NativeBlock;
    };
  };
  return factory.loadBlock(state.name).create(surface.muya, state);
}
export function commandTarget(surface: WritingContext) {
  const selection = surface.muya.editor.selection.getSelection();
  const block =
    selection?.focusBlock ??
    surface.muya.editor.scrollPage?.lastContentInDescendant();
  if (!block) return null;
  const cursor = block.getCursor();
  const inline = block as typeof block & {
    getFormatsInRange?: () => {
      formats: {
        type: string;
        href?: string;
        anchor?: string;
        range: { start: number; end: number };
      }[];
    };
  };
  const link = inline
    .getFormatsInRange?.()
    .formats.find((token) => token.type === 'link');
  return {
    block,
    link,
    original: block.text,
    start: cursor?.start.offset ?? block.text.length,
    end: cursor?.end.offset ?? block.text.length,
  };
}
export type CommandTarget = NonNullable<ReturnType<typeof commandTarget>>;
export function formatBlock(
  surface: WritingContext,
  target: CommandTarget,
  kind: 'bold' | 'heading' | 'list' | 'quote' | 'code',
) {
  surface.muya.editor.history.cutoff();
  const { block } = target;
  const outer = block.outMostBlock;
  if (!outer?.domNode?.isConnected || !surface.isEditable || surface.composing)
    return;
  if (kind === 'bold') {
    const prefix =
      outer.blockName === 'atx-heading'
        ? (block.text.match(/^#{1,6}\s+/)?.[0] ?? '')
        : '';
    const old = block.text.slice(prefix.length);
    block.text =
      prefix +
      (old.startsWith('**') && old.endsWith('**')
        ? old.slice(2, -2)
        : '**' + old + '**');
    block.setCursor(block.text.length, block.text.length, true);
    return;
  }
  const text = block.text.replace(/^#{1,6}\s+/, '');
  const plain = paragraph(text);
  let state: TState;
  if (kind === 'quote')
    state =
      outer.blockName === 'block-quote'
        ? plain
        : { name: 'block-quote', children: [plain] };
  else if (kind === 'code')
    state =
      outer.blockName === 'code-block'
        ? plain
        : { name: 'code-block', meta: { type: 'fenced', lang: '' }, text };
  else if (kind === 'heading')
    state =
      outer.blockName === 'atx-heading'
        ? plain
        : { name: 'atx-heading', meta: { level: 2 }, text: '## ' + text };
  else
    state =
      outer.blockName === 'bullet-list'
        ? plain
        : {
            name: 'bullet-list',
            meta: { marker: '-', loose: false },
            children: [{ name: 'list-item', children: [plain] }],
          };
  // Preserve surrounding items when formatting a nested paragraph.
  const parent = block.parent;
  if (!parent) return;
  const replace =
    (outer.blockName === 'block-quote' &&
      kind === 'quote' &&
      outer.length() === 1) ||
    (outer.blockName === 'bullet-list' &&
      kind === 'list' &&
      outer.length() === 1) ||
    outer.blockName === 'code-block'
      ? outer
      : parent;
  if (
    replace !== outer &&
    !['paragraph', 'atx-heading', 'setext-heading'].includes(replace.blockName)
  )
    return;
  const next = createBlock(surface, state);
  replace.replaceWith(next);
  const content = next.lastContentInDescendant();
  content?.setCursor(content.text.length, content.text.length, true);
}
export function insertTechnical(
  surface: WritingContext,
  target: CommandTarget,
  kind: 'table' | 'formula' | 'mermaid',
  source = '',
) {
  surface.muya.editor.history.cutoff();
  const scroll = surface.muya.editor.scrollPage;
  const { block, end } = target,
    outer = block.outMostBlock;
  if (
    !scroll ||
    !outer?.domNode?.isConnected ||
    !surface.isEditable ||
    surface.composing
  )
    return;
  const state: TState =
    kind === 'table'
      ? { name: 'table', children: [tableRow(2), tableRow(2)] }
      : kind === 'formula'
        ? { name: 'math-block', meta: { mathStyle: '' }, text: source }
        : {
            name: 'diagram',
            meta: { lang: 'yaml', type: 'mermaid' },
            text: source,
          };
  const next = createBlock(surface, state),
    right = outer.next;
  if (outer.blockName === 'paragraph') {
    const tail = block.text.slice(end);
    if (end === 0) scroll.insertBefore(next, outer);
    else {
      block.text = block.text.slice(0, end);
      scroll.insertBefore(next, right);
      if (tail)
        scroll.insertBefore(createBlock(surface, paragraph(tail)), right);
    }
  } else scroll.insertBefore(next, right);
  if (!next.next) scroll.append(createBlock(surface, paragraph()), 'user');
  next.firstContentInDescendant()?.setCursor(0, 0, true);
}
export function appendBlocks(
  surface: WritingContext,
  scroll: Scroll,
  blocks: TState[],
) {
  scroll.append(...blocks.map((b) => createBlock(surface, b)), 'user');
}

export const tableCommands = [
  '在下方插入行',
  '在右侧插入列',
  '删除当前行',
  '删除当前列',
  '删除表格',
] as const;
export function changeTable(
  surface: WritingContext,
  target: CommandTarget,
  command: (typeof tableCommands)[number],
) {
  surface.muya.editor.history.cutoff();
  const cellBlock = target.block.closestBlock('table.cell'),
    row = cellBlock?.parent,
    grid = row?.parent;
  const table = target.block.outMostBlock;
  if (
    !surface.isEditable ||
    surface.composing ||
    !table?.domNode?.isConnected ||
    !grid ||
    !row ||
    !cellBlock
  )
    return;
  const state = table.getState();
  if (state.name !== 'table') return;
  let r = grid.offset(row),
    c = row.offset(cellBlock);
  if (
    command === '删除表格' ||
    (command === '删除当前行' && state.children.length === 1) ||
    (command === '删除当前列' && state.children[0]!.children.length === 1)
  ) {
    const after = table.next?.firstContentInDescendant(),
      before = table.prev?.lastContentInDescendant();
    if (after || before) {
      table.remove();
      (after || before)?.setCursor(0, 0, true);
    } else {
      const empty = createBlock(surface, paragraph());
      table.replaceWith(empty);
      empty.firstContentInDescendant()?.setCursor(0, 0, true);
    }
    return;
  }
  if (command === '在下方插入行') {
    state.children.splice(
      r + 1,
      0,
      tableRow(state.children[r]!.children.length),
    );
    r++;
  } else if (command === '在右侧插入列') {
    state.children.forEach((row) => row.children.splice(c + 1, 0, cell()));
    c++;
  } else if (command === '删除当前行') {
    state.children.splice(r, 1);
    r = Math.min(r, state.children.length - 1);
  } else {
    state.children.forEach((row) => row.children.splice(c, 1));
    c = Math.min(c, state.children[0]!.children.length - 1);
  }
  const next = createBlock(surface, state);
  table.replaceWith(next);
  const nextRow = next.domNode?.querySelectorAll('tr').item(r);
  const cellEl = nextRow
    ?.querySelectorAll<HTMLElement>('.mu-table-cell-content')
    .item(c);
  const content = (
    cellEl as (HTMLElement & { __MUYA_BLOCK__?: ContentBlock }) | null
  )?.__MUYA_BLOCK__;
  content?.setCursor(0, 0, true);
}
