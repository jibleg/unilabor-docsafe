import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { getPositionQuizRegeneration, startPositionQuizRegeneration } from '../../../api/service.api-rh-position-quiz';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { PositionQuizRegeneration } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess } from '../../../utils/notify';

const POLL_MS = 10_000;

/**
 * "Preguntas propias" del cuestionario de Fase 5 de un puesto: genera con IA
 * preguntas distintas a las que comparten otros puestos (mismos criterios) y
 * reemplaza las vigentes al terminar. Muestra el estado mientras genera.
 */
export const PositionQuizRegenerateButton = ({ positionId, positionName }: { positionId: number; positionName: string }) => {
  const [status, setStatus] = useState<PositionQuizRegeneration | null>(null);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getPositionQuizRegeneration(positionId));
    } catch {
      // El estado es informativo: si falla la consulta no se bloquea la pantalla.
    }
  }, [positionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = status?.status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const handle = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(handle);
  }, [running, refresh]);

  const handleStart = async () => {
    const confirmed = await confirmAction(
      'Preguntas propias del puesto',
      `Se generarán con IA preguntas NUEVAS para el cuestionario de Fase 5 de "${positionName}" (mismos criterios: 40% V/F, 10% múltiple, 50% única; al menos una por documento), distintas de las que ya usan otros puestos. Al terminar reemplazan a las vigentes; los exámenes ya presentados conservan sus preguntas. Puede tardar varios minutos.`,
      'Generar',
      'primary',
    );
    if (!confirmed) return;
    setStarting(true);
    try {
      setStatus(await startPositionQuizRegeneration(positionId));
      notifySuccess('Generando preguntas propias en segundo plano.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo iniciar la generación.'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      {running ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700">
          <Loader2 size={11} className="animate-spin" /> Generando ({status?.documents ?? 0} docs)…
        </span>
      ) : status?.status === 'failed' ? (
        <span className="text-[10px] font-semibold text-rose-600" title={status.error_message ?? ''}>
          Última generación falló
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleStart}
        disabled={running || starting}
        title="Generar preguntas propias de este puesto (distintas a las de otros puestos)"
        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
      >
        <Sparkles size={11} /> Preguntas propias
      </button>
    </span>
  );
};
