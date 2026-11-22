import { ArticleDocument, type DocumentNode } from '@inkling/contracts';

export interface ArticleImportPreview {
  document: ArticleDocument;
  text: string;
}
// Muya paragraphs use inline Markdown. Escape its delimiters for literal files
// so editing or reopening cannot turn the author's example into links or media.
function literalParagraph(line: string): DocumentNode {
  if (!line) return { type: 'paragraph' };
  const escaped = line.replace(/([\\`*_~!<>[\]$^&])/g, '\\$1');
  return {
    type: escaped === line ? 'paragraph' : 'md:paragraph',
    content: [{ type: 'text', text: escaped }],
  };
}
export async function readArticleFile(
  file: File,
): Promise<ArticleImportPreview> {
  if (!/\.txt$/i.test(file.name)) throw new Error('请选择 .txt 文本文件。');
  if (file.size > 2 * 1024 * 1024)
    throw new Error('文件超过 2 MiB，请拆分后再导入。');
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true })
      .decode(bytes)
      .replace(/\r\n?/g, '\n');
  } catch {
    throw new Error('无法读取为 UTF-8 文本，请检查文件编码。');
  }
  if (text.includes('\0'))
    throw new Error('文件含有二进制内容，请选择文本文件。');
  const lines = text.split('\n', 50000);
  if (lines.length >= 50000) throw new Error('正文段落过多，请拆分后再导入。');
  const content = lines.map(literalParagraph);
  const document = ArticleDocument.safeParse({
    schemaVersion: content.some((p) => p.type === 'md:paragraph') ? 2 : 1,
    title: file.name.slice(0, -4),
    doc: { type: 'doc', content },
  });
  if (!document.success)
    throw new Error('标题或正文超出稿件容量，请缩短文件名或拆分正文。');
  return { document: document.data, text };
}
