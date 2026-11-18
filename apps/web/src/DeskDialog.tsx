import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function DeskDialog({
  title,
  close,
  blocked = false,
  children,
}: {
  title: string;
  close: () => void;
  blocked?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const field = dialog.querySelector<HTMLElement>(
      'input:not(:disabled), textarea:not(:disabled), [data-initial-focus]',
    );
    field?.focus();
    if (field instanceof HTMLInputElement) field.select();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="desk-dialog"
      aria-labelledby={heading}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) event.preventDefault();
        }
      }}
      onClick={(event) => {
        if (blocked || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!blocked) close();
      }}
    >
      <header>
        <h2 id={heading}>{title}</h2>
        <button
          type="button"
          aria-label="关闭面板"
          disabled={blocked}
          onClick={close}
        >
          <X size={17} />
        </button>
      </header>
      <div className="desk-dialog-body">{children}</div>
    </dialog>
  );
}
