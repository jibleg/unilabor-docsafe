import type {
  HelpdeskCalibrationCatalogs,
  HelpdeskCalibrationPlan,
  HelpdeskScheduleMode,
} from '../types/models';
import type { HelpdeskCalibrationPlanPayload } from '../api/service';

export interface CalibrationPlanFormState {
  asset_id: string;
  frequency_id: string;
  schedule_mode: HelpdeskScheduleMode;
  responsible_employee_id: string;
  title: string;
  description: string;
  provider_name: string;
  standard_ref: string;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days: string;
  tolerance_after_days: string;
  certificate_required: boolean;
  evidence_required: boolean;
}

export interface CalibrationExecutionFormState {
  completed_at: string;
  result: string;
  certificate_no: string;
  calibration_due_on: string;
  findings: string;
  provider_name: string;
  evidence_notes: string;
}

export interface CalibrationRescheduleFormState {
  scheduled_for: string;
  reschedule_reason: string;
}

export const EMPTY_CALIBRATION_CATALOGS: HelpdeskCalibrationCatalogs = {
  frequencies: [],
};

export const EMPTY_CALIBRATION_FORM: CalibrationPlanFormState = {
  asset_id: '',
  frequency_id: '',
  schedule_mode: 'FREQUENCY',
  responsible_employee_id: '',
  title: '',
  description: '',
  provider_name: '',
  standard_ref: '',
  starts_on: '',
  next_due_on: '',
  tolerance_before_days: '0',
  tolerance_after_days: '0',
  certificate_required: true,
  evidence_required: true,
};

export const EMPTY_CALIBRATION_EXECUTION_FORM: CalibrationExecutionFormState = {
  completed_at: '',
  result: 'APROBADA',
  certificate_no: '',
  calibration_due_on: '',
  findings: '',
  provider_name: '',
  evidence_notes: '',
};

export const EMPTY_CALIBRATION_RESCHEDULE_FORM: CalibrationRescheduleFormState = {
  scheduled_for: '',
  reschedule_reason: '',
};

export const numericOrNull = (value: string): number | null => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

export const numberOrZero = (value: string): number => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
};

export const dateValue = (value?: string | null): string => (value ? value.slice(0, 10) : '');

export const formatDate = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
};

export const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export const nowInputValue = (): string => new Date().toISOString().slice(0, 16);

export const orderStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    SCHEDULED: 'Programada',
    RESCHEDULED: 'Reprogramada',
    IN_PROGRESS: 'En proceso',
    CLOSED: 'Cerrada',
  };
  return labels[status] ?? status;
};

export const scheduleModeLabel = (mode: HelpdeskScheduleMode): string =>
  mode === 'CALENDAR' ? 'Calendario provisto' : 'Por frecuencia';

export const getPlanState = (plan: HelpdeskCalibrationPlan): 'overdue' | 'soon' | 'ok' => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${plan.next_due_on.slice(0, 10)}T00:00:00`);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return 'overdue';
  }
  if (diffDays <= 30) {
    return 'soon';
  }
  return 'ok';
};

export const stateLabel = (state: 'overdue' | 'soon' | 'ok'): string => {
  if (state === 'overdue') {
    return 'Vencido';
  }
  if (state === 'soon') {
    return 'Proximo';
  }
  return 'Vigente';
};

export const toCalibrationFormState = (plan: HelpdeskCalibrationPlan): CalibrationPlanFormState => ({
  asset_id: String(plan.asset_id),
  frequency_id: plan.frequency_id ? String(plan.frequency_id) : '',
  schedule_mode: plan.schedule_mode,
  responsible_employee_id: plan.responsible_employee_id ? String(plan.responsible_employee_id) : '',
  title: plan.title,
  description: plan.description ?? '',
  provider_name: plan.provider_name ?? '',
  standard_ref: plan.standard_ref ?? '',
  starts_on: dateValue(plan.starts_on),
  next_due_on: dateValue(plan.next_due_on),
  tolerance_before_days: String(plan.tolerance_before_days ?? 0),
  tolerance_after_days: String(plan.tolerance_after_days ?? 0),
  certificate_required: plan.certificate_required,
  evidence_required: plan.evidence_required,
});

export const toCalibrationPayload = (form: CalibrationPlanFormState): HelpdeskCalibrationPlanPayload => ({
  asset_id: numericOrNull(form.asset_id) ?? 0,
  frequency_id: numericOrNull(form.frequency_id),
  schedule_mode: form.schedule_mode,
  responsible_employee_id: numericOrNull(form.responsible_employee_id),
  title: form.title.trim(),
  description: form.description.trim() || null,
  provider_name: form.provider_name.trim() || null,
  standard_ref: form.standard_ref.trim() || null,
  starts_on: form.starts_on,
  next_due_on: form.next_due_on,
  tolerance_before_days: numberOrZero(form.tolerance_before_days),
  tolerance_after_days: numberOrZero(form.tolerance_after_days),
  certificate_required: form.certificate_required,
  evidence_required: form.evidence_required,
});
