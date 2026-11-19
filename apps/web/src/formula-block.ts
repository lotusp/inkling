import { Node, type NodeViewRenderer } from '@tiptap/react';

const formulaView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = document.createElement('div');
  dom.className = 'formula-block';
  dom.setAttribute('role', 'group');
  dom.setAttribute('aria-label', '公式');
  const preview = document.createElement('div');
  preview.className = 'formula-preview';
  preview.contentEditable = 'false';
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.contentEditable = 'false';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '公式源码';
  summary.contentEditable = 'false';
  const contentDOM = document.createElement('pre');
  contentDOM.setAttribute('role', 'textbox');
  contentDOM.setAttribute('aria-label', '公式源码');
  contentDOM.setAttribute('aria-multiline', 'true');
  details.open = !node.content.size;
  details.append(summary, contentDOM);
  dom.append(preview, status, details);

  let renderId = 0;
  async function render(source: string) {
    const id = ++renderId;
    preview.replaceChildren();
    status.textContent = '';
    if (!source.trim()) return;
    if (source.length > 8192) {
      status.textContent = '公式过长，请拆分后预览。';
      return;
    }
    let katex: typeof import('katex');
    try {
      katex = await import('katex');
    } catch {
      if (id === renderId)
        status.textContent = '预览未加载，请在本机服务恢复后重新打开稿件。';
      return;
    }
    if (id !== renderId) return;
    try {
      katex.render(source, preview, {
        displayMode: true,
        output: 'mathml',
        maxExpand: 500,
        maxSize: 20,
        trust: () => {
          throw new Error('公式预览不支持外部资源或 HTML 命令。');
        },
      });
    } catch (error) {
      if (error instanceof katex.ParseError) {
        const location = Number.isInteger(error.position)
          ? `（第 ${[...source.slice(0, error.position)].length + 1} 个字符）`
          : '';
        status.textContent = `公式有误${location}，请检查 LaTeX 源码。`;
      } else {
        status.textContent =
          error instanceof Error
            ? error.message
            : '公式有误，请检查 LaTeX 源码。';
      }
    }
  }
  let current = node;
  // Arrow-key navigation must reveal the editable text before typing into it.
  function revealSelection() {
    if (
      editor.state.selection.$head.parent === current &&
      editor.isEditable &&
      editor.state.selection.$head.before() === getPos()
    )
      details.open = true;
  }
  editor.on('selectionUpdate', revealSelection);
  void render(node.textContent);
  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== current.type) return false;
      if (!next.content.eq(current.content)) void render(next.textContent);
      current = next;
      return true;
    },
    stopEvent: (event) => event.target === summary,
    ignoreMutation: (mutation) =>
      mutation.type !== 'selection' && !contentDOM.contains(mutation.target),
    destroy() {
      ++renderId;
      editor.off('selectionUpdate', revealSelection);
    },
  };
};

export const FormulaBlock = Node.create({
  name: 'formulaBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  parseHTML: () => [
    {
      tag: 'pre[data-inkling-formula]',
      priority: 60,
      preserveWhitespace: 'full',
    },
  ],
  renderHTML: () => ['pre', { 'data-inkling-formula': '' }, ['code', 0]],
  addNodeView: () => formulaView,
});
