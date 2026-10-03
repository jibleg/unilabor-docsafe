import { useEffect, useState } from 'react';
import { getInductionEmployee360 } from '../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../api/service.parsers';
import type { InductionEmployee360 } from '../types/models';
import { buildProgramTrack } from '../utils/inductionProgramTrack';
import { notifyError } from '../utils/notify';

/**
 * Fase que conviene mostrar al abrir: la que está cursando; si no, la que
 * espera entrar (lista o bloqueada); si no, la última con información.
 */
export const defaultOpenPhase = (detail: InductionEmployee360): number | null => {
  const track = buildProgramTrack(detail);
  const pick =
    track.find((phase) => phase.state === 'active') ??
    track.find((phase) => phase.state === 'blocked' || phase.state === 'ready') ??
    [...track].reverse().find((phase) => phase.state === 'done');
  return pick ? pick.phase_number : null;
};

/**
 * Carga la vista 360 de inducción de un colaborador y la recarga cuando cambia
 * `refreshKey` (tras una acción de RH). Conserva el último detalle mientras recarga.
 */
export const useInductionEmployee360 = (employeeId: number | null, refreshKey: number) => {
  const requestKey = employeeId ? `${employeeId}:${refreshKey}` : null;
  const [state, setState] = useState<{ key: string | null; detail: InductionEmployee360 | null }>({ key: null, detail: null });

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    getInductionEmployee360(employeeId)
      .then((data) => {
        if (!cancelled) setState({ key: requestKey, detail: data });
      })
      .catch((error) => {
        if (cancelled) return;
        notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle del colaborador.'));
        setState((prev) => ({ ...prev, key: requestKey }));
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, requestKey]);

  return {
    detail: state.detail && state.detail.employee.id === employeeId ? state.detail : null,
    loading: requestKey !== null && state.key !== requestKey,
  };
};
