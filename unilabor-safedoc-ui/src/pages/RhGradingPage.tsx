import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { getApiErrorMessage, listGradingQueue } from '../api/service';
import type { EvaluationAssignment } from '../types/models';
import { notifyError } from '../utils/notify';
import { GradeEvaluationModal } from '../components/rh/GradeEvaluationModal';

export const RhGradingPage = () => {
  const [items, setItems] = useState<EvaluationAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [gradingId, setGradingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listGradingQueue({ page: 1, limit: 100 });
      setItems(result.data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la bandeja de calificación.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
          Capacitación
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
          <ClipboardCheck size={24} /> Calificación de evaluaciones
        </h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Evaluaciones con preguntas abiertas pendientes de revisión. Al cerrar la calificación se resuelve
          automáticamente si el colaborador acredita.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 className="mr-2 animate-spin" size={18} /> Cargando bandeja...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.7)] py-16 text-center text-sm text-[var(--unilabor-neutral)]">
          No hay evaluaciones pendientes de calificar.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-[var(--color-brand-700)]">{item.employee_name}</p>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {item.employee_code} | {item.course_title} | {item.template_title} | {item.question_count ?? 0} abierta(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGradingId(item.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
              >
                <ClipboardCheck size={15} /> Calificar
              </button>
            </li>
          ))}
        </ul>
      )}

      {gradingId !== null && (
        <GradeEvaluationModal
          assignmentId={gradingId}
          onClose={() => setGradingId(null)}
          onGraded={() => void load()}
        />
      )}
    </div>
  );
};
