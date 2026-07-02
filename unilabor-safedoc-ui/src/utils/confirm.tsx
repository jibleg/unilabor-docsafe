export type ConfirmVariant = 'danger' | 'primary';

export interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  variant: ConfirmVariant;
}

interface PendingConfirm extends ConfirmDialogState {
  resolve: (value: boolean) => void;
}

// Confirmacion SINGLETON: solo puede haber una abierta a la vez. El host la
// dibuja como modal bloqueante (backdrop), asi que el usuario no puede disparar
// otra mientras esta abierta; si aun asi llega otra peticion, se ignora
// (resuelve false) para evitar apilado de dialogos.
let current: PendingConfirm | null = null;
let notifyHost: (() => void) | null = null;

/** Suscribe al host (montado una vez). Devuelve la funcion para desuscribir. */
export const subscribeConfirm = (listener: () => void): (() => void) => {
  notifyHost = listener;
  return () => {
    if (notifyHost === listener) {
      notifyHost = null;
    }
  };
};

/** Estado actual de la confirmacion (o null si no hay ninguna abierta). */
export const getConfirmState = (): ConfirmDialogState | null =>
  current
    ? {
        title: current.title,
        description: current.description,
        confirmLabel: current.confirmLabel,
        variant: current.variant,
      }
    : null;

/** Resuelve la confirmacion activa (true = confirmar, false = cancelar). */
export const resolveConfirm = (value: boolean): void => {
  if (!current) {
    return;
  }
  const { resolve } = current;
  current = null;
  notifyHost?.();
  resolve(value);
};

/**
 * Confirmacion modal bloqueante (reemplaza al window.confirm nativo y al toast).
 * Devuelve true si el usuario confirma, false si cancela, presiona Escape o hace
 * clic fuera. `variant` define el color del boton de confirmacion (rojo para
 * acciones sensibles como cerrar sesion / inactivar; azul para confirmaciones
 * neutras). Requiere que <ConfirmHost/> este montado una vez en la app.
 */
export const confirmAction = (
  title: string,
  description: string,
  confirmLabel: string,
  variant: ConfirmVariant = 'danger',
): Promise<boolean> => {
  if (current) {
    // Ya hay una confirmacion abierta: ignora la nueva (evita apilar dialogos).
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    current = { title, description, confirmLabel, variant, resolve };
    notifyHost?.();
  });
};
