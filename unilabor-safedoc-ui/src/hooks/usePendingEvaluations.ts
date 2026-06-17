import { useEffect, useState } from 'react';
import { getMyPendingEvaluationsCount } from '../api/service';

/**
 * Conteo de evaluaciones de capacitacion pendientes (vigentes) del colaborador.
 * Calculo on-demand al ingresar; alimenta el badge del menu y el banner de aviso.
 */
export const usePendingEvaluations = (enabled = true): { count: number; loading: boolean } => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    const run = async () => {
      try {
        const value = await getMyPendingEvaluationsCount();
        if (active) {
          setCount(value);
        }
      } catch {
        if (active) {
          setCount(0);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [enabled]);

  return { count, loading };
};
