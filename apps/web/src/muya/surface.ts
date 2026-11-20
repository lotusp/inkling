import { installClipboard } from './clipboard';
import { installBlockControls } from './controls';
import { installPreviews } from './previews';
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
  CodeBlockLanguageSelector,
  type TState,
} from '@muyajs/core';
import type { DocumentNode } from '@inkling/contracts';
import { appendBlocks, createBlock } from './commands';
import { readBlocks, writeBlocks } from './document';
import '@muyajs/core/lib/core.css';
import './theme.css';

const registerPlugin = Muya.use.bind(Muya);
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
  CodeBlockLanguageSelector,
])
  registerPlugin(plugin);

export type WritingSelection = {
  anchorPath: (number | string)[];
  focusPath: (number | string)[];
  anchor: number;
  focus: number;
};
export class WritingSurface {
  readonly muya: Muya;
  readonly dom: HTMLElement;
  composing = false;
  generation = 0;
  isEditable = false;
  private readonly events = new AbortController();
  private baseline?: { blocks: string; doc: DocumentNode };
  private locked = new Set<HTMLElement>();
  private readonly releaseControls: () => void;
  private readonly portals: Element[];
  constructor(host: HTMLElement) {
    const previous = new Set(document.body.children);
    const mount = host.appendChild(document.createElement('div'));
    this.muya = new Muya(mount, {
      mermaidTheme: 'neutral',
      disableHtml: true,
      math: true,
      spellcheckEnabled: false,
      hideQuickInsertHint: true,
      trimUnnecessaryCodeBlockEmptyLines: false,
    });
    this.muya.locale(zh);
    this.muya.init();
    installPreviews(this.muya);
    this.portals = Array.from(document.body.children).filter(
      (el) =>
        !previous.has(el) &&
        el.matches(
          '.mu-transformer,.mu-float-wrapper,.mu-front-button-wrapper',
        ),
    );
    this.dom = this.muya.domNode;
    this.releaseControls = installBlockControls(this.dom, this);
    this.dom.setAttribute('role', 'textbox');
    this.dom.setAttribute('aria-label', '文章正文');
    this.dom.setAttribute('aria-multiline', 'true');
    const options = { signal: this.events.signal, capture: true };
    this.dom.addEventListener(
      'compositionstart',
      () => {
        this.composing = true;
      },
      options,
    );
    this.dom.addEventListener(
      'compositionend',
      () => {
        this.composing = false;
      },
      options,
    );
    for (const type of [
      'beforeinput',
      'keydown',
      'paste',
      'drop',
      'cut',
      'click',
    ]) {
      host.addEventListener(
        type,
        (event) => {
          if (
            this.isEditable ||
            (event instanceof KeyboardEvent &&
              (event.key === 'Tab' ||
                ((event.metaKey || event.ctrlKey) && event.key === 'c')))
          )
            return;
          event.stopImmediatePropagation();
          if (type !== 'click') event.preventDefault();
        },
        options,
      );
    }
    // IME commits can arrive after focus has moved to a workbench dialog.
    // Muya normally locates the receiver via the live selection.
    this.dom.addEventListener(
      'input',
      (event) => {
        if (
          !this.isEditable ||
          this.composing ||
          event.isComposing ||
          this.dom.contains(window.getSelection()?.focusNode ?? null)
        )
          return;
        const el = event.target;
        if (
          !(el instanceof HTMLElement) ||
          !el.matches('.mu-paragraph-content')
        )
          return;
        const block = (
          el as HTMLElement & {
            __MUYA_BLOCK__?: { text: string; update: () => void };
          }
        ).__MUYA_BLOCK__;
        if (block && block.text !== el.textContent) {
          block.text = el.textContent ?? '';
          block.update();
        }
      },
      options,
    );
    this.dom.addEventListener(
      'beforeinput',
      (event) => {
        if (
          !this.isEditable ||
          this.composing ||
          event.isComposing ||
          event.inputType !== 'insertText' ||
          event.data === null
        )
          return;
        const native = window.getSelection();
        if (!native?.rangeCount || native.isCollapsed) return;
        const range = native.getRangeAt(0);
        const scroll = this.muya.editor.scrollPage;
        const first = scroll?.firstContentInDescendant()?.domNode,
          last = scroll?.lastContentInDescendant()?.domNode;
        if (
          !scroll ||
          !first ||
          !last ||
          !range.intersectsNode(first) ||
          !range.intersectsNode(last)
        )
          return;
        // A selection of the editor root (e.g. Select All) may span multiple
        // independently editable nodes. Replace it in the model as one change.
        if (
          first.contains(range.startContainer) &&
          last.contains(range.endContainer)
        )
          return;
        const full = document.createRange();
        full.selectNodeContents(this.dom);
        if (range.toString() !== full.toString()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const next = createBlock(this, { name: 'paragraph', text: event.data });
        this.muya.editor.history.cutoff();
        const previous = scroll.map((block) => block);
        scroll.append(next, 'user');
        previous.forEach((block) => block.remove());
        next
          .firstContentInDescendant()
          ?.setCursor(event.data.length, event.data.length, true);
        this.dom.dispatchEvent(new Event('inkling-change'));
      },
      options,
    );
    this.dom.addEventListener(
      'keydown',
      (event) => {
        if (
          !this.isEditable ||
          this.composing ||
          event.isComposing ||
          !(event.metaKey || event.ctrlKey) ||
          event.altKey
        )
          return;
        const key = event.key.toLowerCase();
        if (key === 'a' && event.target === this.dom) {
          const scroll = this.muya.editor.scrollPage,
            first = scroll?.firstContentInDescendant(),
            last = scroll?.lastContentInDescendant();
          if (first && last) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.muya.editor.selection.setSelection({
              anchorBlock: first,
              focusBlock: last,
              anchor: { offset: 0 },
              focus: { offset: last.text.length },
            });
          }
          return;
        }
        if (key !== 'z' && key !== 'y') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.generation++;
        if (key === 'y' || event.shiftKey) this.muya.redo();
        else this.muya.undo();
      },
      options,
    );
    installClipboard(this, this.events.signal);
    this.setEditable(false);
  }
  getJSON(): DocumentNode {
    const blocks = this.liveBlocks();
    return this.baseline && JSON.stringify(blocks) === this.baseline.blocks
      ? this.baseline.doc
      : writeBlocks(blocks);
  }
  private liveBlocks(): TState[] {
    const scroll = this.muya.editor.scrollPage;
    return scroll
      ? scroll.map((block) => {
          if (!block.isParent()) throw new Error('正文块无法读取');
          return block.getState();
        })
      : this.muya.getState();
  }
  setContent(doc: DocumentNode) {
    this.generation++;
    this.muya.ui.hideAllFloatTools();
    this.muya.setContent(readBlocks(doc));
    this.baseline = { blocks: JSON.stringify(this.liveBlocks()), doc };
    this.setEditable(this.isEditable);
    this.dom.dispatchEvent(new Event('inkling-load'));
  }
  setEditable(value: boolean) {
    if (value !== this.isEditable) this.generation++;
    this.isEditable = value;
    this.dom.contentEditable = String(value);
    this.dom.setAttribute('aria-readonly', String(!value));
    if (!value) {
      this.muya.ui.hideAllFloatTools();
      for (const el of this.dom.querySelectorAll<HTMLElement>(
        '[contenteditable=true]',
      )) {
        this.locked.add(el);
        el.contentEditable = 'false';
      }
    } else {
      for (const el of this.locked)
        if (el.isConnected) el.contentEditable = 'true';
      this.locked.clear();
    }
  }
  subscribe(callback: () => void) {
    this.muya.on('json-change', callback);
    this.dom.addEventListener('inkling-change', callback);
    this.dom.addEventListener('input', callback);
    this.dom.addEventListener('compositionend', callback);
    return () => {
      this.muya.off('json-change', callback);
      this.dom.removeEventListener('inkling-change', callback);
      this.dom.removeEventListener('input', callback);
      this.dom.removeEventListener('compositionend', callback);
    };
  }
  focus(end = false) {
    const scroll = this.muya.editor.scrollPage;
    const block = end
      ? scroll?.lastContentInDescendant()
      : scroll?.firstContentInDescendant();
    if (block) {
      this.dom.focus({ preventScroll: true });
      const offset = end ? block.text.length : 0;
      block.setCursor(offset, offset, true);
    }
  }
  append(blocks: TState[]) {
    const scroll = this.muya.editor.scrollPage;
    if (!scroll || !this.isEditable || this.composing) return;
    appendBlocks(this, scroll, blocks);
    this.focus(true);
  }
  selection(): WritingSelection | null {
    if (!this.dom.contains(window.getSelection()?.focusNode ?? null))
      return null;
    const s = this.muya.editor.selection.getSelection();
    return s
      ? {
          anchorPath: s.anchorPath,
          focusPath: s.focusPath,
          anchor: s.anchor.offset,
          focus: s.focus.offset,
        }
      : null;
  }
  restoreSelection(s: WritingSelection) {
    const scroll = this.muya.editor.scrollPage;
    const a = scroll?.queryBlock([...s.anchorPath]),
      f = scroll?.queryBlock([...s.focusPath]);
    if (
      !a?.isContent?.() ||
      !f?.isContent?.() ||
      s.anchor > a.text.length ||
      s.focus > f.text.length
    )
      return false;
    this.muya.editor.selection.setSelection({
      anchorBlock: a,
      focusBlock: f,
      anchor: { offset: s.anchor },
      focus: { offset: s.focus },
    });
    return true;
  }
  destroy() {
    this.events.abort();
    this.releaseControls();
    this.muya.destroy();
    this.portals.forEach((el) => el.remove());
    this.locked.clear();
  }
}
