import { usePendingEvaluationsStore } from '../store/usePendingEvaluationsStore';

/**
 * Conteo de evaluaciones de capacitacion pendientes (vigentes) del colaborador.
 * Lee del store compartido; el refresco lo dispara MainLayout en cada navegacion
 * de RH y TakeEvaluationPage al enviar. Asi el badge y el banner se mantienen
 * sincronizados sin recargar la pagina.
 */
export const usePendingEvaluations = (enabled = true): { count: number; loading: boolean } => {
  const count = usePendingEvaluationsStore((state) => state.count);
  const loading = usePendingEvaluationsStore((state) => state.loading);

  return {
    count: enabled ? count : 0,
    loading: enabled ? loading : false,
  };
};
