import { expect, it } from 'vitest';
import { ArticleDocument, type DocumentNode } from '@inkling/contracts';
import { formattedArticle } from '../fixtures/article-document';

it.each(['formulaBlock', 'mermaidBlock'])(
  'EDITOR-PREVIEW-004 stores only unmarked %s source in V2, including unfinished input',
  (type) => {
    const sourceBlock = {
      type,
      content: [
        {
          type: 'text',
          text: type === 'mermaidBlock' ? 'graph TD\n A -->' : '\\frac{',
        },
      ],
    };
    const parse = (schemaVersion: number, block: unknown) =>
      ArticleDocument.safeParse({
        schemaVersion,
        title: '',
        doc: { type: 'doc', content: [block] },
      }).success;
    expect(parse(2, sourceBlock)).toBe(true);
    expect(parse(2, { type })).toBe(true);
    expect(parse(1, sourceBlock)).toBe(false);
    expect(
      parse(2, { ...sourceBlock, attrs: { rendered: 'derived markup' } }),
    ).toBe(false);
    expect(parse(2, { ...sourceBlock, content: [{ type: 'paragraph' }] })).toBe(
      false,
    );
    expect(
      parse(2, {
        ...sourceBlock,
        content: [{ ...sourceBlock.content[0], marks: [{ type: 'bold' }] }],
      }),
    ).toBe(false);
  },
);

it('ARTICLE-SCHEMA-011 supports the current node/mark combinations and Unicode titles', () => {
  expect(ArticleDocument.safeParse(formattedArticle).success).toBe(true);
  for (const title of [
    '中'.repeat(200),
    '🧠'.repeat(200),
    'e\u0301'.repeat(100),
  ])
    expect(
      ArticleDocument.safeParse({ ...formattedArticle, title }).success,
    ).toBe(true);
  for (const title of [
    '中'.repeat(201),
    '🧠'.repeat(201),
    'e\u0301'.repeat(101),
  ])
    expect(
      ArticleDocument.safeParse({ ...formattedArticle, title }).success,
    ).toBe(false);
});

it('ARTICLE-SCHEMA-011 refuses incompatible marks and unsupported structures', () => {
  for (const node of [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '不能组合',
          marks: [{ type: 'code' }, { type: 'bold' }],
        },
      ],
    },
    { type: 'paragraph', content: null },
    { type: 'paragraph', attrs: null },
    { type: 'heading', attrs: { level: 1 } },
    { type: 'listItem', content: [{ type: 'heading', attrs: { level: 2 } }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'X', marks: [{ type: 'bold', attrs: null }] },
      ],
    },
  ])
    expect(
      ArticleDocument.safeParse({
        ...formattedArticle,
        doc: { type: 'doc', content: [node] },
      }).success,
    ).toBe(false);
});

it('ARTICLE-SCHEMA-011 enforces byte, node-count and depth limits', () => {
  const withDoc = (doc: DocumentNode) =>
    ArticleDocument.safeParse({ ...formattedArticle, doc }).success;
  const large = (length: number): DocumentNode => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '中'.repeat(length) }],
      },
    ],
  });
  expect(withDoc(large(650_000))).toBe(true);
  expect(withDoc(large(700_000))).toBe(false);
  expect(
    withDoc({
      type: 'doc',
      content: Array.from({ length: 50_000 }, () => ({ type: 'paragraph' })),
    }),
  ).toBe(false);
  let nested: DocumentNode = { type: 'paragraph' };
  for (let i = 0; i < 33; i++)
    nested = { type: 'blockquote', content: [nested] };
  expect(withDoc({ type: 'doc', content: [nested] })).toBe(false);
});

it('EDITOR-LINK-002 preserves allowed article links and rejects invalid targets', () => {
  const accepts = (href: string) =>
    ArticleDocument.safeParse({
      ...formattedArticle,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '原文',
                marks: [{ type: 'link', attrs: { href } }],
              },
            ],
          },
        ],
      },
    }).success;
  for (const href of [
    'http://example.org',
    'HTTPS://example.org/文章',
    'mailto:author@example.org',
    '#参考',
  ])
    expect(accepts(href)).toBe(true);
  for (const href of [
    '',
    'ftp://example.org',
    '没有协议',
    'https://example.org/a b',
    '#' + 'a'.repeat(4096),
  ])
    expect(accepts(href)).toBe(false);
});

it('EDITOR-TABLE-003 validates spans, column widths and the combined grid size for pasted tables', () => {
  const cell = (attrs = {}) => ({
    type: 'tableCell',
    attrs,
    content: [{ type: 'paragraph' }],
  });
  const row = (...cells: unknown[]) => ({ type: 'tableRow', content: cells });
  const table = (...rows: unknown[]) => ({ type: 'table', content: rows });
  const accepts = (...tables: unknown[]) =>
    ArticleDocument.safeParse({
      schemaVersion: 2,
      title: '',
      doc: { type: 'doc', content: tables },
    }).success;
  expect(accepts(table(row(cell({ rowspan: 2 }), cell()), row(cell())))).toBe(
    true,
  );
  expect(accepts(table(row(cell({ rowspan: 2 })), { type: 'tableRow' }))).toBe(
    true,
  );
  expect(
    accepts(
      table(
        row(cell({ colspan: 2, colwidth: [100, 0], align: 'center' })),
        row(cell(), cell()),
      ),
    ),
  ).toBe(true);
  for (const attrs of [
    { rowspan: 2 },
    { colspan: null },
    { colspan: 0 },
    { colspan: 1.5 },
    { colwidth: [80, 10] },
    { colwidth: [-1] },
    { align: 'unknown' },
  ])
    expect(accepts(table(row(cell(attrs))))).toBe(false);
  expect(
    accepts(
      table(row(cell(), cell({ rowspan: 2 })), row(cell({ colspan: 2 }))),
    ),
  ).toBe(false);
  const wide = table(row(cell({ colspan: 25_001 })));
  expect(accepts(wide, wide)).toBe(false);
});
