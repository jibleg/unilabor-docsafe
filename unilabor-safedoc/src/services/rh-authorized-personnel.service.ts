import pool from '../config/db';
import {
  AUTHORIZED_PERSONNEL_WARNING_DAYS,
  resolveAuthorizedPersonnelRow,
  summarizeAuthorizedPersonnel,
  type AuthorizedPersonnelRowState,
  type AuthorizedPersonnelSummary,
} from './rh-authorized-personnel.rules';
import {
  listAuthorizationLevels,
  listOrganizationalLevels,
  type RhAuthorizationLevel,
  type RhOrganizationalLevel,
} from './rh-personnel-levels.service';

/**
 * Listado de personal autorizado (REH-REG-026). No se captura: se arma con lo
 * que SafeDoc ya sabe. Una fila por colaborador activo y puesto activo; cada
 * fila se llena cuando ese puesto cierra y autoriza su REH-REG-003 (Fase 7 o
 * reevaluacion). El colaborador activo sin puesto tambien aparece (la ema pide
 * el censo completo del personal).
 */

export interface AuthorizedPersonnelRow extends AuthorizedPersonnelRowState {
  /** Consecutivo del listado (columna No.). */
  row_no: number;
  employee_id: number;
  employee_code: string;
  full_name: string;
  /** Sede = unidad de la ficha del colaborador. */
  branch_name: string | null;
  position_id: number | null;
  position_code: string | null;
  position_name: string | null;
  /** Area del proceso que rige el puesto. */
  area_name: string | null;
  organizational_level_code: string | null;
  organizational_level_name: string | null;
  status_label: string;
}

export interface AuthorizedPersonnelListing {
  /** Fecha de corte (hoy, hora del centro de Mexico). */
  cutoff_date: string;
  warning_days: number;
  rows: AuthorizedPersonnelRow[];
  summary: AuthorizedPersonnelSummary;
  authorization_levels: RhAuthorizationLevel[];
  organizational_levels: RhOrganizationalLevel[];
}

const LISTING_QUERY = `
  SELECT
    e.id AS employee_id, e.employee_code, e.full_name, bu.name AS branch_name,
    p.id AS position_id, p.code AS position_code, p.name AS position_name,
    pa.name AS area_name, ol.code AS organizational_level_code, ol.name AS organizational_level_name,
    lc.id AS evaluation_id, lc.evaluation_date, lc.dictamen, lc.authorization_result, lc.authorized_at, lc.valid_until,
    lc.authorization_level_id, lc.authorization_level_no, lc.authorization_level_name,
    EXISTS (
      SELECT 1 FROM public.rh_competency_evaluations d
       WHERE d.employee_id = e.id AND d.position_id = p.id AND d.status = 'DRAFT'
    ) AS has_draft
  FROM public.employees e
  LEFT JOIN public.helpdesk_asset_units bu ON bu.id = e.branch_id
  LEFT JOIN public.rh_employee_positions ep ON ep.employee_id = e.id AND ep.is_active = TRUE
  LEFT JOIN public.rh_positions p ON p.id = ep.position_id
  LEFT JOIN public.rh_process_areas pa ON pa.id = p.process_area_id
  LEFT JOIN public.rh_organizational_levels ol ON ol.id = p.organizational_level_id
  LEFT JOIN LATERAL (
    SELECT ev.id, ev.evaluation_date, ev.dictamen, ev.authorization_result, ev.authorized_at, ev.valid_until,
           ev.authorization_level_id, al.level_no AS authorization_level_no, al.name AS authorization_level_name
      FROM public.rh_competency_evaluations ev
      LEFT JOIN public.rh_authorization_levels al ON al.id = ev.authorization_level_id
     WHERE ev.employee_id = e.id AND ev.position_id = p.id AND ev.status = 'CLOSED'
     ORDER BY ev.closed_at DESC NULLS LAST, ev.id DESC
     LIMIT 1
  ) lc ON TRUE
  WHERE e.is_active = TRUE
  ORDER BY bu.name ASC NULLS LAST, e.full_name ASC, p.name ASC NULLS LAST;
`;

const toDateString = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

/** Hoy en la zona del laboratorio (el servidor corre en UTC). */
export const todayInMexico = (now: Date = new Date()): string =>
  now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

/** "UNILABOR CIDE" -> "CIDE": la columna SEDE del formato solo lleva la sede. */
export const toSedeLabel = (branchName: string | null): string | null => {
  if (!branchName) return null;
  const trimmed = branchName.replace(/^\s*UNILABOR\s+/i, '').trim();
  return trimmed || branchName.trim();
};

export const getAuthorizedPersonnelListing = async (now: Date = new Date()): Promise<AuthorizedPersonnelListing> => {
  const cutoff = todayInMexico(now);
  const [result, authorizationLevels, organizationalLevels] = await Promise.all([
    pool.query(LISTING_QUERY),
    listAuthorizationLevels(true),
    listOrganizationalLevels(true),
  ]);

  const rows = result.rows.map((row, index): AuthorizedPersonnelRow => {
    const hasPosition = row.position_id !== null && row.position_id !== undefined;
    const state = resolveAuthorizedPersonnelRow(
      {
        hasPosition,
        hasDraft: Boolean(row.has_draft),
        latestClosed: row.evaluation_id
          ? {
              id: Number(row.evaluation_id),
              evaluation_date: toDateString(row.evaluation_date) ?? '',
              dictamen: row.dictamen ? String(row.dictamen) : null,
              authorization_result: row.authorization_result ? String(row.authorization_result) : null,
              authorized_at: toDateString(row.authorized_at),
              valid_until: toDateString(row.valid_until),
              authorization_level_id: row.authorization_level_id ? Number(row.authorization_level_id) : null,
              authorization_level_no: row.authorization_level_no ? Number(row.authorization_level_no) : null,
              authorization_level_name: row.authorization_level_name ? String(row.authorization_level_name) : null,
            }
          : null,
      },
      cutoff,
    );
    return {
      row_no: index + 1,
      employee_id: Number(row.employee_id),
      employee_code: String(row.employee_code),
      full_name: String(row.full_name),
      branch_name: toSedeLabel(row.branch_name ? String(row.branch_name) : null),
      position_id: hasPosition ? Number(row.position_id) : null,
      position_code: row.position_code ? String(row.position_code) : null,
      position_name: row.position_name ? String(row.position_name) : null,
      area_name: row.area_name ? String(row.area_name) : null,
      organizational_level_code: row.organizational_level_code ? String(row.organizational_level_code) : null,
      organizational_level_name: row.organizational_level_name ? String(row.organizational_level_name) : null,
      status_label: 'Activo',
      ...state,
    };
  });

  return {
    cutoff_date: cutoff,
    warning_days: AUTHORIZED_PERSONNEL_WARNING_DAYS,
    rows,
    summary: summarizeAuthorizedPersonnel(rows),
    authorization_levels: authorizationLevels,
    organizational_levels: organizationalLevels,
  };
};
