import { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, CheckCircle2, ClipboardList, GraduationCap, Loader2, Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getMyInductionOverview } from '../api/service.api-rh-induction';
import { getApiErrorMessage } from '../api/service.parsers';
import type { InductionTrackPhase, RhInductionProgressItem } from '../types/models';

const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';
const buttonClass =
  'rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]';

const formatDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }) : '';

const stepStatus = (item: RhInductionProgressItem): { label: string; icon: typeof BookOpenCheck; done: boolean } => {
  if (item.evaluation_status === 'passed') {
    return { label: 'Fase aprobada', icon: CheckCircle2, done: true };
  }
  if (item.evaluation_status === 'failed') {
    return { label: 'Evaluación no acreditada: RH te indicará cuándo puedes presentar de nuevo.', icon: ClipboardList, done: false };
  }
  if (item.evaluation_status === 'expired') {
    return { label: 'El plazo de la evaluación venció: RH te indicará cuándo puedes presentar de nuevo.', icon: ClipboardList, done: false };
  }
  if (item.evaluation_status === 'grading' || item.evaluation_status === 'submitted') {
    return { label: 'Evaluación enviada, en revisión por RH', icon: ClipboardList, done: false };
  }
  if (item.evaluation_assignment_id) {
    return { label: 'Evaluación disponible', icon: GraduationCap, done: false };
  }
  if (item.reading_completed_at) {
    return { label: 'Lectura completa, esperando evaluación', icon: ClipboardList, done: false };
  }
  if (item.phase_published === false) {
    return { label: 'Inscrito: la fase aún no se publica. RH te avisará cuando puedas empezar a leer.', icon: ClipboardList, done: false };
  }
  if (item.readings_start_at && item.reading_total === 0) {
    return { label: `Periodo de descanso: tus lecturas se activan el ${formatDateTime(item.readings_start_at)}.`, icon: ClipboardList, done: false };
  }
  return { label: `Leyendo documentos (${item.reading_signed}/${item.reading_total})`, icon: BookOpenCheck, done: false };
};

const canTakeEvaluation = (item: RhInductionProgressItem): boolean =>
  Boolean(item.evaluation_assignment_id) &&
  (item.evaluation_status === 'pending' || item.evaluation_status === 'in_progress' || item.evaluation_status === 'authorized_late');

const TrackStep = ({ phase, item, isLast }: { phase: InductionTrackPhase; item: RhInductionProgressItem | undefined; isLast: boolean }) => {
  const done = phase.passed;
  const active = !done && phase.access === 'ENROLLED';
  const available = phase.access === 'AVAILABLE';
  const tone = done ? 'bg-emerald-500 text-white' : active ? 'bg-[var(--color-brand-700)] text-white' : available ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-500';
  return (
    <li className="relative flex-1 min-w-[120px]">
      <div className="flex items-center">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tone}`}>
          {done ? <CheckCircle2 size={16} /> : phase.access === 'LOCKED' ? <Lock size={14} /> : phase.phase_number}
        </span>
        {!isLast ? <span className={`mx-1 h-0.5 flex-1 ${done ? 'bg-emerald-400' : 'bg-[rgba(0,65,106,0.12)]'}`} /> : null}
      </div>
      <p className="mt-2 text-xs font-bold text-[var(--color-brand-700)]">Fase {phase.phase_number}</p>
      <p className="text-[11px] leading-4 text-[var(--unilabor-neutral)]">{phase.phase_name}</p>
      <p className="mt-1 text-[11px] font-semibold">
        {done ? (
          <span className="text-emerald-700">Aprobada{phase.passed_at ? ` · ${new Date(phase.passed_at).toLocaleDateString('es-MX')}` : ''}</span>
        ) : active ? (
          <span className="text-[var(--color-brand-700)]">{item ? stepStatus(item).label.split(':')[0] : 'En curso'}</span>
        ) : available ? (
          <span className="text-sky-700">{phase.published ? 'Se abre al aprobar la anterior' : 'Disponible cuando RH la publique'}</span>
        ) : (
          <span className="text-slate-500">Requiere aprobar la Fase {phase.phase_number - 1}</span>
        )}
      </p>
    </li>
  );
};

/**
 * "Mi inducción": ruta de las Fases 1-4 a ritmo del colaborador (al aprobar
 * una fase se abre la siguiente) + detalle de cada fase inscrita, incluidas
 * las fases por puesto (5-6) cuando RH las inscribe.
 */
export const RhMyInductionPage = () => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<RhInductionProgressItem[]>([]);
  const [track, setTrack] = useState<InductionTrackPhase[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await getMyInductionOverview();
      setProgress(overview.progress);
      setTrack(overview.track);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cargar tu progreso de inducción.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const passedCount = track.filter((phase) => phase.passed).length;
  const nextPhase = track.find((phase) => !phase.passed);
  const currentItem = nextPhase ? progress.find((item) => item.phase_number === nextPhase.phase_number) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Mi espacio</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Mi inducción</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
          Avanzas a tu propio ritmo: lees los documentos de la fase en Sala de Lectura, presentas la evaluación y, al acreditarla, se
          abre la siguiente fase automáticamente con su propio plazo de lectura y su ventana para presentar.
        </p>
      </div>

      {loading ? (
        <div className={cardClass}>
          <p className="text-sm text-[var(--unilabor-neutral)]">Cargando...</p>
        </div>
      ) : (
        <>
          {track.length > 0 ? (
            <section className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[var(--color-brand-700)]">Ruta institucional (Fases 1-4)</h2>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  {passedCount} de {track.length} aprobadas
                </span>
              </div>
              <ol className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {track.map((phase, index) => (
                  <TrackStep key={phase.phase_id} phase={phase} item={progress.find((item) => item.phase_number === phase.phase_number)} isLast={index === track.length - 1} />
                ))}
              </ol>
              {nextPhase && (nextPhase.reading_time_limit_hours || nextPhase.evaluation_window_hours || nextPhase.attempt_time_limit_minutes) ? (
                <p className="mt-4 inline-flex flex-wrap items-center gap-1.5 rounded-xl bg-[rgba(248,251,253,0.96)] px-3 py-2 text-[11px] text-[var(--unilabor-ink)]">
                  <Sparkles size={12} className="text-[var(--color-brand-500)]" />
                  Reglas de la Fase {nextPhase.phase_number}:
                  {nextPhase.advance_grace_hours ? <span>{nextPhase.advance_grace_hours} h de descanso al llegar ·</span> : null}
                  {nextPhase.reading_time_limit_hours ? <span>{nextPhase.reading_time_limit_hours} h para leer</span> : <span>sin límite de lectura</span>}
                  {nextPhase.evaluation_window_hours ? <span>· {nextPhase.evaluation_window_hours} h para presentar</span> : null}
                  {nextPhase.attempt_time_limit_minutes ? <span>· {nextPhase.attempt_time_limit_minutes} min por intento</span> : null}
                  {nextPhase.passing_score ? <span>· mínimo {nextPhase.passing_score} %</span> : null}
                  {currentItem?.reading_deadline_at && !currentItem.reading_completed_at && !currentItem.evaluation_assignment_id ? (
                    <span className="font-semibold text-amber-700">· tu lectura vence el {formatDateTime(currentItem.reading_deadline_at)}</span>
                  ) : null}
                </p>
              ) : null}
            </section>
          ) : null}

          <div className={cardClass}>
            <h2 className="mb-3 text-base font-bold text-[var(--color-brand-700)]">Mis fases</h2>
            {progress.length === 0 ? (
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
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={20} className={step.done ? 'text-emerald-600' : 'text-[var(--color-brand-500)]'} />
                        <div>
                          <p className="font-bold text-[var(--color-brand-700)]">
                            Fase {item.phase_number}: {item.phase_name}
                          </p>
                          <p className="text-xs text-[var(--unilabor-neutral)]">{step.label}</p>
                          {item.reading_deadline_at && !item.reading_completed_at && !item.evaluation_assignment_id ? (
                            <p className="text-xs font-semibold text-amber-600">Fecha límite de lectura: {formatDateTime(item.reading_deadline_at)}</p>
                          ) : null}
                        </div>
                      </div>

                      {canTakeEvaluation(item) ? (
                        <button type="button" onClick={() => navigate(`/rh/my-evaluations/${item.evaluation_assignment_id}`)} className={buttonClass}>
                          Realizar evaluación
                        </button>
                      ) : !item.reading_completed_at && !item.evaluation_assignment_id && item.phase_published !== false && !(item.readings_start_at && item.reading_total === 0) ? (
                        <button type="button" onClick={() => navigate('/quality/my-readings')} className={buttonClass}>
                          Ir a leer
                        </button>
                      ) : item.evaluation_status === 'passed' ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                          Aprobada
                        </span>
                      ) : item.evaluation_status === 'failed' || item.evaluation_status === 'expired' ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                          Espera a RH
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
        </>
      )}
    </div>
  );
};
