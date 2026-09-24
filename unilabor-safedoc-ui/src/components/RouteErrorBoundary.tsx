import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, reloadForFreshBundle } from '../utils/chunkReload';

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

/**
 * Ultimo recurso ante un error de render: sin esto React desmonta todo el
 * arbol y el usuario ve la pantalla en blanco (ni sidebar) sin pista alguna.
 * Si el error es un chunk que ya no existe tras un deploy, recarga una vez;
 * en cualquier otro caso muestra un aviso con boton de recarga.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadForFreshBundle()) {
      return;
    }
    console.error('[SafeDoc] Error de render no controlado', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const isStaleBundle = isChunkLoadError(error);

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 p-6 text-center shadow-lg shadow-[rgba(0,65,106,0.08)]">
          <h1 className="text-lg font-bold text-[var(--color-brand-700)]">
            {isStaleBundle ? 'Hay una versión nueva de SafeDoc' : 'No se pudo mostrar esta pantalla'}
          </h1>
          <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">
            {isStaleBundle
              ? 'Recarga la página para continuar con la versión actualizada.'
              : 'Ocurrió un error inesperado. Recarga la página; si persiste, avisa al administrador.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Recargar
            </button>
            <a
              href="/select-module"
              className="rounded-xl border border-[rgba(0,65,106,0.14)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.35)]"
            >
              Ir al inicio
            </a>
          </div>
        </div>
      </div>
    );
  }
}
