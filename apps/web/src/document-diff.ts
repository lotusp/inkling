import type { ArticleDocument, DocumentNode } from '@inkling/contracts';
import { stableJson } from './draft-store';
export interface TextChange {
  kind: 'same' | 'removed' | 'added';
  text: string;
}
// Bounded LCS for short strings; large blocks use a linear prefix/suffix diff.
export function textChanges(before: string, after: string): TextChange[] {
  const a = [...before],
    b = [...after];
  let prefix = 0,
    suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
    prefix++;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  const x = a.slice(prefix, a.length - suffix),
    y = b.slice(prefix, b.length - suffix),
    out: TextChange[] = [];
  const add = (kind: TextChange['kind'], text: string) => {
    if (!text) return;
    const last = out.at(-1);
    if (last?.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  add('same', a.slice(0, prefix).join(''));
  if (x.length * y.length <= 100_000) {
    const table = Array.from(
      { length: x.length + 1 },
      () => new Uint32Array(y.length + 1),
    );
    for (let i = x.length - 1; i >= 0; i--)
      for (let j = y.length - 1; j >= 0; j--)
        table[i]![j] =
          x[i] === y[j]
            ? table[i + 1]![j + 1]! + 1
            : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    let i = 0,
      j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        add('same', x[i++]!);
        j++;
      } else if (
        i < x.length &&
        (j === y.length || table[i + 1]![j]! >= table[i]![j + 1]!)
      )
        add('removed', x[i++]!);
      else add('added', y[j++]!);
    }
  } else {
    add('removed', x.join(''));
    add('added', y.join(''));
  }
  add('same', suffix ? a.slice(a.length - suffix).join('') : '');
  return out;
}
export function nodeText(node: DocumentNode): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.text !== undefined) return node.text;
  const separator = ['paragraph', 'heading', 'codeBlock'].includes(node.type)
    ? ''
    : '\n';
  return node.content?.map(nodeText).join(separator) ?? '';
}
function structure(node: DocumentNode): unknown {
  return {
    type: node.type,
    attrs: node.attrs ?? {},
    marks: node.marks ?? [],
    content: node.content?.map(structure) ?? [],
  };
}
export function documentChanges(
  before: ArticleDocument,
  after: ArticleDocument,
) {
  const a = before.doc.content ?? [],
    b = after.doc.content ?? [];
  // Match equal blocks across insertions with bounded look-ahead, without quadratic tables for large articles.
  const out: { label: string; changes: TextChange[]; format: boolean }[] = [];
  let i = 0,
    j = 0;
  const keysA = a.map(stableJson),
    keysB = b.map(stableJson);
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && keysA[i] === keysB[j]) {
      i++;
      j++;
      continue;
    }
    let left = a[i],
      right = b[j];
    if (left && right && keysB.slice(j + 1, j + 33).includes(keysA[i]!))
      left = undefined;
    else if (left && right && keysA.slice(i + 1, i + 33).includes(keysB[j]!))
      right = undefined;
    out.push({
      label: !left
        ? `新增第 ${j + 1} 段`
        : !right
          ? `删除第 ${i + 1} 段`
          : `第 ${i + 1} → ${j + 1} 段`,
      changes: textChanges(
        left ? nodeText(left) : '',
        right ? nodeText(right) : '',
      ),
      format:
        !!left &&
        !!right &&
        stableJson(structure(left)) !== stableJson(structure(right)),
    });
    if (left) i++;
    if (right) j++;
  }
  return { title: textChanges(before.title, after.title), blocks: out };
}
