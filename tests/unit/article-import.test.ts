import { expect, it } from 'vitest';
import { readArticleFile } from '../../apps/web/src/article-import';

it('EDITOR-IMPORT-008 preserves an unsupported directive including nested Markdown, and locates later resource references', async () => {
  const directive = ':::note\n\n# 标题示意\n\n正文\n:::';
  const src = [
    directive,
    '',
    '![图](relative.png)',
    '',
    '# 真正的稿名',
    '',
    '#### 细节',
  ].join('\n');
  const result = await readArticleFile(new File([src], '草案.md'));
  expect(result.document.title).toBe('真正的稿名');
  expect(result.document.doc.content?.[0]).toMatchObject({
    type: 'codeBlock',
    content: [{ text: directive }],
  });
  expect(result.notices.map((n) => n.line)).toEqual([1, 8]);
  expect(result.document.doc.content?.at(-1)).toMatchObject({
    type: 'md:atx-heading',
    attrs: { level: 4 },
  });
});
it('EDITOR-IMPORT-008 retains extra table cells, and keeps resource examples inside code untouched', async () => {
  const table = '| A | B |\n| --- | --- |\n| 一 | 二 | 三 |';
  const code = '![图](https://example.invalid/1.png)\n$$';
  const result = await readArticleFile(
    new File([table + '\n\n```md\n' + code + '\n```'], '逐项核对.md'),
  );
  expect(result.document.title).toBe('逐项核对');
  expect(result.notices.map((n) => n.line)).toEqual([1]);
  expect(result.document.doc.content?.map((n) => n.content?.[0]?.text)).toEqual(
    [table, code],
  );
});
it('EDITOR-IMPORT-007 converts lists, quotes and code while preserving author order', async () => {
  const src = [
    '# 笔记',
    '',
    '> 引用',
    '',
    '1. 观察',
    '2. 对照',
    '',
    '```ts',
    '  const n = 2;',
    '```',
  ].join('\n');
  const result = await readArticleFile(new File([src], '稿.md'));
  expect(result.notices).toEqual([]);
  expect(result.document.doc.content?.map((n) => n.type)).toEqual([
    'blockquote',
    'md:order-list',
    'codeBlock',
  ]);
  expect(result.document.doc.content?.[2]?.content?.[0]?.text).toBe(
    '  const n = 2;',
  );
});

it('EDITOR-IMPORT-008 marks real resource references and keeps inline code examples', async () => {
  const result = await readArticleFile(
    new File(['示例 `![图](relative.png)`\n\n![图](relative.png)'], '图.md'),
  );
  expect(result.notices.map((n) => n.line)).toEqual([3]);
  expect(result.document.doc.content?.[0]?.type).toBe('md:paragraph');
});
it('EDITOR-IMPORT-008 explains an unreadable file', async () => {
  const file = new File(['正文'], '已移走.md');
  Object.defineProperty(file, 'arrayBuffer', {
    value: () =>
      Promise.reject(new DOMException('File unavailable', 'NotReadableError')),
  });
  await expect(readArticleFile(file)).rejects.toThrow('读取文件失败');
});

it('EDITOR-IMPORT-008 only real inline images are workspace references', async () => {
  const { mapWritingImages } = await import('@inkling/contracts');
  const src = 'inkling-image:' + 'a'.repeat(64) + '.png';
  const samples = [
    '``示例 ` ![图](' + src + ') ``',
    '\\![图](' + src + ')',
    '`<img src="' + src + '">`',
  ];
  const mixed = samples.join(' ') + ' ![正文图](' + src + ')';
  expect(mapWritingImages(mixed, () => '/real')).toBe(
    samples.join(' ') + ' ![正文图](/real)',
  );
});
