import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Award, BookOpenCheck, CheckCircle2, Circle, FileText, History, ListChecks, Loader2, Lock, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getInductionEmployee360 } from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { EvaluationResponsesModal } from '../EvaluationResponsesModal';
import type { InductionAction, InductionEmployee360, InductionRosterRow } from '../../../types/models';
import { EVALUATION_STATUS_META } from '../../../utils/evaluations';
import {
  ACTION_META,
  ALERT_META,
  ALERT_SEVERITY_CLASS,
  STAGE_META,
  formatDateTime,
  formatDuration,
  formatHours,
} from '../../../utils/inductionDashboard';
import { notifyError } from '../../../utils/notify';

interface InductionCollaboratorDrawerProps {
  employeeId: number;
  /** Fase que se muestra expandida al abrir (la del roster desde donde se abrió). */
  focusPhaseNumber?: number;
  refreshKey: number;
  onClose: () => void;
  onAction: (action: InductionAction, row: InductionRosterRow) => void;
}

const Section = ({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) => (
  <section>
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--unilabor-neutral)]">
      <Icon size={13} /> {title}
    </p>
    {children}
  </section>
);

const AUDIT_LABEL: Array<[string, string]> = [
  ['RH_INDUCTION_RETRY_AUTHORIZED', 'Nuevo intento autorizado'],
  ['RH_INDUCTION_READING_REOPENED', 'Lectura reabierta'],
  ['RH_INDUCTION_ATTEMPT_RESET', 'Intento truncado reabierto'],
  ['RH_INDUCTION_ADVANCED', 'Avance manual de fase'],
  ['RH_INDUCTION_CERTIFICATE_ISSUED', 'Constancia emitida'],
  ['RH_INDUCTION_NOTICE_RESENT', 'Aviso SMS reenviado'],
  ['RH_EVAL_AUTHORIZE_LATE', 'Autorización extemporánea'],
  ['RH_EVAL_MANUAL_CLOSE', 'Cierre manual de evaluación'],
  ['RH_INDUCTION_GRACE_ENDED', 'Descanso terminado por RH'],
];

const auditLabel = (action: string): string => AUDIT_LABEL.find(([prefix]) => action.startsWith(prefix))?.[1] ?? action;

/**
 * Vista 360 del colaborador en la Inducción: ruta de las 4 fases, detalle de
 * cada inscripción (lectura documento por documento, intentos, constancia) y
 * bitácora de acciones de RH. Las acciones se delegan a la página.
 */
export const InductionCollaboratorDrawer = ({ employeeId, focusPhaseNumber, refreshKey, onClose, onAction }: InductionCollaboratorDrawerProps) => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<InductionEmployee360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPhase, setOpenPhase] = useState<number | null>(focusPhaseNumber ?? null);
  /** Intento cuyas preguntas y respuestas se muestran en el modal de revisión. */
  const [responsesAssignmentId, setResponsesAssignmentId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInductionEmployee360(employeeId);
      setDetail(data);
      if (openPhase === null) {
        const current = [...data.enrollments].reverse().find((row) => row.stage !== 'APROBADA') ?? data.enrollments[data.enrollments.length - 1];
        setOpenPhase(current ? current.phase_number : null);
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle del colaborador.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId, openPhase]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, refreshKey]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.24, ease: 'easeOut' }}
        className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[rgba(248,251,253,1)] shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.1)] bg-white px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Expediente de inducción</p>
            {detail ? (
              <>
                <h2 className="mt-0.5 text-lg font-bold text-[var(--color-brand-700)]">{detail.employee.full_name}</h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {detail.employee.employee_code}
                  {detail.employee.position_name ? ` · ${detail.employee.position_name}` : ''}
                  {detail.employee.branch_name ? ` · ${detail.employee.branch_name}` : ''}
                  {detail.employee.area ? ` · ${detail.employee.area}` : ''}
                </p>
              </>
            ) : (
              <h2 className="mt-0.5 text-lg font-bold text-[var(--color-brand-700)]">Cargando…</h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/rh/expedients')}
              className="rounded-lg border border-[rgba(0,65,106,0.14)] px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
            >
              Ver expediente RH
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {loading && !detail ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" />
          </div>
        ) : detail ? (
          <div className="flex-1 space-y-6 px-6 py-5">
            <Section icon={User} title="Ruta institucional">
              <ol className="grid grid-cols-4 gap-2">
                {detail.track.map((phase) => {
                  const enrollment = detail.enrollments.find((row) => row.phase_number === phase.phase_number);
                  const state = phase.passed ? 'done' : phase.access === 'ENROLLED' ? 'active' : phase.access === 'AVAILABLE' ? 'available' : 'locked';
                  return (
                    <li key={phase.phase_id}>
                      <button
                        type="button"
                        disabled={!enrollment}
                        onClick={() => setOpenPhase(phase.phase_number)}
                        className={`w-full rounded-xl border px-2 py-2 text-left transition ${
                          openPhase === phase.phase_number ? 'border-[var(--color-brand-500)] bg-white shadow-sm' : 'border-[rgba(0,65,106,0.08)] bg-white/70'
                        } disabled:cursor-default`}
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-brand-700)]">
                          {state === 'done' ? (
                            <CheckCircle2 size={13} className="text-emerald-600" />
                          ) : state === 'locked' ? (
                            <Lock size={13} className="text-slate-400" />
                          ) : (
                            <Circle size={13} className={state === 'active' ? 'text-amber-500' : 'text-sky-500'} />
                          )}
                          Fase {phase.phase_number}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-[var(--unilabor-neutral)]">
                          {enrollment ? STAGE_META[enrollment.stage].short : phase.access === 'AVAILABLE' ? 'Disponible al avanzar' : 'Bloqueada'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </Section>

            {detail.enrollments.map((row) => {
              if (row.phase_number !== openPhase) return null;
              const documents = detail.documents.filter((doc) => doc.enrollment_id === row.enrollment_id);
              const attempts = detail.attempts.filter((attempt) => attempt.phase_number === row.phase_number);
              return (
                <div key={row.enrollment_id} className="space-y-5 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[var(--color-brand-700)]">Fase {row.phase_number}</p>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_META[row.stage].className}`}>
                        {STAGE_META[row.stage].label}
                      </span>
                      <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">
                        Inscrito {formatDateTime(row.enrolled_at)} · {formatHours(row.elapsed_hours)} en la fase
                        {row.stage === 'EN_DESCANSO' ? ` · en descanso, lecturas desde ${formatDateTime(row.readings_start_at)}` : ''}
                        {row.supervisor_name ? ` · Supervisor: ${row.supervisor_name}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {row.alerts.map((alert) => (
                        <span key={alert} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ALERT_SEVERITY_CLASS[ALERT_META[alert].severity]}`}>
                          {ALERT_META[alert].label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {row.actions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {row.actions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => onAction(action, row)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                            ACTION_META[action].tone === 'danger'
                              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : ACTION_META[action].tone === 'warning'
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                : ACTION_META[action].tone === 'success'
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
                          }`}
                        >
                          {ACTION_META[action].label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <Section icon={BookOpenCheck} title={`Lectura · ${row.reading_signed}/${row.reading_total} firmados`}>
                    {documents.length === 0 ? (
                      <p className="text-xs text-[var(--unilabor-neutral)]">
                        {row.stage === 'EN_DESCANSO'
                          ? `Periodo de descanso: las lecturas, el plazo y el SMS se activan ${formatDateTime(row.readings_start_at)}.`
                          : row.phase_published
                            ? 'Sin lecturas asignadas.'
                            : 'Las lecturas se asignan al publicar la fase.'}
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {documents.map((doc) => {
                          const pct = doc.pages_total > 0 ? Math.min(100, Math.round((doc.pages_seen / doc.pages_total) * 100)) : 0;
                          const signed = doc.status === 'signed';
                          return (
                            <li key={doc.document_id} className="rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-[var(--unilabor-ink)]">
                                  {doc.document_code ? <span className="mr-1 rounded bg-slate-100 px-1 font-mono text-[10px]">{doc.document_code}</span> : null}
                                  {doc.title}
                                </p>
                                <span
                                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                    signed ? 'bg-emerald-100 text-emerald-700' : doc.status === 'expired' ? 'bg-rose-100 text-rose-700' : doc.status === 'read' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {signed ? 'Firmado' : doc.status === 'read' ? 'Leído' : doc.status === 'in_progress' ? 'Leyendo' : doc.status === 'expired' ? 'Vencido' : 'Pendiente'}
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
                                <div className={`h-full ${signed ? 'bg-emerald-500' : 'bg-[#0069a6]'}`} style={{ width: `${pct}%` }} />
                              </div>
                              <p className="mt-0.5 text-[10px] text-[var(--unilabor-neutral)]">
                                {doc.pages_seen}/{doc.pages_total} páginas · {formatDuration(doc.active_seconds)} de lectura
                                {doc.signed_at ? ` · firmado ${formatDateTime(doc.signed_at)}` : doc.deadline_at ? ` · vence ${formatDateTime(doc.deadline_at)}` : ''}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Section>

                  <Section icon={FileText} title={`Evaluación · ${attempts.length} intento(s)`}>
                    {attempts.length === 0 ? (
                      <p className="text-xs text-[var(--unilabor-neutral)]">Aún no se abre el cuestionario de esta fase.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {attempts.map((attempt) => {
                          const meta = EVALUATION_STATUS_META[attempt.status as keyof typeof EVALUATION_STATUS_META];
                          return (
                            <li key={attempt.assignment_id} className={`rounded-lg border px-3 py-2 ${attempt.is_current ? 'border-[var(--color-brand-300)] bg-white' : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)]'}`}>
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-[var(--unilabor-ink)]">
                                  Intento #{attempt.attempt_no}
                                  {attempt.is_current ? <span className="ml-1 text-[10px] font-normal text-[var(--unilabor-neutral)]">(vigente)</span> : null}
                                </span>
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta?.className ?? 'bg-slate-100 text-slate-600'}`}>
                                  {meta?.label ?? attempt.status}
                                  {attempt.percentage !== null ? ` · ${attempt.percentage} %` : ''}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[10px] text-[var(--unilabor-neutral)]">
                                Abierto {formatDateTime(attempt.available_at)} · vence {formatDateTime(attempt.deadline_at)}
                                {attempt.started_at ? ` · iniciado ${formatDateTime(attempt.started_at)}` : ''}
                                {attempt.submitted_at ? ` · enviado ${formatDateTime(attempt.submitted_at)}` : ''}
                                {` · ${attempt.response_count}/${attempt.question_count} respuestas`}
                              </p>
                              {attempt.response_count > 0 || ['submitted', 'grading', 'passed', 'failed'].includes(attempt.status) ? (
                                <button
                                  type="button"
                                  onClick={() => setResponsesAssignmentId(attempt.assignment_id)}
                                  className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]"
                                >
                                  <ListChecks size={12} /> Ver preguntas y respuestas
                                </button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Section>

                  <Section icon={Award} title="Constancia">
                    {row.certificate_document_id ? (
                      <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                        <CheckCircle2 size={13} /> Emitida y archivada en el expediente (documento #{row.certificate_document_id}).
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--unilabor-neutral)]">
                        {row.stage === 'APROBADA' ? 'Aprobada sin constancia: usa "Emitir constancia".' : 'Se emite automáticamente al acreditar.'}
                        {row.missing_branch || row.missing_position ? ' Faltan datos (sucursal/puesto) para una constancia completa.' : ''}
                      </p>
                    )}
                  </Section>
                </div>
              );
            })}

            <Section icon={History} title="Bitácora de gestión">
              {detail.audit.length === 0 ? (
                <p className="text-xs text-[var(--unilabor-neutral)]">Sin acciones de RH registradas.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.audit.map((entry) => (
                    <li key={entry.id} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-1.5 text-xs">
                      <div>
                        <p className="font-semibold text-[var(--unilabor-ink)]">{auditLabel(entry.action)}</p>
                        {entry.metadata && typeof entry.metadata.note === 'string' && entry.metadata.note ? (
                          <p className="text-[11px] italic text-[var(--unilabor-neutral)]">“{entry.metadata.note}”</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right text-[10px] text-[var(--unilabor-neutral)]">
                        <p>{formatDateTime(entry.occurred_at)}</p>
                        <p>{entry.actor_name ?? 'Sistema'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        ) : null}
      </motion.aside>
      {responsesAssignmentId !== null ? (
        <div className="relative z-[70]">
          <EvaluationResponsesModal assignmentId={responsesAssignmentId} onClose={() => setResponsesAssignmentId(null)} />
        </div>
      ) : null}
    </div>
  );
};
