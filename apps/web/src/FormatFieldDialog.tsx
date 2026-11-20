import { useId, useRef, useState } from 'react';
import type { WritingSurface } from './muya/surface';
import { createBlock, type CommandTarget } from './muya/commands';
import { flushSync } from 'react-dom';
import { validArticleHref } from '@inkling/contracts';
import { DeskDialog } from './DeskDialog';

export interface FormatField {
  kind: 'link' | 'language';
  value: string;
  target: CommandTarget;
  generation: number;
}

export function FormatFieldDialog({
  editor,
  field,
  close,
}: {
  editor: WritingSurface;
  field: FormatField;
  close: () => void;
}) {
  const [value, setValue] = useState(field.value);
  const [error, setError] = useState('');
  const errorId = useId();
  const composing = useRef(false);
  const link = field.kind === 'link';
  function apply(remove = false) {
    if (composing.current || editor.composing) return;
    if (
      !editor.isEditable ||
      field.generation !== editor.generation ||
      !field.target.block.domNode?.isConnected ||
      field.target.block.text !== field.target.original
    ) {
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
    const { block, start, end, link: token } = field.target;
    editor.muya.editor.history.cutoff();
    flushSync(close);
    editor.dom.focus({ preventScroll: true });
    if (link) {
      const from = token?.range.start ?? start,
        to = token?.range.end ?? end;
      const label = token?.anchor ?? block.text.slice(start, end);
      const replacement = remove
        ? label
        : '[' + (label || input) + '](' + input + ' )';
      block.text =
        block.text.slice(0, from) + replacement + block.text.slice(to);
      block.setCursor(
        from + replacement.length,
        from + replacement.length,
        true,
      );
    } else {
      const outer = block.outMostBlock,
        state = outer?.getState();
      if (!outer || state?.name !== 'code-block') return;
      const next = createBlock(editor, {
        ...state,
        meta: { ...state.meta, lang: input },
      });
      outer.replaceWith(next);
      next.lastContentInDescendant()?.setCursor(end, end, true);
    }
  }
  return (
    <DeskDialog
      title={link ? '编辑链接' : '代码语言'}
      close={() => {
        if (composing.current) return;
        flushSync(close);
        if (editor.isEditable && field.target.block.domNode?.isConnected) {
          editor.dom.focus({ preventScroll: true });
          field.target.block.setCursor(
            field.target.start,
            field.target.end,
            true,
          );
        }
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
