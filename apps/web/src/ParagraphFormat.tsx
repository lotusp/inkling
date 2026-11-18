import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { DeskDialog } from './DeskDialog';

export function ParagraphFormat({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    function hide() {
      setPosition(null);
    }
    function place() {
      const selection = window.getSelection();
      const dom = editor.view.dom;
      if (
        !selection?.rangeCount ||
        selection.isCollapsed ||
        !dom.contains(selection.anchorNode) ||
        !dom.contains(selection.focusNode) ||
        editor.view.composing ||
        document.querySelector('dialog[open]')
      ) {
        hide();
        return;
      }
      const { $from, $to } = editor.state.selection;
      if (!$from.sameParent($to)) {
        hide();
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setPosition({
        left: Math.max(6, Math.min(innerWidth - 245 - 6, rect.left)),
        top: Math.max(6, rect.top - 44),
      });
    }
    document.addEventListener('selectionchange', place);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('selectionchange', place);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [editor]);
  function apply(kind: 'bold' | 'heading' | 'list' | 'code') {
    if (!editor.isEditable || editor.view.composing) return;
    const chain = editor.chain();
    const { $from, $to, from, to } = editor.state.selection;
    if (kind === 'bold' && $from.sameParent($to) && $from.parent.content.size) {
      chain
        .setTextSelection({ from: $from.start(), to: $from.end() })
        .toggleBold()
        .setTextSelection({ from, to });
    } else if (kind === 'bold') chain.toggleBold();
    else if (kind === 'heading') chain.toggleHeading({ level: 2 });
    else if (kind === 'list') chain.toggleBulletList();
    else chain.toggleCodeBlock();
    setOpen(false);
    setPosition(null);
    chain.focus().run();
  }
  const floating = !!position && !open;
  return (
    <div className="format-slot">
      <div
        className={floating ? 'selection-actions' : 'format-actions'}
        role="toolbar"
        aria-label="段落操作"
        style={
          floating ? { top: position.top, left: position.left } : undefined
        }
        onMouseDown={(e) => e.preventDefault()}
      >
        {floating && (
          <>
            <button disabled title="闻一尚未接入">
              问问闻一
            </button>
            <button disabled title="闻一尚未接入">
              改写选区
            </button>
          </>
        )}
        <button onClick={() => setOpen(true)}>段落格式…</button>
      </div>
      {open && (
        <DeskDialog title="段落格式" close={() => setOpen(false)}>
          <div className="paragraph-options">
            <button onClick={() => apply('bold')}>整段加粗</button>
            <button onClick={() => apply('heading')}>小标题</button>
            <button onClick={() => apply('list')}>列表</button>
            <button onClick={() => apply('code')}>代码块</button>
          </div>
        </DeskDialog>
      )}
    </div>
  );
}
