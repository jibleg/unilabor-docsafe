import { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, CheckCircle2, ClipboardList, GraduationCap, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getMyInductionProgress } from '../api/service.api-rh-induction';
import { getApiErrorMessage } from '../api/service.parsers';
import type { RhInductionProgressItem } from '../types/models';

const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';

const stepStatus = (item: RhInductionProgressItem): { label: string; icon: typeof BookOpenCheck; done: boolean } => {
  if (item.evaluation_status === 'passed') {
    return { label: 'Fase aprobada', icon: CheckCircle2, done: true };
  }
  if (item.evaluation_status === 'failed') {
    return { label: 'Evaluación no acreditada', icon: ClipboardList, done: false };
  }
  if (item.evaluation_assignment_id) {
    return { label: 'Evaluación disponible', icon: GraduationCap, done: false };
  }
  if (item.reading_completed_at) {
    return { label: 'Lectura completa, esperando evaluación', icon: ClipboardList, done: false };
  }
  return { label: `Leyendo documentos (${item.reading_signed}/${item.reading_total})`, icon: BookOpenCheck, done: false };
};

export const RhMyInductionPage = () => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<RhInductionProgressItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProgress(await getMyInductionProgress());
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cargar tu progreso de inducción.'));
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
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Mi espacio</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Mi inducción</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
          Tu progreso en las fases de inducción institucional. Primero lees los documentos asignados
          en Sala de Lectura; al firmarlos todos —o al vencer la fecha límite de lectura, si la fase
          tiene una— se habilita la evaluación de la fase.
        </p>
      </div>

      <div className={cardClass}>
        {loading ? (
          <p className="text-sm text-[var(--unilabor-neutral)]">Cargando...</p>
        ) : progress.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
            Todavía no tienes fases de inducción asignadas.
          </p>
        ) : (
          <div className="space-y-3">
            {progress.map((item) => {
              const step = stepStatus(item);
              const Icon = step.icon;
              return (
                <div
                  key={item.enrollment_id}
                  className="flex items-center justify-between rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Icon size={20} className={step.done ? 'text-emerald-600' : 'text-[var(--color-brand-500)]'} />
                    <div>
                      <p className="font-bold text-[var(--color-brand-700)]">
                        Fase {item.phase_number}: {item.phase_name}
                      </p>
                      <p className="text-xs text-[var(--unilabor-neutral)]">{step.label}</p>
                      {item.reading_deadline_at && !item.reading_completed_at && !item.evaluation_assignment_id ? (
                        <p className="text-xs font-semibold text-amber-600">
                          Fecha límite de lectura:{' '}
                          {new Date(item.reading_deadline_at).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {item.evaluation_assignment_id && item.evaluation_status !== 'passed' && item.evaluation_status !== 'failed' ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/rh/my-evaluations/${item.evaluation_assignment_id}`)}
                      className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                    >
                      Realizar evaluación
                    </button>
                  ) : !item.reading_completed_at && !item.evaluation_assignment_id ? (
                    <button
                      type="button"
                      onClick={() => navigate('/quality/my-readings')}
                      className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                    >
                      Ir a leer
                    </button>
                  ) : item.evaluation_assignment_id && item.evaluation_status !== 'passed' ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/rh/my-evaluations/${item.evaluation_assignment_id}`)}
                      className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                    >
                      Realizar evaluación
                    </button>
                  ) : item.evaluation_status === 'passed' ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                      Aprobada
                    </span>
                  ) : (
                    <Loader2 size={16} className="animate-spin text-[var(--unilabor-neutral)]" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
