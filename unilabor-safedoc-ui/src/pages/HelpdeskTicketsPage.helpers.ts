import type {
  HelpdeskCatalogItem,
  HelpdeskTicket,
  HelpdeskTicketCatalogs,
  HelpdeskTicketPriority,
  HelpdeskTicketStats,
  HelpdeskTicketStatus,
} from '../types/models';
import type { HelpdeskTicketPayload } from '../api/service';

export const EMPTY_TICKET_STATS: HelpdeskTicketStats = {
  total: 0,
  open: 0,
  critical: 0,
  affects_results: 0,
};

// Grafo de transiciones de trabajo permitidas (espejo de
// helpdesk-ticket.shared.ts en el backend, que es la fuente de verdad y
// vuelve a validar cada transicion). Solo sirve para habilitar/deshabilitar
// botones en la UI; mantener en sync.
export const TICKET_WORKING_STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['IN_REVIEW', 'ASSIGNED'],
  IN_REVIEW: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_PARTS', 'WAITING_PROVIDER'],
  WAITING_PARTS: ['IN_PROGRESS'],
  WAITING_PROVIDER: ['IN_PROGRESS'],
};

export const TICKET_TERMINAL_STATUS_CODES = ['CLOSED', 'CANCELLED'];

export const REQUEST_CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'PORTAL', label: 'Portal de autoservicio' },
  { value: 'PHONE', label: 'Llamada telefonica' },
  { value: 'EMAIL', label: 'Correo electrónico' },
  { value: 'IN_PERSON', label: 'Presencial' },
];

export const SUPPORT_CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ON_SITE', label: 'Atención en sitio' },
  { value: 'REMOTE_PHONE', label: 'Asistencia telefónica del proveedor' },
  { value: 'REMOTE_OTHER', label: 'Remota (otro medio)' },
];

export interface TicketFormState {
  asset_id: string;
  request_type_id: string;
  status_id: string;
  priority_id: string;
  requester_employee_id: string;
  assigned_employee_id: string;
  title: string;
  description: string;
  operational_impact: string;
  affects_results: boolean;
  due_at: string;
  request_channel: string;
}

export interface SolutionFormState {
  solved_at: string;
  solution_summary: string;
  equipment_status_after_solution_id: string;
  support_channel: string;
  provider_name: string;
  provider_contact: string;
  onsite_responsible_employee_id: string;
  call_at: string;
}

export interface AssignFormState {
  assigned_employee_id: string;
}

export interface CloseFormState {
  closure_notes: string;
  closer_signature: string | null;
}

export interface CancelFormState {
  cancellation_reason: string;
}

export interface ReturnFormState {
  return_to_operation_at: string;
  equipment_status_after_solution_id: string;
}

export interface IsoRiskFormState {
  risk_level: string;
  impact_evaluation: string;
  recent_analysis_usage: string;
  alternate_equipment_used: boolean;
  alternate_equipment_notes: string;
  corrective_action_required: boolean;
  corrective_action_notes: string;
  technical_release_required: boolean;
  operational_lock: boolean;
}

export interface TechnicalReleaseFormState {
  technical_release_summary: string;
  equipment_status_after_solution_id: string;
}

export const EMPTY_CATALOGS: HelpdeskTicketCatalogs = {
  request_types: [],
  ticket_statuses: [],
  ticket_priorities: [],
};

export const EMPTY_FORM: TicketFormState = {
  asset_id: '',
  request_type_id: '',
  status_id: '',
  priority_id: '',
  requester_employee_id: '',
  assigned_employee_id: '',
  title: '',
  description: '',
  operational_impact: '',
  affects_results: false,
  due_at: '',
  request_channel: 'PORTAL',
};

export const EMPTY_SOLUTION_FORM: SolutionFormState = {
  solved_at: '',
  solution_summary: '',
  equipment_status_after_solution_id: '',
  support_channel: 'ON_SITE',
  provider_name: '',
  provider_contact: '',
  onsite_responsible_employee_id: '',
  call_at: '',
};

export const EMPTY_ASSIGN_FORM: AssignFormState = {
  assigned_employee_id: '',
};

export const EMPTY_CLOSE_FORM: CloseFormState = {
  closure_notes: '',
  closer_signature: null,
};

export const EMPTY_CANCEL_FORM: CancelFormState = {
  cancellation_reason: '',
};

export const EMPTY_RETURN_FORM: ReturnFormState = {
  return_to_operation_at: '',
  equipment_status_after_solution_id: '',
};

export const EMPTY_ISO_RISK_FORM: IsoRiskFormState = {
  risk_level: 'LOW',
  impact_evaluation: '',
  recent_analysis_usage: '',
  alternate_equipment_used: false,
  alternate_equipment_notes: '',
  corrective_action_required: false,
  corrective_action_notes: '',
  technical_release_required: false,
  operational_lock: false,
};

export const EMPTY_TECHNICAL_RELEASE_FORM: TechnicalReleaseFormState = {
  technical_release_summary: '',
  equipment_status_after_solution_id: '',
};

export const numericOrNull = (value: string): number | null => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

export const catalogName = (item?: HelpdeskCatalogItem | null): string => item?.name ?? 'Sin clasificar';
export const statusName = (item?: HelpdeskTicketStatus | null): string => item?.name ?? 'Sin estado';
export const priorityName = (item?: HelpdeskTicketPriority | null): string => item?.name ?? 'Sin prioridad';

export const riskLabel = (risk?: string | null): string => {
  const labels: Record<string, string> = {
    NOT_EVALUATED: 'No evaluado',
    LOW: 'Bajo',
    MEDIUM: 'Medio',
    HIGH: 'Alto',
    CRITICAL: 'Critico',
  };

  return labels[risk ?? 'NOT_EVALUATED'] ?? risk ?? 'No evaluado';
};

export const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export const formatDowntime = (minutes?: number | null): string => {
  if (!minutes || minutes <= 0) {
    return 'Sin calcular';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours <= 0) {
    return `${remainingMinutes} min`;
  }

  return `${hours} h ${remainingMinutes} min`;
};

export const toFormState = (ticket: HelpdeskTicket): TicketFormState => ({
  asset_id: ticket.asset_id ? String(ticket.asset_id) : '',
  request_type_id: ticket.request_type_id ? String(ticket.request_type_id) : '',
  status_id: ticket.status_id ? String(ticket.status_id) : '',
  priority_id: ticket.priority_id ? String(ticket.priority_id) : '',
  requester_employee_id: ticket.requester_employee_id ? String(ticket.requester_employee_id) : '',
  assigned_employee_id: ticket.assigned_employee_id ? String(ticket.assigned_employee_id) : '',
  title: ticket.title,
  description: ticket.description,
  operational_impact: ticket.operational_impact ?? '',
  affects_results: ticket.affects_results,
  due_at: ticket.due_at ? ticket.due_at.slice(0, 16) : '',
  request_channel: ticket.request_channel ?? 'PORTAL',
});

export const toPayload = (form: TicketFormState): HelpdeskTicketPayload => ({
  asset_id: numericOrNull(form.asset_id),
  request_type_id: numericOrNull(form.request_type_id),
  status_id: numericOrNull(form.status_id),
  priority_id: numericOrNull(form.priority_id),
  requester_employee_id: numericOrNull(form.requester_employee_id),
  assigned_employee_id: numericOrNull(form.assigned_employee_id),
  title: form.title.trim(),
  description: form.description.trim(),
  operational_impact: form.operational_impact.trim() || null,
  affects_results: form.affects_results,
  due_at: form.due_at || null,
  request_channel: form.request_channel,
});
