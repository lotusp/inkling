import { Marked, type Token, type MarkedToken } from 'marked';
import type { TState } from '@muyajs/core';
import { validArticleHref } from '@inkling/contracts';
import { writeBlocks } from './muya/document';

// Let the block lexer own fenced code, lists and tables. A display formula
// needs its own token so blank lines and Markdown-looking LaTeX stay in it.
const markdown = new Marked({
  gfm: true,
  extensions: [
    {
      name: 'formula',
      level: 'block',
      start(text) {
        return text.match(/(?:^|\n)(?=\$\$[ \t]*\n)/)?.index;
      },
      tokenizer(text) {
        if (!text.startsWith('$$')) return;
        const m = /^\$\$[ \t]*\n([\s\S]*?)^\$\$[ \t]*(?:\n|$)/m.exec(text);
        if (m?.index === 0)
          return { type: 'formula', raw: m[0], text: m[1]!.replace(/\n$/, '') };
      },
    },
    {
      name: 'directive',
      level: 'block',
      start(text) {
        return text.match(/(?:^|\n)(?=:{3,}[^:\s])/)?.index;
      },
      tokenizer(text) {
        const open = /^(:{3,})[ \t]*[a-z][^\n]*(?:\n|$)/i.exec(text);
        if (!open) return;
        const end = new RegExp('^' + open[1] + '[ \\t]*(?:\\n|$)', 'm').exec(
          text.slice(open[0].length),
        );
        const raw = end
          ? text.slice(0, open[0].length + end.index + end[0].length)
          : text;
        return { type: 'directive', raw };
      },
    },
  ],
});

export interface ImportNotice {
  line: number;
  message: string;
}
function code(text: string, lang = ''): TState {
  return { name: 'code-block', meta: { type: 'fenced', lang }, text };
}
function toBlocks(tokens: Token[], depth = 0): TState[] {
  if (depth > 40) throw new Error('嵌套层次过深');
  return tokens.flatMap((token): TState[] => {
    if (token.type === 'formula')
      return [
        {
          name: 'math-block',
          meta: { mathStyle: '' },
          text: String(token.text),
        },
      ];
    const t = token as MarkedToken;
    switch (t.type) {
      case 'space':
        return [];
      case 'paragraph':
      case 'text':
      case 'def':
        return [{ name: 'paragraph', text: t.raw.replace(/\n+$/, '') }];
      case 'heading':
        return [
          {
            name: 'atx-heading',
            meta: { level: t.depth },
            text: '#'.repeat(t.depth) + ' ' + t.text,
          },
        ];
      case 'hr':
        return [{ name: 'thematic-break', text: t.raw.trim() }];
      case 'code': {
        if (t.lang === 'mermaid')
          return [
            {
              name: 'diagram',
              meta: { type: 'mermaid', lang: 'yaml' },
              text: t.text,
            },
          ];
        if (t.lang && !/^[\w.+#-]{1,100}$/.test(t.lang))
          throw new Error('代码围栏包含额外参数');
        return [code(t.text, t.lang)];
      }
      case 'blockquote':
        return [
          { name: 'block-quote', children: toBlocks(t.tokens, depth + 1) },
        ];
      case 'list': {
        const marker = t.raw.trimStart()[0]!;
        const items = t.items.map((item) => {
          const blocks = toBlocks(item.tokens, depth + 1);
          return blocks.length
            ? blocks
            : [{ name: 'paragraph' as const, text: '' }];
        });
        if (t.items.some((i) => i.task)) {
          if (t.ordered || !t.items.every((i) => i.task))
            throw new Error('混合任务列表');
          return [
            {
              name: 'task-list',
              meta: { marker, loose: t.loose },
              children: t.items.map((it, i) => ({
                name: 'task-list-item',
                meta: { checked: !!it.checked },
                children: items[i]!,
              })),
            },
          ];
        }
        const children = items.map((blocks) => ({
          name: 'list-item' as const,
          children: blocks,
        }));
        return t.ordered
          ? [
              {
                name: 'order-list',
                meta: {
                  start: Number(t.start),
                  loose: t.loose,
                  delimiter: /^\s*\d+\)/.test(t.raw) ? ')' : '.',
                },
                children,
              },
            ]
          : [
              {
                name: 'bullet-list',
                meta: { marker, loose: t.loose },
                children,
              },
            ];
      }
      case 'table': {
        // GFM silently discards surplus cells. Keep the source if that would lose text.
        for (const line of t.raw.trimEnd().split('\n').slice(2)) {
          const cells = line
            .trim()
            .replace(/^\||\|$/g, '')
            .split(/(?<!\\)\|/);
          if (cells.length > t.header.length)
            throw new Error('表格行超出表头列数');
        }
        return [
          {
            name: 'table',
            children: [t.header, ...t.rows].map((row) => ({
              name: 'table.row',
              children: row.map((cell, col) => ({
                name: 'table.cell',
                meta: { align: t.align[col] ?? 'none' },
                text: cell.text,
              })),
            })),
          },
        ];
      }
      default:
        throw new Error('当前稿纸未支持此结构');
    }
  });
}

export function convertMarkdown(text: string, filename: string) {
  let title = filename,
    hasTitle = false,
    line = 1;
  const blocks: TState[] = [],
    notices: ImportNotice[] = [];
  // Metadata is copied verbatim; it must not become a heading or article title.
  const frontmatter = /^---[ \t]*\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(
    text,
  );
  if (frontmatter) {
    const raw = frontmatter[0];
    blocks.push(code(raw.replace(/\n$/, '')));
    notices.push({ line: 1, message: '文件头元数据，已保留原文。' });
    line += (raw.match(/\n/g) ?? []).length;
    text = text.slice(raw.length);
  }
  for (const token of markdown.lexer(text)) {
    const raw = token.raw;
    const firstLine = line;
    line += (raw.match(/\n/g) ?? []).length;
    if (token.type === 'space') continue;
    // Image references and HTML can also occur inside a list, table or quote.
    // Keep the entire affected block in a literal code block; it cannot load media.
    let problemLine = firstLine;
    try {
      markdown.walkTokens([token], (part) => {
        let reason = '';
        if (part.type === 'image') reason = '图片引用';
        else if (part.type === 'html') reason = 'HTML 片段';
        else if (
          (part.type === 'link' || part.type === 'def') &&
          !validArticleHref(part.href)
        )
          reason = '未支持的链接';
        else if (part.type === 'directive') reason = '未支持的指令';
        // Muya also recognizes raw media syntax. Keep unparsed fragments inert,
        // without misclassifying examples inside a code span or fenced block.
        else if (
          part.type === 'text' &&
          !part.tokens?.length &&
          /!\s*\[|<\/?[a-z][\w:-]*(?:\s|\/?>)|^\s*:{3,}|^\s*\$\$\s*$/im.test(
            part.raw,
          )
        )
          reason = '未支持的结构';
        if (reason) {
          const offset = raw.indexOf(part.raw.split('\n')[0]!);
          if (offset > 0)
            problemLine += (raw.slice(0, offset).match(/\n/g) ?? []).length;
          throw new Error(reason);
        }
      });
      if (
        !hasTitle &&
        token.type === 'heading' &&
        token.depth === 1 &&
        token.text.trim()
      ) {
        title = token.text.trim();
        hasTitle = true;
        continue;
      }
      blocks.push(...toBlocks([token]));
    } catch (error) {
      notices.push({
        line: problemLine,
        message:
          (error instanceof Error ? error.message : '无法转换') +
          '，已保留原文。',
      });
      blocks.push(code(raw.replace(/\n+$/, '')));
    }
  }
  return {
    title,
    doc: writeBlocks(
      blocks.length ? blocks : [{ name: 'paragraph', text: '' }],
    ),
    notices,
  };
}
