import pool from '../config/db';
import { initializeDefaultEmployeeDocumentAccess } from './employee-document-access.service';
import type {
  EmployeeAlertRecord,
  EmployeeAlertsSummary,
  EmployeeAlertState,
} from '../types';

interface EmployeeAlertFilters {
  employee_id?: number;
  area?: string;
  state?: EmployeeAlertState;
}

const EXPIRING_WINDOW_DAYS = 30;

const normalizeArea = (value?: string): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const mapMissingAlertRow = (row: any): EmployeeAlertRecord => ({
  employee_id: Number(row.employee_id),
  employee_code: String(row.employee_code),
  employee_name: String(row.employee_name),
  employee_email: String(row.employee_email),
  area: row.area ? String(row.area) : null,
  position: row.position ? String(row.position) : null,
  state: 'missing',
  section_id: Number(row.section_id),
  section_name: String(row.section_name),
  document_type_id: Number(row.document_type_id),
  document_type_name: String(row.document_type_name),
});

const mapExpiryAlertRow = (
  row: any,
  state: 'expiring' | 'expired',
): EmployeeAlertRecord => ({
  employee_id: Number(row.employee_id),
  employee_code: String(row.employee_code),
  employee_name: String(row.employee_name),
  employee_email: String(row.employee_email),
  area: row.area ? String(row.area) : null,
  position: row.position ? String(row.position) : null,
  state,
  section_id: Number(row.section_id),
  section_name: String(row.section_name),
  document_type_id: Number(row.document_type_id),
  document_type_name: String(row.document_type_name),
  document_id: Number(row.document_id),
  expiry_date: row.expiry_date ? String(row.expiry_date) : null,
  days_remaining:
    row.days_remaining === null || row.days_remaining === undefined
      ? null
      : Number(row.days_remaining),
});

const buildMissingAlertsQuery = (filters: EmployeeAlertFilters) => {
  const values: unknown[] = [];
  const clauses = [
    'e.is_active = TRUE',
    'dt.is_active = TRUE',
    'dt.is_required = TRUE',
    's.is_active = TRUE',
    'sa.is_enabled = TRUE',
    'ta.is_enabled = TRUE',
  ];

  if (filters.employee_id) {
    values.push(filters.employee_id);
    clauses.push(`e.id = $${values.length}`);
  }

  const normalizedArea = normalizeArea(filters.area);
  if (normalizedArea) {
    values.push(`%${normalizedArea}%`);
    clauses.push(`COALESCE(e.area, '') ILIKE $${values.length}`);
  }

  return {
    values,
    query: `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.full_name AS employee_name,
        e.email AS employee_email,
        e.area,
        e.position,
        s.id AS section_id,
        s.name AS section_name,
        dt.id AS document_type_id,
        dt.name AS document_type_name
      FROM public.employees e
      INNER JOIN public.employee_document_section_access sa
        ON sa.employee_id = e.id
      INNER JOIN public.document_sections s
        ON s.id = sa.section_id
      INNER JOIN public.document_types dt
        ON dt.section_id = s.id
      INNER JOIN public.employee_document_type_access ta
        ON ta.employee_id = e.id
       AND ta.document_type_id = dt.id
      LEFT JOIN public.employee_documents ed
        ON ed.employee_id = e.id
       AND ed.document_type_id = dt.id
       AND ed.is_current = TRUE
      WHERE ${clauses.join(' AND ')}
        AND ed.id IS NULL
      ORDER BY e.full_name ASC, s.sort_order ASC, dt.sort_order ASC, dt.name ASC;
    `,
  };
};

const buildExpiryAlertsQuery = (
  filters: EmployeeAlertFilters,
  state: 'expiring' | 'expired',
) => {
  const values: unknown[] = state === 'expiring' ? [EXPIRING_WINDOW_DAYS] : [];
  const clauses = [
    'e.is_active = TRUE',
    'dt.is_active = TRUE',
    'dt.has_expiry = TRUE',
    's.is_active = TRUE',
    'sa.is_enabled = TRUE',
    'ta.is_enabled = TRUE',
    'ed.is_current = TRUE',
    `ed.expiry_date IS NOT NULL`,
  ];

  if (filters.employee_id) {
    values.push(filters.employee_id);
    clauses.push(`e.id = $${values.length}`);
  }

  const normalizedArea = normalizeArea(filters.area);
  if (normalizedArea) {
    values.push(`%${normalizedArea}%`);
    clauses.push(`COALESCE(e.area, '') ILIKE $${values.length}`);
  }

  if (state === 'expiring') {
    clauses.push(`ed.expiry_date >= CURRENT_DATE`);
    clauses.push(`ed.expiry_date <= CURRENT_DATE + $1::int`);
  } else {
    clauses.push(`ed.expiry_date < CURRENT_DATE`);
  }

  return {
    values,
    query: `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.full_name AS employee_name,
        e.email AS employee_email,
        e.area,
        e.position,
        s.id AS section_id,
        s.name AS section_name,
        dt.id AS document_type_id,
        dt.name AS document_type_name,
        ed.id AS document_id,
        ed.expiry_date,
        (ed.expiry_date - CURRENT_DATE)::int AS days_remaining
      FROM public.employee_documents ed
      INNER JOIN public.employees e ON e.id = ed.employee_id
      INNER JOIN public.document_types dt ON dt.id = ed.document_type_id
      INNER JOIN public.document_sections s ON s.id = dt.section_id
      INNER JOIN public.employee_document_section_access sa
        ON sa.employee_id = e.id
       AND sa.section_id = s.id
      INNER JOIN public.employee_document_type_access ta
        ON ta.employee_id = e.id
       AND ta.document_type_id = dt.id
      WHERE ${clauses.join(' AND ')}
      ORDER BY e.full_name ASC, ed.expiry_date ASC NULLS LAST;
    `,
  };
};

export const listMissingExpedientAlerts = async (
  filters: EmployeeAlertFilters = {},
): Promise<EmployeeAlertRecord[]> => {
  const { query, values } = buildMissingAlertsQuery(filters);
  const result = await pool.query(query, values);
  return result.rows.map((row) => mapMissingAlertRow(row));
};

export const listExpiringDocumentAlerts = async (
  filters: EmployeeAlertFilters = {},
): Promise<EmployeeAlertRecord[]> => {
  const { query, values } = buildExpiryAlertsQuery(filters, 'expiring');
  const result = await pool.query(query, values);
  return result.rows.map((row) => mapExpiryAlertRow(row, 'expiring'));
};

export const listExpiredDocumentAlerts = async (
  filters: EmployeeAlertFilters = {},
): Promise<EmployeeAlertRecord[]> => {
  const { query, values } = buildExpiryAlertsQuery(filters, 'expired');
  const result = await pool.query(query, values);
  return result.rows.map((row) => mapExpiryAlertRow(row, 'expired'));
};

export const listEmployeeAlerts = async (
  filters: EmployeeAlertFilters = {},
): Promise<{
  summary: EmployeeAlertsSummary;
  alerts: EmployeeAlertRecord[];
}> => {
  if (filters.employee_id) {
    await initializeDefaultEmployeeDocumentAccess(filters.employee_id);
  } else {
    await pool.query(`
      INSERT INTO public.employee_document_section_access (
        employee_id,
        section_id,
        is_enabled
      )
      SELECT e.id, s.id, TRUE
      FROM public.employees e
      CROSS JOIN public.document_sections s
      WHERE e.is_active = TRUE
        AND s.is_active = TRUE
      ON CONFLICT (employee_id, section_id) DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO public.employee_document_type_access (
        employee_id,
        document_type_id,
        is_enabled
      )
      SELECT e.id, dt.id, TRUE
      FROM public.employees e
      CROSS JOIN public.document_types dt
      INNER JOIN public.document_sections s ON s.id = dt.section_id
      WHERE e.is_active = TRUE
        AND s.is_active = TRUE
        AND dt.is_active = TRUE
      ON CONFLICT (employee_id, document_type_id) DO NOTHING;
    `);
  }

  const [missing, expiring, expired] = await Promise.all([
    filters.state && filters.state !== 'missing' ? Promise.resolve([]) : listMissingExpedientAlerts(filters),
    filters.state && filters.state !== 'expiring' ? Promise.resolve([]) : listExpiringDocumentAlerts(filters),
    filters.state && filters.state !== 'expired' ? Promise.resolve([]) : listExpiredDocumentAlerts(filters),
  ]);

  const alerts = [...missing, ...expiring, ...expired];

  return {
    summary: {
      missing: missing.length,
      expiring: expiring.length,
      expired: expired.length,
      total: alerts.length,
    },
    alerts,
  };
};
