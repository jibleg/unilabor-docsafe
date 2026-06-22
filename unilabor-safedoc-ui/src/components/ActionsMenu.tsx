import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const MENU_WIDTH = 200;

export const ActionsMenu = ({ items }: { items: ActionMenuItem[] }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleDismiss = () => setOpen(false);
    document.addEventListener('mousedown', handlePointer);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open]);

  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - MENU_WIDTH) });
    }
    setOpen((current) => !current);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label="Acciones"
        className="inline-flex items-center justify-center rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 p-1.5 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
      >
        <MoreVertical size={16} />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH }}
              className="z-50 overflow-hidden rounded-xl border border-[rgba(0,65,106,0.12)] bg-white py-1 shadow-2xl shadow-[rgba(0,65,106,0.18)]"
            >
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition disabled:opacity-50 ${
                    item.danger
                      ? 'text-[#b02a2a] hover:bg-[rgba(190,40,40,0.08)]'
                      : 'text-[var(--unilabor-ink)] hover:bg-[rgba(191,212,230,0.28)]'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
