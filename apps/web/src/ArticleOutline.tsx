import { useState, useRef } from 'react';
import { ListTree } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { DeskMenu } from './DeskMenu';
import { DeskDialog } from './DeskDialog';

export function ArticleOutline({
  editor,
  editable,
}: {
  editor: Editor;
  editable: boolean;
}) {
  const [headings, setHeadings] = useState<HTMLElement[]>([]);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const composing = useRef(false);
  return (
    <>
      <DeskMenu
        label="大纲"
        trigger={
          <>
            <ListTree size={15} />
            大纲
          </>
        }
        onOpen={() =>
          setHeadings(Array.from(editor.view.dom.querySelectorAll('h2,h3')))
        }
      >
        {headings.map((heading, i) => (
          <button
            key={i}
            onClick={() => {
              heading.scrollIntoView({ block: 'center' });
              heading.animate(
                [
                  { backgroundColor: '#dce9d9' },
                  { backgroundColor: 'transparent' },
                ],
                { duration: 900 },
              );
            }}
          >
            {heading.textContent || '未命名章节'}
          </button>
        ))}
        {!headings.length && <small>还没有章节</small>}
        {editable && (
          <>
            <hr />
            <button
              onClick={() => {
                setText('');
                setAdding(true);
              }}
            >
              添加章节…
            </button>
            <button disabled title="闻一尚未接入">
              讨论文章结构
            </button>
          </>
        )}
      </DeskMenu>
      {adding && (
        <DeskDialog
          title="添加章节"
          close={() => {
            if (!composing.current) setAdding(false);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const title = text.trim();
              if (
                !title ||
                composing.current ||
                !editable ||
                !editor.isEditable
              )
                return;
              editor
                .chain()
                .insertContentAt(editor.state.doc.content.size, [
                  {
                    type: 'heading',
                    attrs: { level: 2 },
                    content: [{ type: 'text', text: title }],
                  },
                  { type: 'paragraph' },
                ])
                .run();
              setAdding(false);
              editor.commands.focus('end');
            }}
          >
            <label>
              章节标题
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.nativeEvent.isComposing)
                    e.preventDefault();
                }}
              />
            </label>
            <button type="submit" disabled={!editable || !text.trim()}>
              添加
            </button>
          </form>
        </DeskDialog>
      )}
    </>
  );
}
