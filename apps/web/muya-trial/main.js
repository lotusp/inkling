/* global document, localStorage */
import {
  Muya,
  zh,
  ImageToolBar,
  ImageResizeBar,
  InlineFormatToolbar,
  LinkTools,
  ParagraphQuickInsertMenu,
  TableColumnToolbar,
  TableRowColumMenu,
  TableDragBar,
  PreviewToolBar,
} from '@muyajs/core';
import '@muyajs/core/lib/core.css';
import '../src/muya/theme.css';
import './paper.css';
import { installImages, waitForImages } from './images.js';

for (const plugin of [
  ImageToolBar,
  ImageResizeBar,
  InlineFormatToolbar,
  LinkTools,
  ParagraphQuickInsertMenu,
  TableColumnToolbar,
  TableRowColumMenu,
  TableDragBar,
  PreviewToolBar,
])
  Muya.use(plugin);
const key = 'inkling-muya-trial-md';
const sample = [
  '# 一篇技术笔记',
  '',
  '在这里接着写。选中几个字可以调整格式，在空行输入 / 可以插入内容。',
  '',
  '## 发布检查',
  '',
  '| 步骤 | 负责人 |',
  '| --- | --- |',
  '| 校对 | 作者 |',
  '| 审阅 | 编辑 |',
  '',
  '## 从草稿到发布',
  '',
  '```mermaid',
  'graph LR',
  '  A[草稿] --> B[审阅]',
  '  B --> C[发布]',
  '```',
  '',
  '## 下一步',
  '',
  '把自己的想法写在这里。',
].join('\n');
function readDraft() {
  const raw = localStorage.getItem(key);
  try {
    const saved = JSON.parse(raw);
    if (saved?.format === 'muya-trial' && Array.isArray(saved.blocks))
      return { json: saved.blocks };
  } catch {
    /* Existing trial drafts contain plain Markdown. */
  }
  return { markdown: raw ?? sample };
}
const editor = new Muya(document.getElementById('editor'), {
  ...readDraft(),
  mermaidTheme: 'neutral',
});
editor.locale(zh);
editor.init();
installImages(editor);
document.getElementById('save').addEventListener('click', async () => {
  try {
    const draft = JSON.stringify({
      format: 'muya-trial',
      blocks: editor.getState(),
    });
    await waitForImages(draft);
    localStorage.setItem(key, draft);
    document.getElementById('status').textContent = '试写稿已保存在此浏览器。';
  } catch (error) {
    document.getElementById('status').textContent =
      '保存失败。' + error.message;
  }
});
