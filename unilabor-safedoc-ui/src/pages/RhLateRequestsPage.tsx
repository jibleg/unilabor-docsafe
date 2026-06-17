import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, UnlockKeyhole } from 'lucide-react';
import { authorizeLateAttempt, getApiErrorMessage, listExpiredAssignments } from '../api/service';
import type { EvaluationAssignment } from '../types/models';
import { notifyError, notifySuccess } from '../utils/notify';

export const RhLateRequestsPage = () => {
  const [items, setItems] = useState<EvaluationAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorizingId, setAuthorizingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listExpiredAssignments({ page: 1, limit: 100 });
      setItems(result.data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las evaluaciones vencidas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const authorize = async (assignmentId: number) => {
    setAuthorizingId(assignmentId);
    try {
      await authorizeLateAttempt(assignmentId);
      notifySuccess('Autorizacion extemporanea otorgada. Se reabrio la ventana de 72h.');
      await load();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo autorizar la evaluacion.'));
    } finally {
      setAuthorizingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
          Capacitacion
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
          <Clock size={24} /> Evaluaciones vencidas
        </h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Evaluaciones que vencieron sin realizarse. Autoriza una realizacion extemporanea para reabrir la ventana.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 className="mr-2 animate-spin" size={18} /> Cargando...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.7)] py-16 text-center text-sm text-[var(--unilabor-neutral)]">
          No hay evaluaciones vencidas.
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
                  {item.employee_code} | {item.course_title} | {item.template_title}
                </p>
                {item.late_requested_at && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                    <Clock size={12} /> El colaborador solicito autorizacion
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void authorize(item.id)}
                disabled={authorizingId === item.id}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
              >
                {authorizingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <UnlockKeyhole size={15} />}
                Autorizar extemporaneo
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
