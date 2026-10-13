import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useEscapeStack } from './ModalShell';

const TRANSITION_MS = 300;

interface DrawerShellProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  /** Impide cerrar mientras se guarda. */
  busy?: boolean;
}

interface PanelProps extends Omit<DrawerShellProps, 'open'> {
  shown: boolean;
}

const DrawerPanel = ({ shown, title, subtitle, onClose, children, widthClass = 'max-w-xl', busy = false }: PanelProps) => {
  useEscapeStack(onClose, busy);
  return (
    <div
      className={`fixed inset-0 z-[60] flex justify-end bg-[rgba(11,34,53,0.28)] backdrop-blur-sm transition-opacity ease-out motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`flex h-full w-full ${widthClass} flex-col bg-white shadow-2xl transition-transform ease-out motion-reduce:transition-none ${shown ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      >
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
      </div>
    </div>
  );
};

/**
 * Panel lateral derecho con animacion: entra deslizando desde la derecha y sale igual al cerrarse.
 * Va por encima de un modal abierto (z-60) y comparte la pila de Escape. Se mantiene montado durante
 * la salida y se desmonta al terminar (el contenido se reinicia en la siguiente apertura).
 */
export const DrawerShell = ({ open, ...panel }: DrawerShellProps) => {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return mounted ? <DrawerPanel shown={shown} {...panel} /> : null;
};
