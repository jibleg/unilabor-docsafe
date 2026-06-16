import type {
  HelpdeskMaintenanceCatalogs,
  HelpdeskMaintenancePlan,
} from '../types/models';
import type { HelpdeskMaintenancePlanPayload } from '../api/service';

export interface PlanFormState {
  asset_id: string;
  frequency_id: string;
  responsible_employee_id: string;
  title: string;
  description: string;
  provider_name: string;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days: string;
  tolerance_after_days: string;
  checklist_required: boolean;
  evidence_required: boolean;
  tasks_text: string;
}

export interface ChecklistExecutionState {
  plan_task_id?: number | null;
  task_text: string;
  result: string;
  notes: string;
}

export interface OrderExecutionFormState {
  completed_at: string;
  performed_activities: string;
  result: string;
  findings: string;
  provider_name: string;
  evidence_notes: string;
  checklist: ChecklistExecutionState[];
}

export interface RescheduleFormState {
  scheduled_for: string;
  reschedule_reason: string;
}

export const EMPTY_CATALOGS: HelpdeskMaintenanceCatalogs = {
  frequencies: [],
};

export const EMPTY_FORM: PlanFormState = {
  asset_id: '',
  frequency_id: '',
  responsible_employee_id: '',
  title: '',
  description: '',
  provider_name: '',
  starts_on: '',
  next_due_on: '',
  tolerance_before_days: '0',
  tolerance_after_days: '0',
  checklist_required: true,
  evidence_required: true,
  tasks_text: '',
};

export const EMPTY_EXECUTION_FORM: OrderExecutionFormState = {
  completed_at: '',
  performed_activities: '',
  result: 'CONFORME',
  findings: '',
  provider_name: '',
  evidence_notes: '',
  checklist: [],
};

export const EMPTY_RESCHEDULE_FORM: RescheduleFormState = {
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

export const dateValue = (value?: string | null): string => value ? value.slice(0, 10) : '';

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
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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

export const getPlanState = (plan: HelpdeskMaintenancePlan): 'overdue' | 'soon' | 'ok' => {
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

export const toFormState = (plan: HelpdeskMaintenancePlan): PlanFormState => ({
  asset_id: String(plan.asset_id),
  frequency_id: plan.frequency_id ? String(plan.frequency_id) : '',
  responsible_employee_id: plan.responsible_employee_id ? String(plan.responsible_employee_id) : '',
  title: plan.title,
  description: plan.description ?? '',
  provider_name: plan.provider_name ?? '',
  starts_on: dateValue(plan.starts_on),
  next_due_on: dateValue(plan.next_due_on),
  tolerance_before_days: String(plan.tolerance_before_days ?? 0),
  tolerance_after_days: String(plan.tolerance_after_days ?? 0),
  checklist_required: plan.checklist_required,
  evidence_required: plan.evidence_required,
  tasks_text: plan.tasks.map((task) => task.task_text).join('\n'),
});

export const toPayload = (form: PlanFormState): HelpdeskMaintenancePlanPayload => ({
  asset_id: numericOrNull(form.asset_id) ?? 0,
  frequency_id: numericOrNull(form.frequency_id),
  responsible_employee_id: numericOrNull(form.responsible_employee_id),
  title: form.title.trim(),
  description: form.description.trim() || null,
  provider_name: form.provider_name.trim() || null,
  starts_on: form.starts_on,
  next_due_on: form.next_due_on,
  tolerance_before_days: numberOrZero(form.tolerance_before_days),
  tolerance_after_days: numberOrZero(form.tolerance_after_days),
  checklist_required: form.checklist_required,
  evidence_required: form.evidence_required,
  tasks: form.tasks_text
    .split('\n')
    .map((task) => task.trim())
    .filter(Boolean),
});

