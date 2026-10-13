import type { PunchType, ReviewStatus, VerificationMethod } from '../../../api/service.api-attendance-days';

export const PUNCH_TYPE_LABEL: Record<PunchType, string> = {
  in: 'Entrada',
  out: 'Salida',
  break_start: 'Inicio descanso',
  break_end: 'Fin descanso',
};

export const punchTypeLabel = (type: PunchType | null | undefined): string => (type ? PUNCH_TYPE_LABEL[type] : 'Sin tipo');

export const METHOD_LABEL: Record<VerificationMethod, string> = {
  face: 'Rostro',
  fingerprint: 'Huella',
  card: 'Tarjeta',
  pin: 'PIN',
  manual: 'Manual',
  other: 'Otro',
};

export const methodLabel = (method: VerificationMethod | null | undefined): string => (method ? METHOD_LABEL[method] : 'Otro');

export const REVIEW_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todas las revisiones' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
];

export const SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los orígenes' },
  { value: 'terminal', label: 'Reloj' },
  { value: 'manual', label: 'Manual' },
];

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  none: 'Sin revisión',
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

/** Valores aceptados en la URL para review; cualquier otro se ignora. */
export const normalizeReviewParam = (value: string | null): string =>
  value === 'pending' || value === 'approved' || value === 'rejected' ? value : '';

export const normalizeSourceParam = (value: string | null): string => (value === 'terminal' || value === 'manual' ? value : '');

export const MIN_REASON = 5;
export const MAX_JUSTIFICATION = 500;

export const isReasonValid = (reason: string): boolean => reason.trim().length >= MIN_REASON;

export const isFutureMoment = (date: string, time: string, now: Date = new Date()): boolean => {
  if (!date) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (date > today) return true;
  if (date < today || !/^\d{2}:\d{2}$/.test(time)) return false;
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0) > now.getHours() * 60 + now.getMinutes();
};

/** Mensaje de validacion del formulario de checada manual o null si es valido. */
export const validateManualPunch = (form: { employeeId: string; date: string; time: string; reason: string }, now: Date = new Date()): string | null => {
  if (!form.employeeId) return 'Selecciona un colaborador.';
  if (!form.date) return 'Indica la fecha.';
  if (!/^\d{2}:\d{2}$/.test(form.time)) return 'Indica la hora.';
  if (isFutureMoment(form.date, form.time, now)) return 'No se permiten checadas en fecha u hora futura.';
  if (!isReasonValid(form.reason)) return `El motivo debe tener al menos ${MIN_REASON} caracteres.`;
  if (form.reason.trim().length > MAX_JUSTIFICATION) return `El motivo admite hasta ${MAX_JUSTIFICATION} caracteres.`;
  return null;
};

export const describeRecalculation = (result: { employees: number; days: number }): string =>
  result.days > 0
    ? `${result.days} día(s) recalculado(s).`
    : 'Sin recálculo: el día de hoy lo calcula el proceso nocturno.';

/** Hora del reloj solo si difiere de la registrada (a nivel de segundo). */
export const deviceTimeDiffers = (punchedAt: string, reportedAt: string | null): boolean => {
  if (!reportedAt) return false;
  const a = new Date(punchedAt).getTime();
  const b = new Date(reportedAt).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) >= 1000;
};

const localDay = (value: string): string => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

/** Clave colaborador + dia (zona del navegador) para agrupar las checadas de un mismo dia. */
export const punchDayKey = (punch: { employee: { id: number } | null; device_employee_number: string | null; punched_at: string }): string =>
  `${punch.employee ? `e${punch.employee.id}` : `n${punch.device_employee_number ?? ''}`}|${localDay(punch.punched_at)}`;

/** Todas las checadas cargadas de cada colaborador por dia, en orden cronologico. */
export const groupPunchesByDay = <T extends { id: number; employee: { id: number } | null; device_employee_number: string | null; punched_at: string }>(
  punches: T[],
): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const punch of punches) {
    const key = punchDayKey(punch);
    groups.set(key, [...(groups.get(key) ?? []), punch]);
  }
  groups.forEach((list) => list.sort((a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime()));
  return groups;
};
