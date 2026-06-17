import type { EvaluationAssignmentStatus } from '../types/models';

/** Etiquetas y estilos de los estados de una asignacion de evaluacion. */
export const EVALUATION_STATUS_META: Record<
  EvaluationAssignmentStatus,
  { label: string; className: string }
> = {
  pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'En progreso', className: 'bg-sky-100 text-sky-700' },
  submitted: { label: 'Enviada', className: 'bg-indigo-100 text-indigo-700' },
  grading: { label: 'En revision', className: 'bg-violet-100 text-violet-700' },
  passed: { label: 'Acreditada', className: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'No acreditada', className: 'bg-red-100 text-red-700' },
  expired: { label: 'Vencida', className: 'bg-slate-200 text-slate-600' },
  authorized_late: { label: 'Extemporanea', className: 'bg-teal-100 text-teal-700' },
};

/**
 * Texto de tiempo restante hasta la fecha limite (deadline). Devuelve "Vencida"
 * si ya paso. Pensado para la ventana de 72h.
 */
export const formatTimeRemaining = (deadlineIso: string): string => {
  const deadline = new Date(deadlineIso).getTime();
  if (!Number.isFinite(deadline)) {
    return '';
  }
  const diffMs = deadline - Date.now();
  if (diffMs <= 0) {
    return 'Vencida';
  }
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h restantes`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m restantes`;
  }
  return `${minutes}m restantes`;
};

/** Indica si la asignacion sigue accionable por el colaborador (vigente). */
export const isAssignmentActionable = (status: EvaluationAssignmentStatus, deadlineIso: string): boolean =>
  (status === 'pending' || status === 'in_progress') && new Date(deadlineIso).getTime() > Date.now();
