import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Award, CalendarClock, ClipboardCheck, Clock, GraduationCap, Loader2 } from 'lucide-react';
import {
  getApiErrorMessage,
  getEmployeeDocumentUrl,
  listMyEvaluations,
  requestLateAuthorization,
} from '../api/service';
import type { EvaluationAssignment } from '../types/models';
import { notifyError, notifySuccess } from '../utils/notify';
import {
  EVALUATION_STATUS_META,
  formatTimeRemaining,
  isAssignmentActionable,
} from '../utils/evaluations';

export const MyEvaluationsPage = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listMyEvaluations({ page: 1, limit: 50 });
      setAssignments(result.data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar tus evaluaciones.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCertificate = async (documentId: number) => {
    try {
      const url = await getEmployeeDocumentUrl(documentId);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la constancia.'));
    }
  };

  const requestLate = async (assignmentId: number) => {
    try {
      await requestLateAuthorization(assignmentId);
      notifySuccess('Solicitud enviada a RH para autorizacion extemporanea.');
      void load();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo enviar la solicitud.'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
          Capacitacion
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
          <GraduationCap size={24} /> Mis evaluaciones
        </h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Evaluaciones de capacitacion asignadas. Cuentas con 72 horas desde su disponibilidad para realizarlas.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 className="mr-2 animate-spin" size={18} /> Cargando tus evaluaciones...
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.7)] py-16 text-center text-sm text-[var(--unilabor-neutral)]">
          No tienes evaluaciones asignadas por ahora.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {assignments.map((assignment, index) => {
            const meta = EVALUATION_STATUS_META[assignment.status];
            const actionable = isAssignmentActionable(assignment.status, assignment.deadline_at);
            const remaining = formatTimeRemaining(assignment.deadline_at);
            return (
              <motion.div
                key={assignment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
                className="flex flex-col gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-[0_8px_20px_rgba(0,65,106,0.05)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--color-brand-700)]">
                      {assignment.course_title ?? 'Capacitacion'}
                    </p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">{assignment.template_title}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--unilabor-neutral)]">
                  <span className="inline-flex items-center gap-1">
                    <ClipboardCheck size={13} /> {assignment.question_count ?? 0} pregunta(s)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock size={13} /> {remaining}
                  </span>
                  {assignment.percentage !== null && (
                    <span className="font-semibold text-[var(--color-brand-700)]">
                      {assignment.percentage}%
                    </span>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  {assignment.certificate_document_id && (
                    <button
                      type="button"
                      onClick={() => void openCertificate(assignment.certificate_document_id!)}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <Award size={15} /> Ver constancia
                    </button>
                  )}
                  {assignment.status === 'expired' &&
                    (assignment.late_requested_at ? (
                      <span className="inline-flex items-center gap-1 rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-xs font-semibold text-[var(--unilabor-neutral)]">
                        <Clock size={14} /> Solicitud enviada a RH
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void requestLate(assignment.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                      >
                        <Clock size={15} /> Solicitar autorizacion
                      </button>
                    ))}
                  {actionable && (
                    <button
                      type="button"
                      onClick={() => navigate(`/rh/my-evaluations/${assignment.id}`)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                    >
                      Realizar evaluacion
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
