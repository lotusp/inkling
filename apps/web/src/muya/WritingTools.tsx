import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { WritingSurface } from './surface';
import {
  changeTable,
  tableCommands,
  commandTarget,
  formatBlock,
  insertTechnical,
  type CommandTarget,
} from './commands';
import { FormatFieldDialog, type FormatField } from '../FormatFieldDialog';
import { DeskDialog } from '../DeskDialog';
import {
  imageMarkup,
  installWorkspaceImages,
  upload,
  type ImageTarget,
} from './images';

const formats = 'image/png,image/jpeg,image/gif,image/webp';
export function WritingTools({
  editor,
  editable,
}: {
  editor: WritingSurface;
  editable: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState(''),
    [target, setTarget] = useState<ImageTarget | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [field, setField] = useState<FormatField | null>(null);
  const [format, setFormat] = useState<CommandTarget | null>(null);
  const [inTable, setInTable] = useState(false);
  const [table, setTable] = useState<CommandTarget | null>(null);
  useEffect(() => {
    const update = () => {
      if (editor.dom.contains(window.getSelection()?.focusNode ?? null))
        setInTable(!!commandTarget(editor)?.block.closestBlock('table.cell'));
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [editor]);
  const current = useRef<ImageTarget | null>(null);
  useEffect(() => {
    if (!picker.current) return;
    const remove = installWorkspaceImages(
      editor,
      picker.current,
      setNotice,
      (t) => {
        current.current = t;
        setTarget(t);
        setError('');
        setBusy(false);
      },
    );
    return () => {
      current.current = null;
      remove();
    };
  }, [editor]);
  const close = () => {
    current.current = null;
    setTarget(null);
  };
  return (
    <>
      <div className="format-actions" hidden={!editable}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (editor.composing) return;
            setFormat(commandTarget(editor));
          }}
        >
          段落格式…
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!editor.composing) picker.current?.click();
          }}
        >
          插入图片
        </button>
        {inTable && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTable(commandTarget(editor))}
          >
            表格操作…
          </button>
        )}
        <input hidden ref={picker} type="file" accept={formats} multiple />
      </div>
      {table && editable && (
        <DeskDialog title="表格操作" close={() => setTable(null)}>
          <div className="paragraph-options">
            {tableCommands.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setTable(null);
                  changeTable(editor, table, c);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </DeskDialog>
      )}
      {field && editable && (
        <FormatFieldDialog
          editor={editor}
          field={field}
          close={() => setField(null)}
        />
      )}
      {format && editable && (
        <DeskDialog title="段落格式" close={() => setFormat(null)}>
          <div className="paragraph-options">
            {(() => {
              const state = format.block.outMostBlock?.getState();
              const code = state?.name === 'code-block';
              if (!code && !format.link && format.end === format.start)
                return null;
              return (
                <button
                  onClick={() => {
                    setField({
                      kind: code ? 'language' : 'link',
                      value: code ? state.meta.lang : (format.link?.href ?? ''),
                      target: format,
                      generation: editor.generation,
                    });
                    setFormat(null);
                  }}
                >
                  {code ? '代码语言…' : '链接…'}
                </button>
              );
            })()}
            {(
              [
                ['bold', '整段加粗'],
                ['heading', '小标题'],
                ['list', '列表'],
                ['quote', '引用'],
                ['code', '代码块'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={
                  key === 'quote'
                    ? format.block.outMostBlock?.blockName === 'block-quote'
                    : undefined
                }
                onClick={() => {
                  flushSync(() => setFormat(null));
                  formatBlock(editor, format, key);
                }}
              >
                {label}
              </button>
            ))}
            {(
              [
                ['table', '插入表格'],
                ['formula', '插入公式'],
                ['mermaid', '插入流程图'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  flushSync(() => setFormat(null));
                  insertTechnical(editor, format, key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </DeskDialog>
      )}
      {notice && editable && (
        <p className="backup-notice" role="status">
          {notice}
        </p>
      )}
      {target && editable && (
        <DeskDialog title="编辑图片" close={close}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !editor.isEditable) return;
              const data = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              try {
                const file = data.get('replacement');
                const src =
                  file instanceof File && file.size
                    ? await upload(file)
                    : target.attrs.src;
                if (
                  current.current !== target ||
                  !editor.isEditable ||
                  editor.generation !== target.generation ||
                  !target.block.domNode?.isConnected
                )
                  return;
                if (
                  target.block.text.slice(target.start, target.end) !==
                  target.raw
                )
                  throw new Error('此图片已更改，请重新选择。');
                target.block.text =
                  target.block.text.slice(0, target.start) +
                  imageMarkup(
                    src!,
                    String(data.get('alt') ?? ''),
                    String(data.get('title') ?? ''),
                    target.attrs,
                  ) +
                  target.block.text.slice(target.end);
                target.block.update();
                close();
              } catch (e) {
                setError(e instanceof Error ? e.message : '图片修改失败。');
              } finally {
                if (current.current === target) setBusy(false);
              }
            }}
          >
            <label>
              替代文字
              <input name="alt" defaultValue={target.attrs.alt ?? ''} />
            </label>
            <label>
              图片标题
              <input name="title" defaultValue={target.attrs.title ?? ''} />
            </label>
            <label>
              更换本地图片
              <input name="replacement" type="file" accept={formats} />
            </label>
            {error && <p role="alert">{error}</p>}
            <footer>
              <button type="button" onClick={close}>
                取消
              </button>
              <button type="submit" disabled={busy}>
                完成
              </button>
            </footer>
          </form>
        </DeskDialog>
      )}
    </>
  );
}
