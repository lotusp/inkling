import type { ArticleDocument, DocumentNode } from '@inkling/contracts';

const text = (value: string): DocumentNode => ({ type: 'text', text: value });
const paragraph = (value: string): DocumentNode => ({
  type: 'paragraph',
  content: [text(value)],
});

// Current StarterKit formats, including formats available through shortcuts/paste.
export const formattedArticle: ArticleDocument = {
  schemaVersion: 1,
  title: '技术写作：判断与依据 👩‍💻',
  doc: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [text('二级标题')] },
      { type: 'heading', attrs: { level: 3 }, content: [text('三级标题')] },
      {
        type: 'paragraph',
        content: [
          {
            ...text('组合强调'),
            marks: [
              { type: 'bold' },
              { type: 'italic' },
              { type: 'strike' },
              { type: 'underline' },
            ],
          },
          { type: 'hardBreak' },
          { ...text('inline_code'), marks: [{ type: 'code' }] },
          {
            ...text('参考链接'),
            marks: [
              {
                type: 'link',
                attrs: {
                  href: 'https://example.com/reference',
                  target: '_blank',
                  rel: 'noopener noreferrer nofollow',
                  class: null,
                  title: '资料',
                },
              },
            ],
          },
        ],
      },
      { type: 'blockquote', content: [paragraph('引文与边界')] },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              paragraph('无序条目'),
              {
                type: 'orderedList',
                attrs: { start: 3, type: 'a' },
                content: [
                  { type: 'listItem', content: [paragraph('嵌套有序条目')] },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [text('const insight = true;\nconsole.log(insight);')],
      },
      { type: 'horizontalRule' },
      paragraph('结尾中文 🧠 e\u0301'),
    ],
  },
};
