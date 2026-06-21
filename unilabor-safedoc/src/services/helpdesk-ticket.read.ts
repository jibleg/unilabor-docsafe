import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import {
  PaginatedResult,
  PaginationInput,
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';
import {
  getHelpdeskSummary,
  type HelpdeskAssetSummary,
} from './helpdesk-asset.service';
import {
  HelpdeskTicketRecord,
  HelpdeskTicketCatalogs,
  HelpdeskDashboardMetrics,
  HelpdeskTicketCommentRecord,
  assertTicketsTable,
  ticketsTableExists,
  tableExists,
  mapTicketRow,
  buildTicketQuery,
  getRequiredEmployeeByUserId,
} from './helpdesk-ticket.shared';


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
      event_at: row.event_at ? toIsoDateTime(row.event_at) : '',
      owner: row.owner ? String(row.owner) : null,
    })),
  };
};

const TICKET_SEARCH_COLUMNS = [
  't.ticket_code',
  't.title',
  't.description',
  'a.asset_code',
  'a.name',
  're.full_name',
  'ae.full_name',
  'ts.name',
  'tp.name',
];

export interface TicketListOptions extends PaginationInput {
  search?: string | undefined;
}

export const listHelpdeskTickets = async (
  options: TicketListOptions = {},
): Promise<PaginatedResult<HelpdeskTicketRecord>> => {
  await assertTicketsTable();

  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const search = buildIlikeSearch(TICKET_SEARCH_COLUMNS, options.search, 0);
  const whereClause = ['t.is_active = TRUE', search.clause].filter(Boolean).join(' AND ');

  const base = buildTicketQuery();
  const limitSql = paginate
    ? `LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`
    : '';
  const dataValues = paginate ? [...search.values, limit, offset] : search.values;

  const dataResult = await pool.query(
    `${base} WHERE ${whereClause} ORDER BY t.updated_at DESC, t.reported_at DESC ${limitSql};`,
    dataValues,
  );
  const data = dataResult.rows.map(mapTicketRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM (${base} WHERE ${whereClause}) sub;`,
    search.values,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

export interface HelpdeskTicketStats {
  total: number;
  open: number;
  critical: number;
  affects_results: number;
}

export const getHelpdeskTicketStats = async (): Promise<HelpdeskTicketStats> => {
  await assertTicketsTable();

  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(ts.is_closed, FALSE) = FALSE)::int AS open,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(tp.code, '')) = 'CRITICAL')::int AS critical,
      COUNT(*) FILTER (WHERE t.affects_results = TRUE)::int AS affects_results
    FROM public.helpdesk_tickets t
    LEFT JOIN public.helpdesk_ticket_statuses ts ON ts.id = t.status_id
    LEFT JOIN public.helpdesk_ticket_priorities tp ON tp.id = t.priority_id
    WHERE t.is_active = TRUE;
  `);

  const row = result.rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    open: Number(row.open ?? 0),
    critical: Number(row.critical ?? 0),
    affects_results: Number(row.affects_results ?? 0),
  };
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
  // El colaborador (vía /me) NO debe ver comentarios internos del equipo de soporte.
  const ticket = await getHelpdeskTicketById(ticketId, false);
  if (!ticket || ticket.requester_employee_id !== employee.id) {
    return null;
  }

  return ticket;
};

export const listTicketComments = async (
  ticketId: number,
  includeInternal = true,
): Promise<HelpdeskTicketCommentRecord[]> => {
  const result = await pool.query(
    `
      SELECT
        c.*,
        u.full_name AS created_by_name
      FROM public.helpdesk_ticket_comments c
      LEFT JOIN public.users u ON u.id = c.created_by_user_id
      WHERE c.ticket_id = $1
        ${includeInternal ? '' : 'AND c.is_internal = FALSE'}
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
    created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
  }));
};

export const getHelpdeskTicketById = async (
  ticketId: number,
  includeInternalComments = true,
): Promise<HelpdeskTicketRecord | null> => {
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
  ticket.comments = await listTicketComments(ticketId, includeInternalComments);
  return ticket;
};

