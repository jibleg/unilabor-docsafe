import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  busy?: boolean;
}

/** Contenedor modal comun de Dias y Checadas (cierra con Escape salvo que este guardando). */
export const ModalShell = ({ title, subtitle, onClose, children, footer, busy = false }: ModalShellProps) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[rgba(11,34,53,0.45)] p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl shadow-[rgba(0,65,106,0.3)]">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-3">{footer}</div>
      </div>
    </div>
  );
};
