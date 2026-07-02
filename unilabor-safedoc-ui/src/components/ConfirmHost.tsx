import { useEffect, useRef, useState } from 'react';
import {
  getConfirmState,
  resolveConfirm,
  subscribeConfirm,
  type ConfirmVariant,
} from '../utils/confirm';

const CONFIRM_BUTTON_CLASS: Record<ConfirmVariant, string> = {
  // Alto contraste para buena visibilidad.
  danger:
    'rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700',
  primary:
    'rounded-lg bg-[var(--color-brand-700)] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90',
};

/**
 * Punto de montaje del modal de confirmacion. Debe renderizarse UNA sola vez en
 * el arbol (p. ej. en App, junto al ToastContainer). Es bloqueante: el backdrop
 * cubre la app y captura el clic; Escape o clic fuera = cancelar.
 */
export const ConfirmHost = () => {
  const [active, setActive] = useState(getConfirmState());
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeConfirm(() => setActive(getConfirmState())), []);

  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resolveConfirm(false);
      }
    };
    document.addEventListener('keydown', onKey);
    // Enfoca el boton de confirmacion para navegacion por teclado.
    confirmButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  if (!active) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(11,34,53,0.4)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => resolveConfirm(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-2xl shadow-[rgba(0,65,106,0.2)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-bold text-[var(--unilabor-ink)]">{active.title}</p>
        <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">{active.description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            onClick={() => resolveConfirm(false)}
          >
            Cancelar
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={CONFIRM_BUTTON_CLASS[active.variant]}
            onClick={() => resolveConfirm(true)}
          >
            {active.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
