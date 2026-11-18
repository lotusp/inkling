import { useId, useRef, type ReactNode } from 'react';

export function DeskMenu({
  label,
  trigger,
  children,
  disabled,
  onOpen,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  onOpen?: () => void;
}) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchor}
        className="desk-trigger"
        aria-label={label}
        title={label}
        disabled={disabled}
        popoverTarget={id}
      >
        {trigger}
      </button>
      <div
        id={id}
        popover="auto"
        className="desk-menu"
        onBeforeToggle={(event) => {
          if (event.newState === 'open') onOpen?.();
        }}
        onToggle={(event) => {
          const menu = event.currentTarget;
          if (!menu.matches(':popover-open') || !anchor.current) return;
          const box = anchor.current.getBoundingClientRect();
          menu.style.left =
            Math.max(
              6,
              Math.min(
                innerWidth - menu.offsetWidth - 6,
                box.right - menu.offsetWidth,
              ),
            ) + 'px';
          menu.style.top =
            (box.bottom + menu.offsetHeight + 6 <= innerHeight
              ? box.bottom + 4
              : Math.max(6, box.top - menu.offsetHeight - 4)) + 'px';
        }}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('button'))
            event.currentTarget.hidePopover();
        }}
      >
        {children}
      </div>
    </>
  );
}
