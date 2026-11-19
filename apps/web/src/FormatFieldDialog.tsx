import { useId, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Node } from '@tiptap/pm/model';
import { validArticleHref } from '@inkling/contracts';
import { DeskDialog } from './DeskDialog';

export interface FormatField {
  kind: 'link' | 'language';
  value: string;
  doc: Node;
  from: number;
  to: number;
}

export function FormatFieldDialog({
  editor,
  field,
  close,
}: {
  editor: Editor;
  field: FormatField;
  close: () => void;
}) {
  const [value, setValue] = useState(field.value);
  const [error, setError] = useState('');
  const errorId = useId();
  const composing = useRef(false);
  const link = field.kind === 'link';
  function apply(remove = false) {
    if (composing.current || editor.view.composing) return;
    if (!editor.isEditable || !field.doc.eq(editor.state.doc)) {
      setError('正文已变化，请关闭窗口并重新选择。');
      return;
    }
    const input = value.trim();
    if (
      link &&
      !remove &&
      (!validArticleHref(input) || !URL.canParse(input, window.location.href))
    ) {
      setError('请输入有效的网址、mailto: 地址或以 # 开头的锚点。');
      return;
    }
    const { anchor, head } = editor.state.selection;
    const chain = editor
      .chain()
      .setTextSelection({ from: field.from, to: field.to });
    if (!link) chain.updateAttributes('codeBlock', { language: input || null });
    else if (remove) chain.unsetLink();
    else chain.setLink({ href: input });
    if (!chain.setTextSelection({ from: anchor, to: head }).run()) {
      setError('当前选区无法应用此格式。');
      return;
    }
    close();
  }
  return (
    <DeskDialog
      title={link ? '编辑链接' : '代码语言'}
      close={() => {
        if (!composing.current) close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label>
          {link ? '链接地址' : '代码语言'}
          <input
            value={value}
            placeholder={link ? 'https://…' : '如 typescript，留空使用纯文本'}
            maxLength={link ? undefined : 100}
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError('');
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (composing.current ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229)
              )
                event.preventDefault();
            }}
          />
        </label>
        {error && (
          <p role="alert" id={errorId}>
            {error}
          </p>
        )}
        <div className="paragraph-options">
          <button type="submit">应用</button>
          {link && field.value && (
            <button type="button" onClick={() => apply(true)}>
              移除链接
            </button>
          )}
        </div>
      </form>
    </DeskDialog>
  );
}
