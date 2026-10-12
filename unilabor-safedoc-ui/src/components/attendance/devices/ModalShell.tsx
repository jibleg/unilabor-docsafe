import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  /** Evita cerrar con Escape/clic fuera (p. ej. mientras se guarda o al mostrar una clave). */
  locked?: boolean;
  maxWidthClass?: string;
}

/** Modal base del modulo de asistencias (Relojes y Parametros). */
export const ModalShell = ({ title, eyebrow, children, onClose, locked = false, maxWidthClass = 'max-w-lg' }: ModalShellProps) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(15,23,42,0.4)] px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxWidthClass} rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white p-5 shadow-2xl shadow-[rgba(0,65,106,0.18)] sm:p-6`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">{eyebrow}</p>
            ) : null}
            <h2 className="mt-1 text-xl font-bold text-[var(--color-brand-700)]">{title}</h2>
          </div>
          {!locked ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
};

export const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] focus:border-[var(--color-brand-500)] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400';
export const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';
export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50';
