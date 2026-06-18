import { toast } from 'react-toastify';

export type ConfirmVariant = 'danger' | 'primary';

const CONFIRM_BUTTON_CLASS: Record<ConfirmVariant, string> = {
  // Alto contraste para buena visibilidad (la tonalidad institucional azul claro
  // no resaltaba lo suficiente sobre el toast).
  danger:
    'rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700',
  primary:
    'rounded-lg bg-[var(--color-brand-700)] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90',
};

/**
 * Confirmacion basada en toast (react-toastify) en lugar del window.confirm
 * nativo. Devuelve true si el usuario confirma, false si cancela o cierra.
 * `variant` define el color del boton de confirmacion (rojo para acciones
 * sensibles como cerrar sesion / inactivar; azul para confirmaciones neutras).
 */
export const confirmAction = (
  title: string,
  description: string,
  confirmLabel: string,
  variant: ConfirmVariant = 'danger',
): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;

    const settle = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    toast(
      ({ closeToast }) => (
        <div className="space-y-3">
          <p className="text-sm font-bold text-[var(--unilabor-ink)]">{title}</p>
          <p className="text-xs text-[var(--unilabor-neutral)]">{description}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              onClick={() => {
                settle(false);
                closeToast();
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={CONFIRM_BUTTON_CLASS[variant]}
              onClick={() => {
                settle(true);
                closeToast();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      {
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        onClose: () => settle(false),
      },
    );
  });
