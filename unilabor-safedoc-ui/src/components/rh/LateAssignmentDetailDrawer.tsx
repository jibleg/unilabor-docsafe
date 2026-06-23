import { motion } from 'motion/react';
import { CalendarClock, GraduationCap, User, X } from 'lucide-react';
import type { EvaluationAssignment } from '../../types/models';
import { EVALUATION_STATUS_META } from '../../utils/evaluations';

interface LateAssignmentDetailDrawerProps {
  assignment: EvaluationAssignment;
  onClose: () => void;
}

const formatDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-[rgba(0,65,106,0.08)] py-2 last:border-0">
    <span className="text-xs font-medium text-[var(--unilabor-neutral)]">{label}</span>
    <span className="text-right text-sm font-semibold text-[var(--color-brand-700)]">{value}</span>
  </div>
);

/**
 * Drawer lateral (solo lectura) con el detalle de una evaluacion vencida, armado
 * con los datos que ya trae la asignacion: identidad del colaborador,
 * evaluacion/curso, parametros y la linea de tiempo (asignada / vencio /
 * solicitud del colaborador). No usa endpoint nuevo porque una vencida no tiene
 * respuestas que mostrar.
 */
export const LateAssignmentDetailDrawer = ({ assignment, onClose }: LateAssignmentDetailDrawerProps) => {
  const statusMeta = EVALUATION_STATUS_META[assignment.status];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <motion.div
        className="absolute inset-0 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.24, ease: 'easeOut' }}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.1)] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              Evaluación vencida
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{assignment.template_title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--unilabor-neutral)] transition hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          <section>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              <User size={13} /> Colaborador
            </p>
            <Row label="Nombre" value={assignment.employee_name ?? '—'} />
            <Row label="Código" value={assignment.employee_code ?? '—'} />
          </section>

          <section>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              <GraduationCap size={13} /> Evaluación
            </p>
            <Row label="Capacitación" value={assignment.course_title ?? '—'} />
            <Row
              label="Estado"
              value={
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.className}`}>
                  {statusMeta.label}
                </span>
              }
            />
            <Row label="Calificación aprobatoria" value={`${assignment.passing_score ?? 80}%`} />
            <Row label="Número de preguntas" value={assignment.question_count ?? '—'} />
            <Row label="Plazo original" value={`${assignment.window_hours ?? 72} h`} />
            <Row label="Intento" value={`#${assignment.attempt_no}`} />
          </section>

          <section>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              <CalendarClock size={13} /> Línea de tiempo
            </p>
            <Row label="Asignada" value={formatDateTime(assignment.available_at ?? assignment.created_at)} />
            <Row label="Venció" value={formatDateTime(assignment.deadline_at)} />
            <Row
              label="Solicitud del colaborador"
              value={
                assignment.late_requested_at
                  ? `Sí · ${formatDateTime(assignment.late_requested_at)}`
                  : 'No solicitada'
              }
            />
          </section>
        </div>

        <div className="border-t border-[rgba(0,65,106,0.1)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </motion.aside>
    </div>
  );
};
