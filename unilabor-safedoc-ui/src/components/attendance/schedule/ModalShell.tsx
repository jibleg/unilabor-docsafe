import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Pila de modales abiertos: Escape solo cierra el de encima.
const openModals: symbol[] = [];

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
  /** Impide cerrar mientras se guarda. */
  busy?: boolean;
}

/** Modal base con cabecera, cuerpo desplazable y pie; cierra con Escape. */
export const ModalShell = ({ title, subtitle, onClose, children, footer, widthClass = 'max-w-2xl', busy = false }: ModalShellProps) => {
  const [token] = useState(() => Symbol('modal'));
  useEffect(() => {
    openModals.push(token);
    return () => {
      const index = openModals.indexOf(token);
      if (index >= 0) openModals.splice(index, 1);
    };
  }, [token]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && openModals[openModals.length - 1] === token) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, busy, token]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[92vh] w-full ${widthClass} flex-col rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white shadow-2xl shadow-[rgba(0,65,106,0.16)]`}>
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--color-brand-700)]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} disabled={busy} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
};
