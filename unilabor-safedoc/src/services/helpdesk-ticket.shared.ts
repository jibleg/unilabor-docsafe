import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import type { Queryable } from '../utils/transaction';
import { getEmployeeByUserId } from './employee.service';
import type { HelpdeskCatalogItem } from './helpdesk-asset.service';

export interface HelpdeskTicketPayload {
  asset_id?: number | null;
  request_type_id?: number | null;
  status_id?: number | null;
  priority_id?: number | null;
  requester_employee_id?: number | null;
  assigned_employee_id?: number | null;
  title: string;
  description: string;
  operational_impact?: string | null;
  affects_results?: boolean;
  due_at?: string | null;
  request_channel?: string | null;
}

// Bitacora de llamada obligatoria cuando support_channel = 'REMOTE_PHONE': el
// area usuaria levanta el soporte por telefono y el proveedor asesora al
// responsable tecnico in situ tambien por telefono, sin documento de
// evidencia posible. Estos campos sustituyen esa evidencia.
export interface HelpdeskTicketSolutionPayload {
  solved_at: string;
  solution_summary: string;
  equipment_status_after_solution_id?: number | null;
  support_channel?: string | null;
  // provider_id apunta al catalogo real de proveedores (helpdesk_suppliers,
  // el mismo que usa Activos/Proveedores); provider_name se conserva solo
  // como snapshot de solo lectura, resuelto por el backend desde provider_id.
  provider_id?: number | null;
  provider_name?: string | null;
  provider_contact?: string | null;
  onsite_responsible_employee_id?: number | null;
  call_at?: string | null;
}

export interface HelpdeskTicketReturnPayload {
  return_to_operation_at: string;
  equipment_status_after_solution_id?: number | null;
}

export interface HelpdeskTicketAssignPayload {
  assigned_employee_id: number;
}

export interface HelpdeskTicketStatusChangePayload {
  status_code: string;
}

export interface HelpdeskTicketClosePayload {
  closure_notes: string;
  closer_signature: string;
}

export interface HelpdeskTicketConfirmFunctionalityPayload {
  requester_signature: string;
}

export interface HelpdeskTicketCancelPayload {
  cancellation_reason: string;
}

export interface HelpdeskTicketIsoRiskPayload {
  risk_level: string;
  impact_evaluation: string;
  recent_analysis_usage?: string | null;
  alternate_equipment_used?: boolean;
  alternate_equipment_notes?: string | null;
  corrective_action_required?: boolean;
  corrective_action_notes?: string | null;
  technical_release_required?: boolean;
  quality_document_id?: string | null;
  operational_lock?: boolean | undefined;
}

export interface HelpdeskTicketTechnicalReleasePayload {
  technical_release_summary: string;
  equipment_status_after_solution_id?: number | null;
}

export interface HelpdeskTicketCommentRecord {
  id: number;
  ticket_id: number;
  comment: string;
  is_internal: boolean;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at?: string | undefined;
}

export interface HelpdeskTicketRecord extends HelpdeskTicketPayload {
  id: number;
  ticket_code: string;
  requester_user_id: string | null;
  assigned_user_id: string | null;
  reported_at: string;
  solved_at?: string | null;
  solution_summary?: string | null;
  return_to_operation_at?: string | null;
  validated_by_user_id?: string | null;
  validated_at?: string | null;
  downtime_minutes?: number | null;
  equipment_status_after_solution_id?: number | null;
  risk_level?: string;
  impact_evaluation?: string | null;
  recent_analysis_usage?: string | null;
  alternate_equipment_used?: boolean;
  alternate_equipment_notes?: string | null;
  corrective_action_required?: boolean;
  corrective_action_notes?: string | null;
  impact_evaluated_by_user_id?: string | null;
  impact_evaluated_at?: string | null;
  technical_release_required?: boolean;
  technical_release_summary?: string | null;
  technical_released_by_user_id?: string | null;
  technical_released_at?: string | null;
  quality_document_id?: string | null;
  operational_lock?: boolean;
  support_channel?: string | null;
  provider_id?: number | null;
  provider_name?: string | null;
  provider_contact?: string | null;
  onsite_responsible_employee_id?: number | null;
  call_at?: string | null;
  closed_at?: string | null;
  closed_by_user_id?: string | null;
  closure_notes?: string | null;
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
  cancellation_reason?: string | null;
  is_active: boolean;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  onsite_responsible_employee?: {
    id: number;
    employee_code: string;
    full_name: string;
    area: string | null;
    position: string | null;
  } | null;
  asset?: {
    id: number;
    asset_code: string;
    name: string;
    operational_status_name: string | null;
  } | null;
  request_type?: HelpdeskCatalogItem | null;
  status?: (HelpdeskCatalogItem & { is_closed?: boolean }) | null;
  priority?: (HelpdeskCatalogItem & { response_hours?: number | null }) | null;
  equipment_status_after_solution?: HelpdeskCatalogItem | null;
  requester_employee?: {
    id: number;
    employee_code: string;
    full_name: string;
    area: string | null;
    position: string | null;
  } | null;
  assigned_employee?: {
    id: number;
    employee_code: string;
    full_name: string;
    area: string | null;
    position: string | null;
  } | null;
  comments?: HelpdeskTicketCommentRecord[];
}

export interface HelpdeskTicketCatalogs {
  request_types: HelpdeskCatalogItem[];
  ticket_statuses: (HelpdeskCatalogItem & { is_closed: boolean })[];
  ticket_priorities: (HelpdeskCatalogItem & { response_hours: number | null })[];
}

export interface HelpdeskDashboardMetrics {
  tickets: {
    total: number;
    open: number;
    critical: number;
    overdue: number;
    solved: number;
    affects_results: number;
    risk_pending_release: number;
    avg_solution_hours: number | null;
    avg_downtime_hours: number | null;
  };
  maintenance: {
    scheduled: number;
    in_progress: number;
    overdue: number;
    closed: number;
    compliance_percent: number;
  };
  availability: Array<{
    code: string;
    name: string;
    total: number;
  }>;
  recurrences: Array<{
    asset_id: number;
    asset_code: string;
    asset_name: string;
    ticket_count: number;
  }>;
  by_area: Array<{
    area: string;
    ticket_count: number;
    maintenance_count: number;
  }>;
  audit_items: Array<{
    kind: string;
    code: string;
    asset_code: string | null;
    asset_name: string | null;
    status: string;
    risk_level: string | null;
    event_at: string;
    owner: string | null;
  }>;
}

export const getRequiredEmployeeByUserId = async (userId: string) => {
  const employee = await getEmployeeByUserId(userId);
  if (!employee) {
    const error = new Error('HELPDESK_EMPLOYEE_PROFILE_NOT_FOUND');
    (error as any).code = 'HELPDESK_EMPLOYEE_PROFILE_NOT_FOUND';
    throw error;
  }

  return employee;
};

export const ticketsTableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.helpdesk_tickets') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

export const tableExists = async (tableName: string): Promise<boolean> => {
  const result = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists;', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.exists);
};

export const assertTicketsTable = async () => {
  const exists = await ticketsTableExists();
  if (!exists) {
    const error = new Error('HELPDESK_TICKETS_TABLE_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_TICKETS_TABLE_NOT_AVAILABLE';
    throw error;
  }
};

export const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

export const mapCatalog = (
  id: unknown,
  name: unknown,
  code?: unknown,
  description?: unknown,
): HelpdeskCatalogItem | null => {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0 || typeof name !== 'string') {
    return null;
  }

  return {
    id: numericId,
    code: typeof code === 'string' ? code : undefined,
    name,
    description: typeof description === 'string' ? description : null,
    is_active: true,
  };
};

export const mapOptionalEmployee = (row: any, idKey: string, aliasPrefix: string) => {
  const id = Number(row[idKey]);
  const fullName = row[`${aliasPrefix}_name`];

  if (!Number.isFinite(id) || id <= 0 || typeof fullName !== 'string') {
    return null;
  }

  return {
    id,
    employee_code: String(row[`${aliasPrefix}_code`] ?? ''),
    full_name: fullName,
    area: row[`${aliasPrefix}_area`] ? String(row[`${aliasPrefix}_area`]) : null,
    position: row[`${aliasPrefix}_position`] ? String(row[`${aliasPrefix}_position`]) : null,
  };
};

export const mapEmployee = (row: any, prefix: 'requester' | 'assigned') => {
  const id = Number(row[`${prefix}_employee_id`]);
  const fullName = row[`${prefix}_employee_name`];

  if (!Number.isFinite(id) || id <= 0 || typeof fullName !== 'string') {
    return null;
  }

  return {
    id,
    employee_code: String(row[`${prefix}_employee_code`] ?? ''),
    full_name: fullName,
    area: row[`${prefix}_employee_area`] ? String(row[`${prefix}_employee_area`]) : null,
    position: row[`${prefix}_employee_position`] ? String(row[`${prefix}_employee_position`]) : null,
  };
};

export const mapTicketRow = (row: any): HelpdeskTicketRecord => ({
  id: Number(row.id),
  ticket_code: String(row.ticket_code),
  asset_id: row.asset_id ? Number(row.asset_id) : null,
  request_type_id: row.request_type_id ? Number(row.request_type_id) : null,
  status_id: row.status_id ? Number(row.status_id) : null,
  priority_id: row.priority_id ? Number(row.priority_id) : null,
  requester_user_id: row.requester_user_id ? String(row.requester_user_id) : null,
  requester_employee_id: row.requester_employee_id ? Number(row.requester_employee_id) : null,
  assigned_user_id: row.assigned_user_id ? String(row.assigned_user_id) : null,
  assigned_employee_id: row.assigned_employee_id ? Number(row.assigned_employee_id) : null,
  title: String(row.title),
  description: String(row.description),
  operational_impact: row.operational_impact ? String(row.operational_impact) : null,
  affects_results: Boolean(row.affects_results),
  reported_at: row.reported_at ? toIsoDateTime(row.reported_at) : '',
  due_at: row.due_at ? toIsoDateTime(row.due_at) : null,
  solved_at: row.solved_at ? toIsoDateTime(row.solved_at) : null,
  solution_summary: row.solution_summary ? String(row.solution_summary) : null,
  return_to_operation_at: row.return_to_operation_at ? toIsoDateTime(row.return_to_operation_at) : null,
  validated_by_user_id: row.validated_by_user_id ? String(row.validated_by_user_id) : null,
  validated_at: row.validated_at ? toIsoDateTime(row.validated_at) : null,
  downtime_minutes: row.downtime_minutes ? Number(row.downtime_minutes) : null,
  equipment_status_after_solution_id: row.equipment_status_after_solution_id
    ? Number(row.equipment_status_after_solution_id)
    : null,
  risk_level: row.risk_level ? String(row.risk_level) : 'NOT_EVALUATED',
  impact_evaluation: row.impact_evaluation ? String(row.impact_evaluation) : null,
  recent_analysis_usage: row.recent_analysis_usage ? String(row.recent_analysis_usage) : null,
  alternate_equipment_used: Boolean(row.alternate_equipment_used),
  alternate_equipment_notes: row.alternate_equipment_notes ? String(row.alternate_equipment_notes) : null,
  corrective_action_required: Boolean(row.corrective_action_required),
  corrective_action_notes: row.corrective_action_notes ? String(row.corrective_action_notes) : null,
  impact_evaluated_by_user_id: row.impact_evaluated_by_user_id ? String(row.impact_evaluated_by_user_id) : null,
  impact_evaluated_at: row.impact_evaluated_at ? toIsoDateTime(row.impact_evaluated_at) : null,
  technical_release_required: Boolean(row.technical_release_required),
  technical_release_summary: row.technical_release_summary ? String(row.technical_release_summary) : null,
  technical_released_by_user_id: row.technical_released_by_user_id ? String(row.technical_released_by_user_id) : null,
  technical_released_at: row.technical_released_at ? toIsoDateTime(row.technical_released_at) : null,
  quality_document_id: row.quality_document_id ? String(row.quality_document_id) : null,
  operational_lock: Boolean(row.operational_lock),
  request_channel: row.request_channel ? String(row.request_channel) : 'PORTAL',
  support_channel: row.support_channel ? String(row.support_channel) : null,
  provider_id: row.provider_id ? Number(row.provider_id) : null,
  provider_name: row.provider_name ? String(row.provider_name) : null,
  provider_contact: row.provider_contact ? String(row.provider_contact) : null,
  onsite_responsible_employee_id: row.onsite_responsible_employee_id ? Number(row.onsite_responsible_employee_id) : null,
  call_at: row.call_at ? toIsoDateTime(row.call_at) : null,
  closed_at: row.closed_at ? toIsoDateTime(row.closed_at) : null,
  closed_by_user_id: row.closed_by_user_id ? String(row.closed_by_user_id) : null,
  closure_notes: row.closure_notes ? String(row.closure_notes) : null,
  cancelled_at: row.cancelled_at ? toIsoDateTime(row.cancelled_at) : null,
  cancelled_by_user_id: row.cancelled_by_user_id ? String(row.cancelled_by_user_id) : null,
  cancellation_reason: row.cancellation_reason ? String(row.cancellation_reason) : null,
  is_active: Boolean(row.is_active),
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
  updated_at: row.updated_at ? toIsoDateTime(row.updated_at) : undefined,
  onsite_responsible_employee: mapOptionalEmployee(row, 'onsite_responsible_employee_id', 'onsite_responsible_employee'),
  asset: row.asset_id
    ? {
        id: Number(row.asset_id),
        asset_code: String(row.asset_code ?? ''),
        name: String(row.asset_name ?? ''),
        operational_status_name: row.asset_operational_status_name
          ? String(row.asset_operational_status_name)
          : null,
      }
    : null,
  request_type: mapCatalog(row.request_type_id, row.request_type_name, row.request_type_code, row.request_type_description),
  status: row.status_id
    ? {
        ...mapCatalog(row.status_id, row.status_name, row.status_code, row.status_description)!,
        is_closed: Boolean(row.status_is_closed),
      }
    : null,
  priority: row.priority_id
    ? {
        ...mapCatalog(row.priority_id, row.priority_name, row.priority_code, row.priority_description)!,
        response_hours: row.priority_response_hours ? Number(row.priority_response_hours) : null,
      }
    : null,
  equipment_status_after_solution: mapCatalog(
    row.equipment_status_after_solution_id,
    row.equipment_status_after_solution_name,
    row.equipment_status_after_solution_code,
    row.equipment_status_after_solution_description,
  ),
  requester_employee: mapEmployee(row, 'requester'),
  assigned_employee: mapEmployee(row, 'assigned'),
});

export const buildTicketQuery = () => `
  SELECT
    t.*,
    a.asset_code,
    a.name AS asset_name,
    aos.name AS asset_operational_status_name,
    rt.code AS request_type_code,
    rt.name AS request_type_name,
    rt.description AS request_type_description,
    ts.code AS status_code,
    ts.name AS status_name,
    ts.description AS status_description,
    ts.is_closed AS status_is_closed,
    tp.code AS priority_code,
    tp.name AS priority_name,
    tp.description AS priority_description,
    tp.response_hours AS priority_response_hours,
    esas.code AS equipment_status_after_solution_code,
    esas.name AS equipment_status_after_solution_name,
    esas.description AS equipment_status_after_solution_description,
    re.employee_code AS requester_employee_code,
    re.full_name AS requester_employee_name,
    re.area AS requester_employee_area,
    re.position AS requester_employee_position,
    ae.employee_code AS assigned_employee_code,
    ae.full_name AS assigned_employee_name,
    ae.area AS assigned_employee_area,
    ae.position AS assigned_employee_position,
    oe.employee_code AS onsite_responsible_employee_code,
    oe.full_name AS onsite_responsible_employee_name,
    oe.area AS onsite_responsible_employee_area,
    oe.position AS onsite_responsible_employee_position
  FROM public.helpdesk_tickets t
  LEFT JOIN public.helpdesk_assets a ON a.id = t.asset_id
  LEFT JOIN public.helpdesk_operational_statuses aos ON aos.id = a.operational_status_id
  LEFT JOIN public.helpdesk_request_types rt ON rt.id = t.request_type_id
  LEFT JOIN public.helpdesk_ticket_statuses ts ON ts.id = t.status_id
  LEFT JOIN public.helpdesk_ticket_priorities tp ON tp.id = t.priority_id
  LEFT JOIN public.helpdesk_operational_statuses esas ON esas.id = t.equipment_status_after_solution_id
  LEFT JOIN public.employees re ON re.id = t.requester_employee_id
  LEFT JOIN public.employees ae ON ae.id = t.assigned_employee_id
  LEFT JOIN public.employees oe ON oe.id = t.onsite_responsible_employee_id
`;

export const getDefaultStatusId = async (): Promise<number | null> => {
  const result = await pool.query(`
    SELECT id FROM public.helpdesk_ticket_statuses WHERE UPPER(code) = 'NEW' LIMIT 1;
  `);

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

export const getOperationalStatusId = async (code: string): Promise<number | null> => {
  const result = await pool.query(
    `
      SELECT id
      FROM public.helpdesk_operational_statuses
      WHERE UPPER(code) = UPPER($1)
      LIMIT 1;
    `,
    [code],
  );

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

export const getDefaultPriorityId = async (): Promise<number | null> => {
  const result = await pool.query(`
    SELECT id FROM public.helpdesk_ticket_priorities WHERE UPPER(code) = 'MEDIUM' LIMIT 1;
  `);

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

/**
 * Resuelve el `due_at` (SLA) de un ticket. Si el cliente envia un valor explicito
 * se respeta; si no, se deriva de `now + priority.response_hours`. Si la prioridad
 * no define horas de respuesta, devuelve null (ticket sin SLA).
 */
export const resolveTicketDueAt = async (
  priorityId: number | null | undefined,
  providedDueAt?: string | null,
): Promise<string | null> => {
  const provided = normalizeOptionalText(providedDueAt ?? null);
  if (provided) {
    return provided;
  }
  if (!priorityId) {
    return null;
  }

  const result = await pool.query(
    `SELECT response_hours FROM public.helpdesk_ticket_priorities WHERE id = $1 LIMIT 1;`,
    [priorityId],
  );
  const hours = Number(result.rows[0]?.response_hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return null;
  }

  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
};

export const getTicketStatusId = async (code: string): Promise<number | null> => {
  const result = await pool.query(
    `
      SELECT id
      FROM public.helpdesk_ticket_statuses
      WHERE UPPER(code) = UPPER($1)
      LIMIT 1;
    `,
    [code],
  );

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

export const calculateDowntimeMinutes = (reportedAt: string, returnAt: string): number | null => {
  const start = new Date(reportedAt).getTime();
  const end = new Date(returnAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return Math.round((end - start) / 60000);
};

export const updateAssetStatusAndHistory = async (
  assetId: number | null | undefined,
  statusId: number | null | undefined,
  ticketId: number,
  summary: string,
  userId?: string | null,
  executor: Queryable = pool,
) => {
  if (!assetId || !statusId) {
    return;
  }

  await executor.query(
    `
      UPDATE public.helpdesk_assets
      SET operational_status_id = $1, updated_by_user_id = $2, updated_at = NOW()
      WHERE id = $3;
    `,
    [statusId, userId ?? null, assetId],
  );

  await executor.query(
    `
      INSERT INTO public.helpdesk_asset_history (
        asset_id,
        action,
        summary,
        new_values,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5);
    `,
    [
      assetId,
      'TICKET_STATUS_CHANGE',
      summary,
      JSON.stringify({
        ticket_id: ticketId,
        operational_status_id: statusId,
      }),
      userId ?? null,
    ],
  );
};

export const generateTicketCode = async (): Promise<string> => {
  // nextval es atomico: no colisiona aunque dos solicitudes lleguen a la vez.
  const result = await pool.query(`SELECT nextval('public.helpdesk_ticket_code_seq') AS next_id;`);
  const nextId = Number(result.rows[0]?.next_id ?? 0);
  return `HD-${String(nextId).padStart(6, '0')}`;
};

// Grafo de transiciones permitidas entre los estados "de trabajo" de un ticket
// (antes del PATCH generico, cualquier status_id era valido). SOLVED/VALIDATED
// se alcanzan solo via /solve y /validate-return (con sus propias reglas de
// negocio); CLOSED/CANCELLED solo via /close y /cancel. Mantener en sync con
// el seed de helpdesk_ticket_statuses (sql/20260421_helpdesk_tickets.sql).
export const TICKET_WORKING_STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['IN_REVIEW', 'ASSIGNED'],
  IN_REVIEW: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_PARTS', 'WAITING_PROVIDER'],
  WAITING_PARTS: ['IN_PROGRESS'],
  WAITING_PROVIDER: ['IN_PROGRESS'],
};

export const TICKET_TERMINAL_STATUS_CODES = ['CLOSED', 'CANCELLED'];

export const createTicketError = (code: string, publicMessage?: string): Error => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  return error;
};

export const getTicketStatusCode = async (statusId: number | null | undefined): Promise<string | null> => {
  if (!statusId) {
    return null;
  }

  const result = await pool.query(
    `SELECT code FROM public.helpdesk_ticket_statuses WHERE id = $1 LIMIT 1;`,
    [statusId],
  );

  return result.rows[0]?.code ? String(result.rows[0].code) : null;
};

export const countTicketDocuments = async (ticketId: number): Promise<number> => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.helpdesk_ticket_documents WHERE ticket_id = $1;`,
    [ticketId],
  );

  return Number(result.rows[0]?.total ?? 0);
};

// Evidencia de la intervencion exigida antes de cerrar: al menos un documento
// adjunto (TCK-03), o -si la atencion fue 100% telefonica- la bitacora de
// llamada completa (support_channel REMOTE_PHONE + los 4 campos capturados
// en /solve). Nunca se permite cerrar sin ninguna de las dos.
export const ticketHasClosureEvidence = async (ticket: HelpdeskTicketRecord): Promise<boolean> => {
  const documentCount = await countTicketDocuments(ticket.id);
  if (documentCount > 0) {
    return true;
  }

  if (ticket.support_channel !== 'REMOTE_PHONE') {
    return false;
  }

  return Boolean(
    ticket.provider_name && ticket.provider_contact && ticket.onsite_responsible_employee_id && ticket.call_at,
  );
};

// Rutas de firma NUNCA se exponen en mapTicketRow/la respuesta JSON del
// ticket (mismo criterio que Movimientos): solo se resuelven aqui para el
// endpoint de vista, que sirve el PNG con su propio control de acceso.
export const resolveTicketSignaturePath = async (
  ticketId: number,
  party: 'requester' | 'closer',
): Promise<string | null> => {
  const column = party === 'requester' ? 'requester_signature_path' : 'closer_signature_path';
  const result = await pool.query(
    `SELECT ${column} AS p FROM public.helpdesk_tickets WHERE id = $1 LIMIT 1;`,
    [ticketId],
  );
  const storedPath = result.rows[0]?.p ? String(result.rows[0].p) : null;
  if (!storedPath) {
    return null;
  }

  const absolutePath = path.isAbsolute(storedPath) ? storedPath : path.join(process.cwd(), storedPath);
  return fs.existsSync(absolutePath) ? absolutePath : null;
};

export const recordTicketHistory = async (
  ticketId: number,
  action: string,
  summary: string,
  userId?: string | null,
  previousValues?: unknown,
  newValues?: unknown,
  executor: Queryable = pool,
) => {
  await executor.query(
    `
      INSERT INTO public.helpdesk_ticket_history (
        ticket_id,
        action,
        summary,
        previous_values,
        new_values,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6);
    `,
    [ticketId, action, summary, previousValues ?? null, newValues ?? null, userId ?? null],
  );
};
