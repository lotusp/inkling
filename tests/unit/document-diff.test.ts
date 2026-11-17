import { expect, it } from 'vitest';
import {
  textChanges,
  documentChanges,
  nodeText,
} from '../../apps/web/src/document-diff';
import type { ArticleDocument } from '@inkling/contracts';
import { formattedArticle } from '../fixtures/article-document';
it('REVISION-COMPARE-002 preserves Unicode and reports separated title edits', () => {
  const changes = textChanges('原先🧠的个人观点', '新🧠的个人判断');
  expect(
    changes
      .filter((x) => x.kind !== 'added')
      .map((x) => x.text)
      .join(''),
  ).toBe('原先🧠的个人观点');
  expect(
    changes
      .filter((x) => x.kind !== 'removed')
      .map((x) => x.text)
      .join(''),
  ).toBe('新🧠的个人判断');
  expect(changes.some((x) => x.kind === 'same' && x.text.includes('🧠'))).toBe(
    true,
  );
});
it('REVISION-COMPARE-002 aligns inserted blocks and detects pure formatting, nested lists and code newlines', () => {
  const before: ArticleDocument = structuredClone(formattedArticle);
  const after: ArticleDocument = structuredClone(before);
  after.doc.content!.unshift({ type: 'paragraph' });
  const diff = documentChanges(before, after);
  expect(diff.blocks).toHaveLength(1);
  expect(diff.blocks[0]!.label).toBe('新增第 1 段');
  expect(nodeText(before.doc)).toContain(
    'const insight = true;\nconsole.log(insight);',
  );
  expect(nodeText(before.doc)).toContain('无序条目');
  after.doc.content![1]!.attrs = { level: 3 };
  expect(documentChanges(before, after).blocks.some((b) => b.format)).toBe(
    true,
  );
});
it('REVISION-COMPARE-002 bounds large text diff work and retains all content', () => {
  const a = '甲'.repeat(10000),
    b = '乙'.repeat(10000),
    result = textChanges(a, b);
  expect(result).toEqual([
    { kind: 'removed', text: a },
    { kind: 'added', text: b },
  ]);
});
it('REVISION-COMPARE-002 whole-block additions and removals preserve long code verbatim', () => {
  const code = 'function example() {}\n'.repeat(10000);
  expect(textChanges(code, '')).toEqual([{ kind: 'removed', text: code }]);
  expect(textChanges('', code)).toEqual([{ kind: 'added', text: code }]);
});
