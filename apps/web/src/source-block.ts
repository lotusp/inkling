import { Node, type NodeViewRenderer } from '@tiptap/react';

type SourceBlockOptions = {
  name: 'formulaBlock' | 'mermaidBlock';
  label: string;
  attribute: string;
  example?: string;
  draw(
    source: string,
    output: HTMLElement,
    isCurrent: () => boolean,
  ): Promise<void>;
};

export function createSourceBlock(options: SourceBlockOptions) {
  const { label, attribute } = options;
  const view: NodeViewRenderer = ({ node, editor, getPos }) => {
    const dom = document.createElement('div');
    dom.className = 'source-block';
    dom.setAttribute('role', 'group');
    dom.setAttribute('aria-label', label);
    const preview = document.createElement('div');
    preview.className = 'source-preview';
    preview.contentEditable = 'false';
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.contentEditable = 'false';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = label + '源码';
    summary.contentEditable = 'false';
    const contentDOM = document.createElement('pre');
    contentDOM.setAttribute('role', 'textbox');
    contentDOM.setAttribute('aria-label', label + '源码');
    contentDOM.setAttribute('aria-multiline', 'true');
    if (options.example)
      contentDOM.setAttribute('aria-placeholder', options.example);
    details.open = !node.content.size;
    details.append(summary, contentDOM);
    dom.append(preview, status, details);

    let renderId = 0;
    async function render(source: string) {
      const id = ++renderId;
      contentDOM.toggleAttribute('data-empty', source.length === 0);
      status.textContent = '';
      if (!source.trim()) {
        preview.replaceChildren();
        return;
      }
      if (source.length > 8192) {
        preview.replaceChildren();
        status.textContent = label + '过长，请拆分后预览。';
        return;
      }
      try {
        const output = document.createElement('div');
        await options.draw(source, output, () => id === renderId);
        if (id === renderId) preview.replaceChildren(...output.childNodes);
      } catch (error) {
        if (id === renderId) {
          preview.replaceChildren();
          status.textContent =
            error instanceof Error ? error.message : label + '预览失败。';
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

  return Node.create({
    name: options.name,
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    parseHTML: () => [
      {
        tag: `pre[${attribute}]`,
        priority: 60,
        preserveWhitespace: 'full',
      },
    ],
    renderHTML: () => ['pre', { [attribute]: '' }, ['code', 0]],
    addNodeView: () => view,
  });
}
