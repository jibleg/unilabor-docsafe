import type { CalendarEvent, CalendarEventKind, MaintenanceExecutorKind, MaintenanceProgramSourceKind, MaintenanceServiceKind, RoutineInput } from '../types/helpdesk-program';
import type { HelpdeskMaintenanceFrequency } from '../types/models';

/** Etiquetas, colores y utilidades de fecha del Programa de Mantenimiento. */

export const KIND_LABELS: Record<CalendarEventKind, string> = {
  PREVENTIVE: 'Preventivo',
  VERIFICATION: 'Verificación intermedia',
  ELECTRICAL_SAFETY: 'Seguridad eléctrica',
  OTHER: 'Otro servicio',
  POST_REPAIR_VERIFICATION: 'Verificación post-reparación',
  CALIBRATION: 'Calibración',
  CORRECTIVE: 'Correctivo',
};

export const SERVICE_KIND_OPTIONS: Array<{ value: MaintenanceServiceKind; label: string }> = [
  { value: 'PREVENTIVE', label: 'Mantenimiento preventivo' },
  { value: 'VERIFICATION', label: 'Verificación intermedia' },
  { value: 'ELECTRICAL_SAFETY', label: 'Seguridad eléctrica (IEC 62353)' },
  { value: 'OTHER', label: 'Otro servicio' },
];

export const EXECUTOR_LABELS: Record<MaintenanceExecutorKind, string> = {
  INTERNAL_OPERATOR: 'Operador del equipo',
  INTERNAL_TECH: 'Técnico de Help Desk',
  EXTERNAL_PROVIDER: 'Proveedor externo',
};

export const SOURCE_LABELS: Record<MaintenanceProgramSourceKind, string> = {
  MANUFACTURER_MANUAL: 'Manual del fabricante',
  PROVIDER_PROGRAM: 'Programa del proveedor',
  SERVICE_CONTRACT: 'Contrato de servicio',
  INTERNAL: 'Criterio interno',
};

export const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Programada',
  RESCHEDULED: 'Reprogramada',
  IN_PROGRESS: 'En ejecución',
  PENDING_VALIDATION: 'En validación',
  CLOSED: 'Cerrada',
  OPEN: 'Abierto',
};

/** Paleta por tipo: fondo, borde, texto y punto (Tailwind arbitrary values sobre tokens de marca). */
export const KIND_STYLES: Record<CalendarEventKind, { chip: string; dot: string; bar: string }> = {
  PREVENTIVE: { chip: 'border-[rgba(0,105,166,0.28)] bg-[rgba(191,212,230,0.5)] text-[var(--color-brand-700)]', dot: 'bg-[var(--color-brand-500)]', bar: 'bg-[rgba(0,105,166,0.18)]' },
  VERIFICATION: { chip: 'border-[rgba(13,148,136,0.3)] bg-[rgba(153,246,228,0.35)] text-[#0f5f58]', dot: 'bg-[#0d9488]', bar: 'bg-[rgba(13,148,136,0.16)]' },
  ELECTRICAL_SAFETY: { chip: 'border-[rgba(124,58,237,0.3)] bg-[rgba(221,214,254,0.5)] text-[#4c1d95]', dot: 'bg-[#7c3aed]', bar: 'bg-[rgba(124,58,237,0.15)]' },
  OTHER: { chip: 'border-[rgba(100,116,139,0.3)] bg-[rgba(226,232,240,0.6)] text-[#334155]', dot: 'bg-[#64748b]', bar: 'bg-[rgba(100,116,139,0.15)]' },
  POST_REPAIR_VERIFICATION: { chip: 'border-[rgba(234,88,12,0.35)] bg-[rgba(254,215,170,0.45)] text-[#9a3412]', dot: 'bg-[#ea580c]', bar: 'bg-[rgba(234,88,12,0.16)]' },
  CALIBRATION: { chip: 'border-[rgba(180,120,20,0.35)] bg-[rgba(245,196,110,0.32)] text-[#8a5a12]', dot: 'bg-[#d0952a]', bar: 'bg-[rgba(208,149,42,0.16)]' },
  CORRECTIVE: { chip: 'border-[rgba(190,40,40,0.35)] bg-[rgba(254,202,202,0.45)] text-[#991b1b]', dot: 'bg-[#dc2626]', bar: 'bg-[rgba(220,38,38,0.14)]' },
};

export const CRITICALITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-[rgba(190,40,40,0.12)] text-[#b02a2a]',
  HIGH: 'bg-[rgba(234,88,12,0.12)] text-[#9a3412]',
  MEDIUM: 'bg-[rgba(208,149,42,0.14)] text-[#8a5a12]',
  LOW: 'bg-[rgba(34,139,84,0.12)] text-[#1c7a4a]',
};

export const toIsoDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseIsoDate = (value: string): Date => new Date(`${value.slice(0, 10)}T00:00:00`);

export const addDays = (value: string, days: number): string => {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

export const addMonths = (value: string, months: number): string => {
  const date = parseIsoDate(value);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return toIsoDate(date);
};

export const startOfMonth = (value: string): string => `${value.slice(0, 7)}-01`;
export const endOfMonth = (value: string): string => {
  const date = parseIsoDate(value);
  return toIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
};
export const startOfWeek = (value: string): string => {
  const date = parseIsoDate(value);
  return addDays(value, -date.getDay());
};
export const todayIso = (): string => toIsoDate(new Date());

const capitalizeFirst = (value: string): string => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

export const formatDateLong = (value: string | null | undefined): string =>
  value ? capitalizeFirst(parseIsoDate(value).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : '—';
export const formatDateShort = (value: string | null | undefined): string =>
  value ? parseIsoDate(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const formatDateTime = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const formatMonthTitle = (value: string): string =>
  capitalizeFirst(parseIsoDate(value).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));

export const canRescheduleEvent = (event: CalendarEvent): boolean =>
  event.source === 'maintenance' && (event.status === 'SCHEDULED' || event.status === 'RESCHEDULED');

/** Genera un archivo ICS con los eventos (uno por orden), para Outlook/Google Calendar. */
export const buildIcs = (events: CalendarEvent[], calendarName = 'Programa de Mantenimiento UNILABOR'): string => {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UNILABOR SafeDoc//Programa de Mantenimiento//ES', `X-WR-CALNAME:${esc(calendarName)}`];
  for (const event of events) {
    const date = event.date.replace(/-/g, '');
    const end = addDays(event.date, 1).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@safedoc.unilabor`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(`[${KIND_LABELS[event.kind]}] ${event.asset.asset_code} · ${event.title}`)}`,
      `DESCRIPTION:${esc(
        `${event.code}\nActivo: ${event.asset.asset_code} - ${event.asset.name}\nUnidad/Área: ${event.asset.unit_name ?? '—'} / ${event.asset.area_name ?? '—'}\nResponsable: ${event.asset.responsible_employee_name ?? '—'}\nVentana: ${event.window_starts_on ?? '—'} a ${event.window_ends_on ?? '—'}\nEstado: ${STATUS_LABELS[event.status] ?? event.status}`,
      )}`,
      `CATEGORIES:${esc(KIND_LABELS[event.kind])}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};

export const downloadTextFile = (content: string, filename: string, mime = 'text/calendar'): void => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const eventTooltip = (event: CalendarEvent): string =>
  [
    `${event.code} · ${KIND_LABELS[event.kind]}`,
    `${event.asset.asset_code} — ${event.asset.name}`,
    event.plan_title ? `Rutina: ${event.plan_title}` : null,
    `Estado: ${STATUS_LABELS[event.status] ?? event.status}${event.window_state === 'OVERDUE' ? ' (VENCIDA)' : ''}`,
    event.window_starts_on || event.window_ends_on ? `Ventana: ${formatDateShort(event.window_starts_on)} → ${formatDateShort(event.window_ends_on)}` : null,
    event.asset.responsible_employee_name ? `Responsable: ${event.asset.responsible_employee_name}` : null,
  ]
    .filter(Boolean)
    .join('\n');

export interface RoutineDraft extends RoutineInput {
  _key: string;
}

export const newRoutineDraft = (partial: Partial<RoutineInput> = {}): RoutineDraft => ({
  _key: `r-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
  service_kind: 'PREVENTIVE',
  title: '',
  description: null,
  schedule_mode: 'FREQUENCY',
  frequency_id: null,
  custom_interval_value: null,
  custom_interval_unit: null,
  anchor_mode: 'FIXED',
  starts_on: todayIso(),
  next_due_on: todayIso(),
  tolerance_before_days: 0,
  tolerance_after_days: 7,
  recurrence_end_on: null,
  recurrence_max_occurrences: null,
  executor_kind: 'INTERNAL_TECH',
  supplier_id: null,
  responsible_employee_id: null,
  checklist_required: true,
  evidence_required: true,
  deviates_from_template: false,
  deviation_reason: null,
  tasks: [],
  ...partial,
});

export const describeDraftInterval = (draft: RoutineInput, frequencies: HelpdeskMaintenanceFrequency[]): string => {
  if (draft.schedule_mode === 'CALENDAR') return 'Cronograma provisto';
  if (draft.custom_interval_value && draft.custom_interval_unit) {
    const unit = draft.custom_interval_unit === 'DAY' ? 'día(s)' : draft.custom_interval_unit === 'WEEK' ? 'semana(s)' : 'mes(es)';
    return `Cada ${draft.custom_interval_value} ${unit}`;
  }
  const frequency = frequencies.find((f) => f.id === draft.frequency_id);
  return frequency ? frequency.name : 'Sin frecuencia';
};

/** Quita la clave interna de UI antes de enviar la rutina al backend. */
export const stripDraftKey = (draft: RoutineDraft): RoutineInput => {
  const copy: Partial<RoutineDraft> = { ...draft };
  delete copy._key;
  return copy as RoutineInput;
};
