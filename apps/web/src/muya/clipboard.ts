import { commandTarget, insertTechnical } from './commands';
import type { WritingContext } from './context';

function technicalMarkdown(text: string) {
  const math = /^\s*\$\$\r?\n([\s\S]*?)\r?\n\$\$\s*$/.exec(text);
  if (math) return { kind: 'formula' as const, source: math[1]! };
  const diagram = /^\s*`{3}mermaid\r?\n([\s\S]*?)\r?\n`{3}\s*$/.exec(text);
  return diagram ? { kind: 'mermaid' as const, source: diagram[1]! } : null;
}
export function installClipboard(surface: WritingContext, signal: AbortSignal) {
  const options = { capture: true, signal };
  surface.dom.addEventListener(
    'copy',
    (event) => {
      const data = event.clipboardData;
      if (
        !data ||
        !surface.dom.querySelector(
          'figure.mu-math-block,figure.mu-diagram-block',
        )
      )
        return;
      const { text } = surface.muya.editor.clipboard.getClipboardData();
      const snippet = technicalMarkdown(text);
      if (!snippet) return;
      const pre = document.createElement('pre');
      pre.setAttribute('data-inkling-' + snippet.kind, '');
      pre.textContent = snippet.source;
      data.setData('text/html', pre.outerHTML);
      data.setData('text/plain', text);
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    options,
  );
  surface.dom.addEventListener(
    'paste',
    (event) => {
      const data = event.clipboardData;
      if (
        !data ||
        data.files.length ||
        !surface.isEditable ||
        surface.composing
      )
        return;
      const snippet = technicalMarkdown(data.getData('text/plain'));
      if (!snippet) return;
      const target = commandTarget(surface);
      if (
        !target ||
        target.block.blockName !== 'paragraph.content' ||
        target.start !== target.end
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      insertTechnical(surface, target, snippet.kind, snippet.source);
    },
    options,
  );
}
