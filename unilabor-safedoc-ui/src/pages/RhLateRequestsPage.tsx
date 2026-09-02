import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Clock, Eye, Loader2, UnlockKeyhole } from 'lucide-react';
import { authorizeLateAttempt, getApiErrorMessage, listExpiredAssignments } from '../api/service';
import { LateAssignmentDetailDrawer } from '../components/rh/LateAssignmentDetailDrawer';
import type { EvaluationAssignment } from '../types/models';
import { confirmAction } from '../utils/confirm';
import { notifyError, notifySuccess } from '../utils/notify';

export const RhLateRequestsPage = () => {
  const [items, setItems] = useState<EvaluationAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorizingId, setAuthorizingId] = useState<number | null>(null);
  // Plazo de reapertura elegido por renglon (horas). Sin elegir => window_hours del template.
  const [hoursById, setHoursById] = useState<Record<number, number>>({});
  // Asignacion cuyo detalle se esta viendo (modal).
  const [detailItem, setDetailItem] = useState<EvaluationAssignment | null>(null);

  // Opciones de plazo de reapertura ofrecidas a RH.
  const REOPEN_OPTIONS = [12, 24, 48, 72];

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

  const authorize = async (item: EvaluationAssignment, hours: number) => {
    const confirmed = await confirmAction(
      'Autorizar realización extemporánea',
      `Se reabrirá la evaluación de ${item.employee_name} con un nuevo plazo de ${hours} h para presentarla.`,
      `Autorizar (${hours}h)`,
      'primary',
    );
    if (!confirmed) {
      return;
    }

    setAuthorizingId(item.id);
    try {
      await authorizeLateAttempt(item.id, hours);
      notifySuccess(`Autorización extemporánea otorgada. Se reabrió el plazo por ${hours}h.`);
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
          Capacitación
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
          <Clock size={24} /> Evaluaciones vencidas
        </h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Evaluaciones que vencieron sin realizarse. Autoriza una realización extemporánea para reabrir el plazo.
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
                    <Clock size={12} /> El colaborador solicitó autorización
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailItem(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-slate-50"
                >
                  <Eye size={15} /> Ver detalle
                </button>
                <label className="flex items-center gap-1 text-xs font-medium text-[var(--unilabor-neutral)]">
                  Plazo
                  <select
                    value={hoursById[item.id] ?? item.window_hours}
                    onChange={(event) =>
                      setHoursById((prev) => ({ ...prev, [item.id]: Number(event.target.value) }))
                    }
                    disabled={authorizingId === item.id}
                    className="rounded-lg border border-[rgba(0,65,106,0.14)] bg-white px-2 py-1.5 text-sm font-semibold text-[var(--color-brand-700)] disabled:opacity-50"
                  >
                    {REOPEN_OPTIONS.map((hours) => (
                      <option key={hours} value={hours}>
                        {hours}h{hours === item.window_hours ? ' (def.)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void authorize(item, hoursById[item.id] ?? item.window_hours)}
                  disabled={authorizingId === item.id}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                >
                  {authorizingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <UnlockKeyhole size={15} />}
                  Autorizar extemporáneo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {detailItem && (
          <LateAssignmentDetailDrawer assignment={detailItem} onClose={() => setDetailItem(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};
