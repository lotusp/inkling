import { expect, it } from 'vitest';
import { ArticleDocument, type DocumentNode } from '@inkling/contracts';
import { formattedArticle } from '../fixtures/article-document';

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
