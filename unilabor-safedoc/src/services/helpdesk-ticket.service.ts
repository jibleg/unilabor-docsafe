import pool from '../config/db';
import { getEmployeeByUserId } from './employee.service';
import { employeeCanAccessHelpdeskAsset } from './helpdesk-asset.service';
import { getHelpdeskSummary, type HelpdeskCatalogItem, type HelpdeskAssetSummary } from './helpdesk-asset.service';

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
}

export interface HelpdeskTicketSolutionPayload {
  solved_at: string;
  solution_summary: string;
  equipment_status_after_solution_id?: number | null;
}

export interface HelpdeskTicketReturnPayload {
  return_to_operation_at: string;
  equipment_status_after_solution_id?: number | null;
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
  is_active: boolean;
  created_at?: string | undefined;
  updated_at?: string | undefined;
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

const getRequiredEmployeeByUserId = async (userId: string) => {
  const employee = await getEmployeeByUserId(userId);
  if (!employee) {
    const error = new Error('HELPDESK_EMPLOYEE_PROFILE_NOT_FOUND');
    (error as any).code = 'HELPDESK_EMPLOYEE_PROFILE_NOT_FOUND';
    throw error;
  }

  return employee;
};

const ticketsTableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.helpdesk_tickets') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const tableExists = async (tableName: string): Promise<boolean> => {
  const result = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists;', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.exists);
};

const assertTicketsTable = async () => {
  const exists = await ticketsTableExists();
  if (!exists) {
    const error = new Error('HELPDESK_TICKETS_TABLE_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_TICKETS_TABLE_NOT_AVAILABLE';
    throw error;
  }
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const mapCatalog = (
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

const mapEmployee = (row: any, prefix: 'requester' | 'assigned') => {
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

const mapTicketRow = (row: any): HelpdeskTicketRecord => ({
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
  reported_at: row.reported_at ? String(row.reported_at) : '',
  due_at: row.due_at ? String(row.due_at) : null,
  solved_at: row.solved_at ? String(row.solved_at) : null,
  solution_summary: row.solution_summary ? String(row.solution_summary) : null,
  return_to_operation_at: row.return_to_operation_at ? String(row.return_to_operation_at) : null,
  validated_by_user_id: row.validated_by_user_id ? String(row.validated_by_user_id) : null,
  validated_at: row.validated_at ? String(row.validated_at) : null,
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
  impact_evaluated_at: row.impact_evaluated_at ? String(row.impact_evaluated_at) : null,
  technical_release_required: Boolean(row.technical_release_required),
  technical_release_summary: row.technical_release_summary ? String(row.technical_release_summary) : null,
  technical_released_by_user_id: row.technical_released_by_user_id ? String(row.technical_released_by_user_id) : null,
  technical_released_at: row.technical_released_at ? String(row.technical_released_at) : null,
  quality_document_id: row.quality_document_id ? String(row.quality_document_id) : null,
  operational_lock: Boolean(row.operational_lock),
  is_active: Boolean(row.is_active),
  created_at: row.created_at ? String(row.created_at) : undefined,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
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

const buildTicketQuery = () => `
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
    ae.position AS assigned_employee_position
  FROM public.helpdesk_tickets t
  LEFT JOIN public.helpdesk_assets a ON a.id = t.asset_id
  LEFT JOIN public.helpdesk_operational_statuses aos ON aos.id = a.operational_status_id
  LEFT JOIN public.helpdesk_request_types rt ON rt.id = t.request_type_id
  LEFT JOIN public.helpdesk_ticket_statuses ts ON ts.id = t.status_id
  LEFT JOIN public.helpdesk_ticket_priorities tp ON tp.id = t.priority_id
  LEFT JOIN public.helpdesk_operational_statuses esas ON esas.id = t.equipment_status_after_solution_id
  LEFT JOIN public.employees re ON re.id = t.requester_employee_id
  LEFT JOIN public.employees ae ON ae.id = t.assigned_employee_id
`;

const getDefaultStatusId = async (): Promise<number | null> => {
  const result = await pool.query(`
    SELECT id FROM public.helpdesk_ticket_statuses WHERE UPPER(code) = 'NEW' LIMIT 1;
  `);

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

const getOperationalStatusId = async (code: string): Promise<number | null> => {
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

const getDefaultPriorityId = async (): Promise<number | null> => {
  const result = await pool.query(`
    SELECT id FROM public.helpdesk_ticket_priorities WHERE UPPER(code) = 'MEDIUM' LIMIT 1;
  `);

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

const getTicketStatusId = async (code: string): Promise<number | null> => {
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

const calculateDowntimeMinutes = (reportedAt: string, returnAt: string): number | null => {
  const start = new Date(reportedAt).getTime();
  const end = new Date(returnAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return Math.round((end - start) / 60000);
};

const updateAssetStatusAndHistory = async (
  assetId: number | null | undefined,
  statusId: number | null | undefined,
  ticketId: number,
  summary: string,
  userId?: string | null,
) => {
  if (!assetId || !statusId) {
    return;
  }

  await pool.query(
    `
      UPDATE public.helpdesk_assets
      SET operational_status_id = $1, updated_by_user_id = $2, updated_at = NOW()
      WHERE id = $3;
    `,
    [statusId, userId ?? null, assetId],
  );

  await pool.query(
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

const generateTicketCode = async (): Promise<string> => {
  const result = await pool.query(`
    SELECT COALESCE(MAX(id), 0) + 1 AS next_id
    FROM public.helpdesk_tickets;
  `);
  const nextId = Number(result.rows[0]?.next_id ?? 0);
  return `HD-${String(nextId).padStart(6, '0')}`;
};

const recordTicketHistory = async (
  ticketId: number,
  action: string,
  summary: string,
  userId?: string | null,
  previousValues?: unknown,
  newValues?: unknown,
) => {
  await pool.query(
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

export const listHelpdeskTicketCatalogs = async (): Promise<HelpdeskTicketCatalogs> => {
  await assertTicketsTable();

  const [typesResult, statusesResult, prioritiesResult] = await Promise.all([
    pool.query(`
      SELECT id, code, name, description, is_active, sort_order
      FROM public.helpdesk_request_types
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, name ASC;
    `),
    pool.query(`
      SELECT id, code, name, description, is_closed, is_active, sort_order
      FROM public.helpdesk_ticket_statuses
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, name ASC;
    `),
    pool.query(`
      SELECT id, code, name, description, response_hours, is_active, sort_order
      FROM public.helpdesk_ticket_priorities
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, name ASC;
    `),
  ]);

  return {
    request_types: typesResult.rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      is_active: Boolean(row.is_active),
      sort_order: Number(row.sort_order ?? 0),
    })),
    ticket_statuses: statusesResult.rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      is_closed: Boolean(row.is_closed),
      is_active: Boolean(row.is_active),
      sort_order: Number(row.sort_order ?? 0),
    })),
    ticket_priorities: prioritiesResult.rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      response_hours: row.response_hours ? Number(row.response_hours) : null,
      is_active: Boolean(row.is_active),
      sort_order: Number(row.sort_order ?? 0),
    })),
  };
};

export const getHelpdeskSummaryWithTickets = async (): Promise<HelpdeskAssetSummary> => {
  const baseSummary = await getHelpdeskSummary();
  const exists = await ticketsTableExists();
  if (!exists) {
    return baseSummary;
  }

  const result = await pool.query(`
    SELECT COUNT(*)::int AS open_tickets
    FROM public.helpdesk_tickets t
    LEFT JOIN public.helpdesk_ticket_statuses s ON s.id = t.status_id
    WHERE t.is_active = TRUE
      AND COALESCE(s.is_closed, FALSE) = FALSE;
  `);

  return {
    ...baseSummary,
    open_tickets: Number(result.rows[0]?.open_tickets ?? 0),
  };
};

export const getHelpdeskDashboardMetrics = async (): Promise<HelpdeskDashboardMetrics> => {
  const hasTickets = await ticketsTableExists();
  const hasAssets = await tableExists('helpdesk_assets');
  const hasMaintenance = await tableExists('helpdesk_maintenance_orders');

  const emptyMetrics: HelpdeskDashboardMetrics = {
    tickets: {
      total: 0,
      open: 0,
      critical: 0,
      overdue: 0,
      solved: 0,
      affects_results: 0,
      risk_pending_release: 0,
      avg_solution_hours: null,
      avg_downtime_hours: null,
    },
    maintenance: {
      scheduled: 0,
      in_progress: 0,
      overdue: 0,
      closed: 0,
      compliance_percent: 0,
    },
    availability: [],
    recurrences: [],
    by_area: [],
    audit_items: [],
  };

  const [
    ticketResult,
    maintenanceResult,
    availabilityResult,
    recurrenceResult,
    areaResult,
    auditResult,
  ] = await Promise.all([
    hasTickets
      ? pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE COALESCE(ts.is_closed, FALSE) = FALSE)::int AS open,
            COUNT(*) FILTER (WHERE UPPER(COALESCE(tp.code, '')) = 'CRITICAL')::int AS critical,
            COUNT(*) FILTER (
              WHERE COALESCE(ts.is_closed, FALSE) = FALSE
                AND t.due_at IS NOT NULL
                AND t.due_at < NOW()
            )::int AS overdue,
            COUNT(*) FILTER (WHERE t.solved_at IS NOT NULL)::int AS solved,
            COUNT(*) FILTER (WHERE t.affects_results = TRUE)::int AS affects_results,
            COUNT(*) FILTER (
              WHERE COALESCE(t.technical_release_required, FALSE) = TRUE
                AND t.technical_released_at IS NULL
            )::int AS risk_pending_release,
            ROUND(AVG(EXTRACT(EPOCH FROM (t.solved_at - t.reported_at)) / 3600) FILTER (WHERE t.solved_at IS NOT NULL)::numeric, 2) AS avg_solution_hours,
            ROUND(AVG(t.downtime_minutes / 60.0) FILTER (WHERE t.downtime_minutes IS NOT NULL)::numeric, 2) AS avg_downtime_hours
          FROM public.helpdesk_tickets t
          LEFT JOIN public.helpdesk_ticket_statuses ts ON ts.id = t.status_id
          LEFT JOIN public.helpdesk_ticket_priorities tp ON tp.id = t.priority_id
          WHERE t.is_active = TRUE;
        `)
      : Promise.resolve({ rows: [] }),
    hasMaintenance
      ? pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'RESCHEDULED'))::int AS scheduled,
            COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
            COUNT(*) FILTER (
              WHERE status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
                AND scheduled_for < CURRENT_DATE
            )::int AS overdue,
            COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed,
            COUNT(*) FILTER (
              WHERE status = 'CLOSED'
                AND completed_at IS NOT NULL
                AND (
                  window_ends_on IS NULL
                  OR completed_at::date <= window_ends_on
                )
            )::int AS closed_on_time
          FROM public.helpdesk_maintenance_orders;
        `)
      : Promise.resolve({ rows: [] }),
    hasAssets
      ? pool.query(`
          SELECT
            COALESCE(os.code, 'UNCLASSIFIED') AS code,
            COALESCE(os.name, 'Sin estado') AS name,
            COUNT(a.id)::int AS total
          FROM public.helpdesk_assets a
          LEFT JOIN public.helpdesk_operational_statuses os ON os.id = a.operational_status_id
          WHERE a.is_active = TRUE
          GROUP BY COALESCE(os.code, 'UNCLASSIFIED'), COALESCE(os.name, 'Sin estado')
          ORDER BY total DESC, name ASC;
        `)
      : Promise.resolve({ rows: [] }),
    hasTickets
      ? pool.query(`
          SELECT
            a.id AS asset_id,
            a.asset_code,
            a.name AS asset_name,
            COUNT(t.id)::int AS ticket_count
          FROM public.helpdesk_tickets t
          INNER JOIN public.helpdesk_assets a ON a.id = t.asset_id
          WHERE t.is_active = TRUE
          GROUP BY a.id, a.asset_code, a.name
          HAVING COUNT(t.id) >= 2
          ORDER BY ticket_count DESC, a.name ASC
          LIMIT 8;
        `)
      : Promise.resolve({ rows: [] }),
    hasTickets && hasMaintenance
      ? pool.query(`
          WITH ticket_area AS (
            SELECT
              COALESCE(ar.name, re.area, 'Sin area') AS area,
              COUNT(DISTINCT t.id)::int AS ticket_count
            FROM public.helpdesk_tickets t
            LEFT JOIN public.helpdesk_assets a ON a.id = t.asset_id
            LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
            LEFT JOIN public.employees re ON re.id = t.requester_employee_id
            WHERE t.is_active = TRUE
            GROUP BY COALESCE(ar.name, re.area, 'Sin area')
          ),
          maintenance_area AS (
            SELECT
              COALESCE(ar.name, 'Sin area') AS area,
              COUNT(DISTINCT o.id)::int AS maintenance_count
            FROM public.helpdesk_maintenance_orders o
            LEFT JOIN public.helpdesk_assets a ON a.id = o.asset_id
            LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
            GROUP BY COALESCE(ar.name, 'Sin area')
          )
          SELECT
            COALESCE(t.area, m.area) AS area,
            COALESCE(t.ticket_count, 0)::int AS ticket_count,
            COALESCE(m.maintenance_count, 0)::int AS maintenance_count
          FROM ticket_area t
          FULL OUTER JOIN maintenance_area m ON m.area = t.area
          ORDER BY (COALESCE(t.ticket_count, 0) + COALESCE(m.maintenance_count, 0)) DESC, area ASC
          LIMIT 10;
        `)
      : hasTickets
        ? pool.query(`
            SELECT
              COALESCE(ar.name, re.area, 'Sin area') AS area,
              COUNT(DISTINCT t.id)::int AS ticket_count,
              0::int AS maintenance_count
            FROM public.helpdesk_tickets t
            LEFT JOIN public.helpdesk_assets a ON a.id = t.asset_id
            LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
            LEFT JOIN public.employees re ON re.id = t.requester_employee_id
            WHERE t.is_active = TRUE
            GROUP BY COALESCE(ar.name, re.area, 'Sin area')
            ORDER BY ticket_count DESC, area ASC
            LIMIT 10;
          `)
      : Promise.resolve({ rows: [] }),
    hasTickets
      ? pool.query(`
          SELECT
            'ticket' AS kind,
            t.ticket_code AS code,
            a.asset_code,
            a.name AS asset_name,
            COALESCE(ts.name, 'Sin estado') AS status,
            COALESCE(t.risk_level, 'NOT_EVALUATED') AS risk_level,
            COALESCE(t.updated_at, t.reported_at) AS event_at,
            COALESCE(ae.full_name, re.full_name) AS owner
          FROM public.helpdesk_tickets t
          LEFT JOIN public.helpdesk_assets a ON a.id = t.asset_id
          LEFT JOIN public.helpdesk_ticket_statuses ts ON ts.id = t.status_id
          LEFT JOIN public.employees ae ON ae.id = t.assigned_employee_id
          LEFT JOIN public.employees re ON re.id = t.requester_employee_id
          WHERE t.is_active = TRUE
          ORDER BY COALESCE(t.updated_at, t.reported_at) DESC
          LIMIT 10;
        `)
      : Promise.resolve({ rows: [] }),
  ]);

  const ticketRow = ticketResult.rows[0] ?? {};
  const maintenanceRow = maintenanceResult.rows[0] ?? {};
  const closed = Number(maintenanceRow.closed ?? 0);
  const closedOnTime = Number(maintenanceRow.closed_on_time ?? 0);

  return {
    tickets: hasTickets
      ? {
          total: Number(ticketRow.total ?? 0),
          open: Number(ticketRow.open ?? 0),
          critical: Number(ticketRow.critical ?? 0),
          overdue: Number(ticketRow.overdue ?? 0),
          solved: Number(ticketRow.solved ?? 0),
          affects_results: Number(ticketRow.affects_results ?? 0),
          risk_pending_release: Number(ticketRow.risk_pending_release ?? 0),
          avg_solution_hours: ticketRow.avg_solution_hours === null || ticketRow.avg_solution_hours === undefined
            ? null
            : Number(ticketRow.avg_solution_hours),
          avg_downtime_hours: ticketRow.avg_downtime_hours === null || ticketRow.avg_downtime_hours === undefined
            ? null
            : Number(ticketRow.avg_downtime_hours),
        }
      : emptyMetrics.tickets,
    maintenance: hasMaintenance
      ? {
          scheduled: Number(maintenanceRow.scheduled ?? 0),
          in_progress: Number(maintenanceRow.in_progress ?? 0),
          overdue: Number(maintenanceRow.overdue ?? 0),
          closed,
          compliance_percent: closed > 0 ? Math.round((closedOnTime / closed) * 100) : 0,
        }
      : emptyMetrics.maintenance,
    availability: availabilityResult.rows.map((row) => ({
      code: String(row.code),
      name: String(row.name),
      total: Number(row.total ?? 0),
    })),
    recurrences: recurrenceResult.rows.map((row) => ({
      asset_id: Number(row.asset_id),
      asset_code: String(row.asset_code ?? ''),
      asset_name: String(row.asset_name ?? ''),
      ticket_count: Number(row.ticket_count ?? 0),
    })),
    by_area: areaResult.rows.map((row) => ({
      area: String(row.area ?? 'Sin area'),
      ticket_count: Number(row.ticket_count ?? 0),
      maintenance_count: Number(row.maintenance_count ?? 0),
    })),
    audit_items: auditResult.rows.map((row) => ({
      kind: String(row.kind),
      code: String(row.code ?? ''),
      asset_code: row.asset_code ? String(row.asset_code) : null,
      asset_name: row.asset_name ? String(row.asset_name) : null,
      status: String(row.status ?? ''),
      risk_level: row.risk_level ? String(row.risk_level) : null,
      event_at: row.event_at ? String(row.event_at) : '',
      owner: row.owner ? String(row.owner) : null,
    })),
  };
};

export const listHelpdeskTickets = async (): Promise<HelpdeskTicketRecord[]> => {
  await assertTicketsTable();

  const result = await pool.query(`
    ${buildTicketQuery()}
    WHERE t.is_active = TRUE
    ORDER BY t.updated_at DESC, t.reported_at DESC;
  `);

  return result.rows.map(mapTicketRow);
};

export const listMyHelpdeskTickets = async (userId: string): Promise<HelpdeskTicketRecord[]> => {
  await assertTicketsTable();

  const employee = await getRequiredEmployeeByUserId(userId);
  const result = await pool.query(
    `
      ${buildTicketQuery()}
      WHERE t.is_active = TRUE
        AND t.requester_employee_id = $1
      ORDER BY t.updated_at DESC, t.reported_at DESC;
    `,
    [employee.id],
  );

  return result.rows.map(mapTicketRow);
};

export const getMyHelpdeskTicketById = async (
  ticketId: number,
  userId: string,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const employee = await getRequiredEmployeeByUserId(userId);
  const ticket = await getHelpdeskTicketById(ticketId);
  if (!ticket || ticket.requester_employee_id !== employee.id) {
    return null;
  }

  return ticket;
};

export const listTicketComments = async (ticketId: number): Promise<HelpdeskTicketCommentRecord[]> => {
  const result = await pool.query(
    `
      SELECT
        c.*,
        u.full_name AS created_by_name
      FROM public.helpdesk_ticket_comments c
      LEFT JOIN public.users u ON u.id = c.created_by_user_id
      WHERE c.ticket_id = $1
      ORDER BY c.created_at ASC;
    `,
    [ticketId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    ticket_id: Number(row.ticket_id),
    comment: String(row.comment),
    is_internal: Boolean(row.is_internal),
    created_by_user_id: row.created_by_user_id ? String(row.created_by_user_id) : null,
    created_by_name: row.created_by_name ? String(row.created_by_name) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }));
};

export const getHelpdeskTicketById = async (ticketId: number): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const result = await pool.query(
    `
      ${buildTicketQuery()}
      WHERE t.id = $1
      LIMIT 1;
    `,
    [ticketId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const ticket = mapTicketRow(result.rows[0]);
  ticket.comments = await listTicketComments(ticketId);
  return ticket;
};

export const createHelpdeskTicket = async (
  payload: HelpdeskTicketPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord> => {
  await assertTicketsTable();

  const defaultStatusId = payload.status_id ?? await getDefaultStatusId();
  const defaultPriorityId = payload.priority_id ?? await getDefaultPriorityId();
  const ticketCode = await generateTicketCode();

  const result = await pool.query(
    `
      INSERT INTO public.helpdesk_tickets (
        ticket_code,
        asset_id,
        request_type_id,
        status_id,
        priority_id,
        requester_user_id,
        requester_employee_id,
        assigned_employee_id,
        title,
        description,
        operational_impact,
        affects_results,
        due_at,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $6, $6
      )
      RETURNING id;
    `,
    [
      ticketCode,
      payload.asset_id ?? null,
      payload.request_type_id ?? null,
      defaultStatusId,
      defaultPriorityId,
      userId ?? null,
      payload.requester_employee_id ?? null,
      payload.assigned_employee_id ?? null,
      payload.title.trim(),
      payload.description.trim(),
      normalizeOptionalText(payload.operational_impact),
      Boolean(payload.affects_results),
      normalizeOptionalText(payload.due_at),
    ],
  );

  const ticketId = Number(result.rows[0]?.id);
  await recordTicketHistory(ticketId, 'CREATE', 'Ticket creado en mesa de ayuda.', userId, null, payload);

  const created = await getHelpdeskTicketById(ticketId);
  if (!created) {
    const error = new Error('HELPDESK_TICKET_CREATION_FAILED');
    (error as any).code = 'HELPDESK_TICKET_CREATION_FAILED';
    throw error;
  }

  return created;
};

export const createMyHelpdeskTicket = async (
  payload: HelpdeskTicketPayload,
  userId: string,
): Promise<HelpdeskTicketRecord> => {
  const employee = await getRequiredEmployeeByUserId(userId);

  if (payload.asset_id) {
    const canAccessAsset = await employeeCanAccessHelpdeskAsset(employee.id, payload.asset_id);
    if (!canAccessAsset) {
      const error = new Error('HELPDESK_ASSET_NOT_ASSIGNED_TO_EMPLOYEE');
      (error as any).code = 'HELPDESK_ASSET_NOT_ASSIGNED_TO_EMPLOYEE';
      throw error;
    }
  }

  return createHelpdeskTicket(
    {
      ...payload,
      requester_employee_id: employee.id,
      assigned_employee_id: null,
      status_id: null,
    },
    userId,
  );
};

export const updateHelpdeskTicket = async (
  ticketId: number,
  payload: HelpdeskTicketPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.helpdesk_tickets
      SET
        asset_id = $1,
        request_type_id = $2,
        status_id = $3,
        priority_id = $4,
        requester_employee_id = $5,
        assigned_employee_id = $6,
        title = $7,
        description = $8,
        operational_impact = $9,
        affects_results = $10,
        due_at = $11,
        updated_by_user_id = $12,
        updated_at = NOW()
      WHERE id = $13;
    `,
    [
      payload.asset_id ?? null,
      payload.request_type_id ?? null,
      payload.status_id ?? null,
      payload.priority_id ?? null,
      payload.requester_employee_id ?? null,
      payload.assigned_employee_id ?? null,
      payload.title.trim(),
      payload.description.trim(),
      normalizeOptionalText(payload.operational_impact),
      Boolean(payload.affects_results),
      normalizeOptionalText(payload.due_at),
      userId ?? null,
      ticketId,
    ],
  );

  await recordTicketHistory(ticketId, 'UPDATE', 'Ticket actualizado.', userId, current, payload);
  return getHelpdeskTicketById(ticketId);
};

export const addHelpdeskTicketComment = async (
  ticketId: number,
  comment: string,
  isInternal: boolean,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  await pool.query(
    `
      INSERT INTO public.helpdesk_ticket_comments (
        ticket_id,
        comment,
        is_internal,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4);
    `,
    [ticketId, comment.trim(), isInternal, userId ?? null],
  );

  await pool.query(
    `
      UPDATE public.helpdesk_tickets
      SET updated_by_user_id = $1, updated_at = NOW()
      WHERE id = $2;
    `,
    [userId ?? null, ticketId],
  );

  await recordTicketHistory(ticketId, 'COMMENT', 'Comentario agregado al ticket.', userId, null, {
    comment,
    is_internal: isInternal,
  });

  return getHelpdeskTicketById(ticketId);
};

export const addMyHelpdeskTicketComment = async (
  ticketId: number,
  comment: string,
  userId: string,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const employee = await getRequiredEmployeeByUserId(userId);
  const ticket = await getHelpdeskTicketById(ticketId);
  if (!ticket || ticket.requester_employee_id !== employee.id) {
    return null;
  }

  return addHelpdeskTicketComment(ticketId, comment, false, userId);
};

export const confirmMyHelpdeskTicketFunctionality = async (
  ticketId: number,
  userId: string,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const employee = await getRequiredEmployeeByUserId(userId);
  const ticket = await getHelpdeskTicketById(ticketId);
  if (!ticket || ticket.requester_employee_id !== employee.id) {
    return null;
  }

  if (!ticket.solved_at) {
    const error = new Error('HELPDESK_TICKET_NOT_SOLVED');
    (error as any).code = 'HELPDESK_TICKET_NOT_SOLVED';
    throw error;
  }

  const returnAt = new Date().toISOString();
  await addHelpdeskTicketComment(ticketId, 'El colaborador confirma funcionamiento del equipo.', false, userId);

  return validateHelpdeskTicketReturn(
    ticketId,
    {
      return_to_operation_at: returnAt,
      equipment_status_after_solution_id: ticket.equipment_status_after_solution_id ?? null,
    },
    userId,
  );
};

export const evaluateHelpdeskTicketIsoRisk = async (
  ticketId: number,
  payload: HelpdeskTicketIsoRiskPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const normalizedRisk = payload.risk_level.trim().toUpperCase();
  const operationalLock =
    payload.operational_lock ??
    (normalizedRisk === 'HIGH' || normalizedRisk === 'CRITICAL' || Boolean(current.affects_results));

  await pool.query(
    `
      UPDATE public.helpdesk_tickets
      SET
        risk_level = $1,
        impact_evaluation = $2,
        recent_analysis_usage = $3,
        alternate_equipment_used = $4,
        alternate_equipment_notes = $5,
        corrective_action_required = $6,
        corrective_action_notes = $7,
        impact_evaluated_by_user_id = $8,
        impact_evaluated_at = NOW(),
        technical_release_required = $9,
        quality_document_id = $10,
        operational_lock = $11,
        updated_by_user_id = $8,
        updated_at = NOW()
      WHERE id = $12;
    `,
    [
      normalizedRisk,
      payload.impact_evaluation.trim(),
      normalizeOptionalText(payload.recent_analysis_usage),
      Boolean(payload.alternate_equipment_used),
      normalizeOptionalText(payload.alternate_equipment_notes),
      Boolean(payload.corrective_action_required),
      normalizeOptionalText(payload.corrective_action_notes),
      userId ?? null,
      Boolean(payload.technical_release_required) || operationalLock,
      normalizeOptionalText(payload.quality_document_id),
      operationalLock,
      ticketId,
    ],
  );

  if (operationalLock && current.asset_id) {
    const outOfServiceStatusId = await getOperationalStatusId('OUT_OF_SERVICE');
    await updateAssetStatusAndHistory(
      current.asset_id,
      outOfServiceStatusId,
      ticketId,
      'Equipo bloqueado operativamente por evaluacion ISO/riesgo.',
      userId,
    );
  }

  await recordTicketHistory(ticketId, 'ISO_RISK_EVALUATION', 'Evaluacion ISO/riesgo registrada.', userId, current, payload);
  return getHelpdeskTicketById(ticketId);
};

export const releaseHelpdeskTicketTechnically = async (
  ticketId: number,
  payload: HelpdeskTicketTechnicalReleasePayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.helpdesk_tickets
      SET
        technical_release_summary = $1,
        technical_released_by_user_id = $2,
        technical_released_at = NOW(),
        equipment_status_after_solution_id = COALESCE($3, equipment_status_after_solution_id),
        operational_lock = FALSE,
        updated_by_user_id = $2,
        updated_at = NOW()
      WHERE id = $4;
    `,
    [
      payload.technical_release_summary.trim(),
      userId ?? null,
      payload.equipment_status_after_solution_id ?? null,
      ticketId,
    ],
  );

  if (current.asset_id && payload.equipment_status_after_solution_id) {
    await updateAssetStatusAndHistory(
      current.asset_id,
      payload.equipment_status_after_solution_id,
      ticketId,
      'Liberacion tecnica documentada desde ticket Helpdesk.',
      userId,
    );
  }

  await recordTicketHistory(ticketId, 'TECHNICAL_RELEASE', 'Liberacion tecnica documentada.', userId, current, payload);
  return getHelpdeskTicketById(ticketId);
};

export const solveHelpdeskTicket = async (
  ticketId: number,
  payload: HelpdeskTicketSolutionPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const solvedStatusId = await getTicketStatusId('SOLVED');

  await pool.query(
    `
      UPDATE public.helpdesk_tickets
      SET
        solved_at = $1,
        solution_summary = $2,
        equipment_status_after_solution_id = $3,
        status_id = COALESCE($4, status_id),
        updated_by_user_id = $5,
        updated_at = NOW()
      WHERE id = $6;
    `,
    [
      payload.solved_at,
      payload.solution_summary.trim(),
      payload.equipment_status_after_solution_id ?? null,
      solvedStatusId,
      userId ?? null,
      ticketId,
    ],
  );

  await updateAssetStatusAndHistory(
    current.asset_id,
    payload.equipment_status_after_solution_id,
    ticketId,
    'Solucion tecnica registrada desde ticket Helpdesk.',
    userId,
  );

  await recordTicketHistory(ticketId, 'SOLVE', 'Solucion tecnica registrada.', userId, current, payload);
  return getHelpdeskTicketById(ticketId);
};

export const validateHelpdeskTicketReturn = async (
  ticketId: number,
  payload: HelpdeskTicketReturnPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const validatedStatusId = await getTicketStatusId('VALIDATED');
  const requiresRelease =
    Boolean(current.technical_release_required) ||
    Boolean(current.operational_lock) ||
    Boolean(current.affects_results) ||
    current.risk_level === 'HIGH' ||
    current.risk_level === 'CRITICAL';

  if (requiresRelease && !current.technical_released_at) {
    const error = new Error('HELPDESK_TECHNICAL_RELEASE_REQUIRED');
    (error as any).code = 'HELPDESK_TECHNICAL_RELEASE_REQUIRED';
    throw error;
  }

  const downtimeMinutes = calculateDowntimeMinutes(current.reported_at, payload.return_to_operation_at);
  const nextStatusId =
    payload.equipment_status_after_solution_id ?? current.equipment_status_after_solution_id ?? null;

  await pool.query(
    `
      UPDATE public.helpdesk_tickets
      SET
        return_to_operation_at = $1,
        validated_by_user_id = $2,
        validated_at = NOW(),
        downtime_minutes = $3,
        equipment_status_after_solution_id = COALESCE($4, equipment_status_after_solution_id),
        status_id = COALESCE($5, status_id),
        updated_by_user_id = $2,
        updated_at = NOW()
      WHERE id = $6;
    `,
    [
      payload.return_to_operation_at,
      userId ?? null,
      downtimeMinutes,
      payload.equipment_status_after_solution_id ?? null,
      validatedStatusId,
      ticketId,
    ],
  );

  await updateAssetStatusAndHistory(
    current.asset_id,
    nextStatusId,
    ticketId,
    'Retorno a operacion validado desde ticket Helpdesk.',
    userId,
  );

  await recordTicketHistory(ticketId, 'VALIDATE_RETURN', 'Retorno a operacion validado.', userId, current, {
    ...payload,
    downtime_minutes: downtimeMinutes,
  });

  return getHelpdeskTicketById(ticketId);
};
