import type { Incident, IncidentStatus } from '../../../api/service.api-attendance-incidents';

/** Helpers puros de Incidencias (presentacion y validacion de formulario). */

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  captured: 'Por autorizar',
  authorized: 'Autorizada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

export const STATUS_BADGE_CLASS: Record<IncidentStatus, string> = {
  captured: 'badge-warning',
  authorized: 'badge-success',
  rejected: 'badge-error',
  cancelled: 'badge-ghost opacity-70',
};

/** Opciones del filtro de estado (valor de la URL -> etiqueta). */
export const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'captured', label: 'Por autorizar' },
  { value: 'authorized', label: 'Autorizadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 3;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Duracion legible: "4 días", "1 día", "2.5 h" o "—". */
export const formatIncidentDuration = (incident: Pick<Incident, 'days' | 'hours'>): string => {
  if (incident.hours !== null && incident.hours !== undefined) {
    return `${Number(incident.hours)} h`;
  }
  if (incident.days !== null && incident.days !== undefined) {
    const days = Number(incident.days);
    return `${days} ${days === 1 ? 'día' : 'días'}`;
  }
  return '—';
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Separa archivos validos de rechazados (tipo o tamano) con el motivo de cada rechazo. */
export const validateFiles = (files: File[]): { accepted: File[]; rejected: string[] } => {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (!ALLOWED_MIME.includes(file.type)) {
      rejected.push(`${file.name}: solo JPG, PNG, WebP o PDF.`);
    } else if (file.size > MAX_ATTACHMENT_BYTES) {
      rejected.push(`${file.name}: supera 5 MB.`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
};

export interface IncidentFormValues {
  employeeId: string;
  typeId: string;
  startDate: string;
  endDate: string;
  hours: string;
  reason: string;
  imssFolio: string;
}

export interface IncidentFormContext {
  isHourly: boolean;
  requiresAttachment: boolean;
  fileCount: number;
}

/** Devuelve el primer mensaje de error del formulario o null si es valido. */
export const validateIncidentForm = (values: IncidentFormValues, context: IncidentFormContext): string | null => {
  if (!values.employeeId) return 'Elige al colaborador.';
  if (!values.typeId) return 'Elige el tipo de incidencia.';
  if (!values.startDate) return context.isHourly ? 'Indica la fecha.' : 'Indica la fecha de inicio.';
  if (context.isHourly) {
    const hours = Number(values.hours);
    if (!values.hours || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
      return 'Las horas deben ser mayores a 0 y hasta 24.';
    }
  } else if (values.endDate && values.endDate < values.startDate) {
    return 'La fecha final no puede ser anterior a la inicial.';
  }
  if (context.requiresAttachment && context.fileCount === 0) {
    return 'Este tipo exige comprobante; adjunta al menos un archivo (o captura sin autorizar y agrégalo después).';
  }
  return null;
};

export interface IncidentActions {
  canAuthorize: boolean;
  canReject: boolean;
  canCancel: boolean;
}

/** Transiciones permitidas: captured -> authorized|rejected|cancelled; authorized -> rejected|cancelled. */
export const availableActions = (status: IncidentStatus): IncidentActions => ({
  canAuthorize: status === 'captured',
  canReject: status === 'captured' || status === 'authorized',
  canCancel: status === 'captured' || status === 'authorized',
});

/** Rango por defecto de la pantalla: hoy-30 a hoy+60. */
export const defaultRange = (today: string, addDays: (date: string, days: number) => string) => ({
  from: addDays(today, -30),
  to: addDays(today, 60),
});
