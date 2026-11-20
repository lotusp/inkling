// Add keyboard-accessible source controls and table headers to Muya's native markup.
import type { WritingContext } from './context';
export function installBlockControls(
  root: HTMLElement,
  surface: WritingContext,
) {
  // Browser insertText may split a contenteditable code span into cloned nodes for
  // multiline input. Apply the replacement to the native block in one operation.
  const sourceInput = (event: InputEvent) => {
    if (
      !surface.isEditable ||
      surface.composing ||
      event.isComposing ||
      event.inputType !== 'insertText' ||
      event.data === null
    )
      return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = (
      node instanceof Element ? node : node.parentElement
    )?.closest<HTMLElement>('.mu-codeblock-content');
    if (!el || !root.contains(el)) return;
    const block = (
      el as HTMLElement & {
        __MUYA_BLOCK__?: {
          text: string;
          update: () => void;
          setCursor: (a: number, b: number, r: boolean) => void;
          updatePreviewIfHave: (s: string) => void;
        };
      }
    ).__MUYA_BLOCK__;
    if (!block) return;
    const before = range.cloneRange();
    before.selectNodeContents(el);
    before.setEnd(range.startContainer, range.startOffset);
    const start = Math.min(block.text.length, before.toString().length);
    const end = Math.min(block.text.length, start + range.toString().length);
    event.preventDefault();
    event.stopImmediatePropagation();
    block.text =
      block.text.slice(0, start) + event.data + block.text.slice(end);
    block.setCursor(start + event.data.length, start + event.data.length, true);
    block.updatePreviewIfHave(block.text);
  };
  root.addEventListener('beforeinput', sourceInput, true);

  function decorate(element: Element) {
    const tables = element.matches('table.mu-table-inner')
      ? [element]
      : element.querySelectorAll('table.mu-table-inner');
    for (const table of tables) {
      for (const cell of table.querySelectorAll('tr:first-child > td'))
        cell.setAttribute('role', 'columnheader');
    }
    const figures = element.matches(
      'figure.mu-math-block,figure.mu-diagram-block',
    )
      ? [element]
      : element.querySelectorAll(
          'figure.mu-math-block,figure.mu-diagram-block',
        );
    for (const figure of figures) {
      if (figure.querySelector(':scope > details')) continue;
      const source = figure.querySelector<HTMLElement>('.mu-codeblock-content');
      if (!source) continue;
      const label = figure.classList.contains('mu-math-block')
        ? '公式'
        : '流程图';
      figure.setAttribute('role', 'group');
      figure.setAttribute('aria-label', label);
      source.setAttribute('role', 'textbox');
      source.setAttribute('aria-label', label + '源码');
      source.setAttribute('aria-multiline', 'true');
      const details = document.createElement('details'),
        summary = document.createElement('summary');
      details.contentEditable = 'false';
      summary.textContent = '源码';
      details.append(summary);
      figure.append(details);
      details.open =
        figure.classList.contains('mu-active') ||
        source.contains(window.getSelection()?.focusNode ?? null);
      details.addEventListener('toggle', () => {
        figure.classList.toggle('source-open', details.open);
      });
      figure
        .querySelector('.mu-diagram-preview,.mu-math-preview')
        ?.addEventListener(
          'click',
          () => {
            details.open = true;
          },
          true,
        );
    }
  }
  decorate(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (
        record.target instanceof Element &&
        record.target.closest('table.mu-table-inner')
      ) {
        const table = record.target.closest('table.mu-table-inner');
        if (table) decorate(table);
      }
      for (const node of record.addedNodes)
        if (node instanceof Element) decorate(node);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    root.removeEventListener('beforeinput', sourceInput, true);
  };
}
