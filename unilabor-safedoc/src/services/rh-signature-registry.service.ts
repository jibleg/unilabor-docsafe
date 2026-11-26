import pool from '../config/db';
import { getPositionOtherAuthorizations, OTHER_AUTHORIZATIONS_ITEM_NO } from './rh-assignment-letter.service';
import { AUTHORIZED_PERSONNEL_WARNING_DAYS, resolveAuthorizedPersonnelRow, type AuthorizedPersonnelRowState } from './rh-authorized-personnel.rules';
import { getAuthorizedPersonnelListing, toSedeLabel, todayInMexico, type AuthorizedPersonnelRow } from './rh-authorized-personnel.service';
import { listAuthorizationLevels, type RhAuthorizationLevel } from './rh-personnel-levels.service';
import { proposeSigningScope, resolveSignatureRegistryStatus, type SignatureRegistryStatus, type SignatureRegistryStatusResult } from './rh-signature-registry.rules';
import { loadActiveSpecimensByEmployee, type SignatureSpecimenSummary } from './rh-signature-specimen.service';

/**
 * Registro de firmas autorizadas (REH-REG-027). Se deriva del Listado de
 * personal autorizado (REH-REG-026): una fila por colaborador y puesto
 * AUTORIZADO en su ultimo REH-REG-003 cerrado, mas las filas historicas
 * (colaborador de baja o puesto terminado que tuvo esa autorizacion). RH solo
 * captura la disciplina, si es responsable de ella, el alcance de firma y los
 * especimenes; lo demas sale de la carta REH-REG-008 y del REH-REG-003.
 */

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

export interface RhDiscipline {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface SignatureRegistryRow extends SignatureRegistryStatusResult {
  /** Consecutivo del registro (columna No.). */
  row_no: number;
  employee_id: number;
  employee_code: string;
  full_name: string;
  branch_name: string | null;
  position_id: number;
  position_code: string;
  position_name: string;
  area_name: string | null;
  employee_active: boolean;
  position_active: boolean;
  /** Fila historica: colaborador de baja o puesto terminado. */
  retired: boolean;
  discipline_id: number | null;
  discipline_name: string | null;
  is_discipline_responsible: boolean;
  signing_scope_text: string | null;
  notes: string | null;
  /** Nivel de autorizacion del REH-REG-026 (elegido al autorizar el REH-REG-003). */
  authorization_level_id: number | null;
  authorization_level_no: number | null;
  authorization_level_name: string | null;
  /** Carta REH-REG-008 cerrada y vigente del puesto (fecha de alta). */
  letter_id: number | null;
  letter_folio: string | null;
  start_date: string | null;
  evaluation_id: number | null;
  last_evaluation_date: string | null;
  valid_until: string | null;
  /** Fecha de baja (fila historica) o del cambio de alcance (carta que sustituyo a otra). */
  end_or_change_date: string | null;
  end_or_change_kind: 'BAJA' | 'CAMBIO_ALCANCE' | null;
  signature_specimen: SignatureSpecimenSummary | null;
  initials_specimen: SignatureSpecimenSummary | null;
}

export interface SignatureRegistrySummary {
  rows_total: number;
  people_total: number;
  active_rows: number;
  retired_rows: number;
  by_status: Record<SignatureRegistryStatus, number>;
}

export interface SignatureRegistryListing {
  cutoff_date: string;
  warning_days: number;
  rows: SignatureRegistryRow[];
  summary: SignatureRegistrySummary;
  disciplines: RhDiscipline[];
  /** Catalogo de niveles de autorizacion (activos e inactivos), para el filtro. */
  authorization_levels: RhAuthorizationLevel[];
}

/** Clave de fila que comparte la pantalla con el PDF filtrado. */
export const signatureRegistryRowKey = (row: Pick<SignatureRegistryRow, 'employee_id' | 'position_id'>): string => `${row.employee_id}:${row.position_id}`;

const toDateString = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

export const summarizeSignatureRegistry = (rows: SignatureRegistryRow[]): SignatureRegistrySummary => {
  const byStatus: Record<SignatureRegistryStatus, number> = { DADA_DE_BAJA: 0, INCOMPLETA: 0, SIN_EVALUACION: 0, VENCIDA: 0, POR_VENCER: 0, VIGENTE: 0 };
  for (const row of rows) byStatus[row.status] += 1;
  return {
    rows_total: rows.length,
    people_total: new Set(rows.map((row) => row.employee_id)).size,
    active_rows: rows.filter((row) => !row.retired).length,
    retired_rows: rows.filter((row) => row.retired).length,
    by_status: byStatus,
  };
};

/** Deja solo las filas elegidas (las que muestra la pantalla), renumeradas y con el resumen recalculado. */
export const filterSignatureRegistryListing = (listing: SignatureRegistryListing, keys: string[]): SignatureRegistryListing => {
  const wanted = new Set(keys);
  const rows = listing.rows.filter((row) => wanted.has(signatureRegistryRowKey(row))).map((row, index) => ({ ...row, row_no: index + 1 }));
  return { ...listing, rows, summary: summarizeSignatureRegistry(rows) };
};

// --- Disciplinas ----------------------------------------------------------------

const mapDiscipline = (row: any): RhDiscipline => ({
  id: Number(row.id),
  code: String(row.code),
  name: String(row.name),
  sort_order: Number(row.sort_order ?? 0),
  is_active: Boolean(row.is_active),
});

export const listDisciplines = async (includeInactive = false): Promise<RhDiscipline[]> => {
  const result = await pool.query(
    `SELECT id, code, name, sort_order, is_active FROM public.rh_disciplines
      ${includeInactive ? '' : 'WHERE is_active = TRUE'}
      ORDER BY sort_order ASC, name ASC;`,
  );
  return result.rows.map(mapDiscipline);
};

export interface DisciplinePayload {
  name: string;
  is_active?: boolean | undefined;
}

/** Clave estable a partir del nombre: sin acentos, mayusculas y guiones bajos. */
const codeFromName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'DISCIPLINA';

export const createDiscipline = async (payload: DisciplinePayload): Promise<RhDiscipline> => {
  const name = payload.name.trim();
  const code = codeFromName(name);
  const taken = await pool.query(`SELECT 1 FROM public.rh_disciplines WHERE UPPER(code) = $1 OR LOWER(name) = LOWER($2) LIMIT 1;`, [code, name]);
  if (taken.rows.length > 0) return throwCoded('RH_DISCIPLINE_TAKEN', 'Ya existe una disciplina con ese nombre.');
  const result = await pool.query(
    `INSERT INTO public.rh_disciplines (code, name, sort_order, is_active)
     VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.rh_disciplines), $3)
     RETURNING id, code, name, sort_order, is_active;`,
    [code, name, payload.is_active ?? true],
  );
  return mapDiscipline(result.rows[0]);
};

export const updateDiscipline = async (id: number, payload: DisciplinePayload): Promise<RhDiscipline> => {
  const name = payload.name.trim();
  const taken = await pool.query(`SELECT 1 FROM public.rh_disciplines WHERE LOWER(name) = LOWER($2) AND id <> $1 LIMIT 1;`, [id, name]);
  if (taken.rows.length > 0) return throwCoded('RH_DISCIPLINE_TAKEN', 'Ya existe una disciplina con ese nombre.');
  const result = await pool.query(
    `UPDATE public.rh_disciplines SET name = $2, is_active = COALESCE($3, is_active), updated_at = NOW()
      WHERE id = $1 RETURNING id, code, name, sort_order, is_active;`,
    [id, name, payload.is_active ?? null],
  );
  if (result.rows.length === 0) return throwCoded('RH_DISCIPLINE_NOT_FOUND', 'La disciplina no existe.');
  return mapDiscipline(result.rows[0]);
};

// --- Filas historicas -----------------------------------------------------------

/**
 * Colaborador x puesto que ya no esta en el REH-REG-026 (puesto terminado o
 * colaborador de baja) y cuyo ultimo REH-REG-003 cerrado quedo autorizado. La
 * fecha de baja es la del puesto; si el colaborador causo baja con el puesto
 * aun activo, la ultima actualizacion de su ficha (la baja la actualiza).
 */
const HISTORICAL_QUERY = `
  SELECT DISTINCT ON (e.id, p.id)
    e.id AS employee_id, e.employee_code, e.full_name, e.is_active AS employee_active, e.updated_at AS employee_updated_at,
    bu.name AS branch_name,
    p.id AS position_id, p.code AS position_code, p.name AS position_name, pa.name AS area_name,
    ep.is_active AS position_active, ep.ended_at,
    lc.id AS evaluation_id, lc.evaluation_date, lc.dictamen, lc.authorization_result, lc.authorized_at, lc.valid_until,
    lc.authorization_level_id, lc.authorization_level_no, lc.authorization_level_name
  FROM public.rh_employee_positions ep
  JOIN public.employees e ON e.id = ep.employee_id
  JOIN public.rh_positions p ON p.id = ep.position_id
  LEFT JOIN public.helpdesk_asset_units bu ON bu.id = e.branch_id
  LEFT JOIN public.rh_process_areas pa ON pa.id = p.process_area_id
  JOIN LATERAL (
    SELECT ev.id, ev.evaluation_date, ev.dictamen, ev.authorization_result, ev.authorized_at, ev.valid_until,
           ev.authorization_level_id, al.level_no AS authorization_level_no, al.name AS authorization_level_name
      FROM public.rh_competency_evaluations ev
      LEFT JOIN public.rh_authorization_levels al ON al.id = ev.authorization_level_id
     WHERE ev.employee_id = e.id AND ev.position_id = p.id AND ev.status = 'CLOSED'
     ORDER BY ev.closed_at DESC NULLS LAST, ev.id DESC
     LIMIT 1
  ) lc ON TRUE
  WHERE (ep.is_active = FALSE OR e.is_active = FALSE)
  ORDER BY e.id, p.id, ep.is_active DESC, ep.ended_at DESC NULLS LAST;
`;

interface BaseRow {
  employee_id: number;
  employee_code: string;
  full_name: string;
  branch_name: string | null;
  position_id: number;
  position_code: string;
  position_name: string;
  area_name: string | null;
  employee_active: boolean;
  position_active: boolean;
  end_date: string | null;
  state: AuthorizedPersonnelRowState;
}

const fromCurrent = (row: AuthorizedPersonnelRow): BaseRow => ({
  employee_id: row.employee_id,
  employee_code: row.employee_code,
  full_name: row.full_name,
  branch_name: row.branch_name,
  position_id: row.position_id!,
  position_code: row.position_code ?? '',
  position_name: row.position_name ?? '',
  area_name: row.area_name,
  employee_active: true,
  position_active: true,
  end_date: null,
  state: row,
});

const loadHistoricalRows = async (cutoff: string, exclude: Set<string>): Promise<BaseRow[]> => {
  const result = await pool.query(HISTORICAL_QUERY);
  const rows: BaseRow[] = [];
  for (const row of result.rows) {
    const key = `${row.employee_id}:${row.position_id}`;
    if (exclude.has(key)) continue;
    const state = resolveAuthorizedPersonnelRow(
      {
        hasPosition: true,
        hasDraft: false,
        latestClosed: {
          id: Number(row.evaluation_id),
          evaluation_date: toDateString(row.evaluation_date) ?? '',
          dictamen: row.dictamen ? String(row.dictamen) : null,
          authorization_result: row.authorization_result ? String(row.authorization_result) : null,
          authorized_at: toDateString(row.authorized_at),
          valid_until: toDateString(row.valid_until),
          authorization_level_id: row.authorization_level_id ? Number(row.authorization_level_id) : null,
          authorization_level_no: row.authorization_level_no ? Number(row.authorization_level_no) : null,
          authorization_level_name: row.authorization_level_name ? String(row.authorization_level_name) : null,
        },
      },
      cutoff,
    );
    if (state.authorized !== true) continue;
    const employeeActive = Boolean(row.employee_active);
    rows.push({
      employee_id: Number(row.employee_id),
      employee_code: String(row.employee_code),
      full_name: String(row.full_name),
      branch_name: toSedeLabel(row.branch_name ? String(row.branch_name) : null),
      position_id: Number(row.position_id),
      position_code: String(row.position_code),
      position_name: String(row.position_name),
      area_name: row.area_name ? String(row.area_name) : null,
      employee_active: employeeActive,
      position_active: Boolean(row.position_active),
      end_date: toDateString(row.ended_at) ?? (employeeActive ? null : toDateString(row.employee_updated_at)),
      state,
    });
  }
  return rows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'es') || a.position_name.localeCompare(b.position_name, 'es'));
};

// --- Datos complementarios ------------------------------------------------------

interface LetterInfo {
  id: number;
  folio: string | null;
  start_date: string | null;
  /** Fecha en que esta carta sustituyo a otra (cambio de alcance); null si es la primera. */
  replaced_at: string | null;
}

/** Carta cerrada y vigente (no sustituida) de cada colaborador x puesto. */
const loadClosedLetters = async (): Promise<Map<string, LetterInfo>> => {
  const result = await pool.query(
    `SELECT DISTINCT ON (l.employee_id, l.position_id)
            l.id, l.employee_id, l.position_id, l.folio, l.letter_date, l.closed_at,
            (SELECT MAX(COALESCE(prev.superseded_at, l.closed_at)) FROM public.rh_assignment_letters prev WHERE prev.superseded_by_letter_id = l.id) AS replaced_at
       FROM public.rh_assignment_letters l
      WHERE l.status = 'CLOSED' AND l.superseded_by_letter_id IS NULL
      ORDER BY l.employee_id, l.position_id, l.closed_at DESC NULLS LAST, l.id DESC;`,
  );
  const map = new Map<string, LetterInfo>();
  for (const row of result.rows) {
    map.set(`${row.employee_id}:${row.position_id}`, {
      id: Number(row.id),
      folio: row.folio ? String(row.folio) : null,
      start_date: toDateString(row.letter_date) ?? toDateString(row.closed_at),
      replaced_at: toDateString(row.replaced_at),
    });
  }
  return map;
};

interface AuthorizationInfo {
  discipline_id: number | null;
  discipline_name: string | null;
  is_discipline_responsible: boolean;
  signing_scope_text: string | null;
  notes: string | null;
}

const loadAuthorizations = async (): Promise<Map<string, AuthorizationInfo>> => {
  const result = await pool.query(
    `SELECT a.employee_id, a.position_id, a.discipline_id, d.name AS discipline_name, a.is_discipline_responsible, a.signing_scope_text, a.notes
       FROM public.rh_signature_authorizations a
       LEFT JOIN public.rh_disciplines d ON d.id = a.discipline_id;`,
  );
  const map = new Map<string, AuthorizationInfo>();
  for (const row of result.rows) {
    map.set(`${row.employee_id}:${row.position_id}`, {
      discipline_id: row.discipline_id ? Number(row.discipline_id) : null,
      discipline_name: row.discipline_name ? String(row.discipline_name) : null,
      is_discipline_responsible: Boolean(row.is_discipline_responsible),
      signing_scope_text: row.signing_scope_text ? String(row.signing_scope_text) : null,
      notes: row.notes ? String(row.notes) : null,
    });
  }
  return map;
};

// --- Listado -------------------------------------------------------------------

export const getSignatureRegistryListing = async (now: Date = new Date()): Promise<SignatureRegistryListing> => {
  const cutoff = todayInMexico(now);
  const current = (await getAuthorizedPersonnelListing(now)).rows.filter((row) => row.authorized === true && row.position_id !== null).map(fromCurrent);
  const currentKeys = new Set(current.map((row) => `${row.employee_id}:${row.position_id}`));
  const [historical, letters, authorizations, specimens, disciplines, authorizationLevels] = await Promise.all([
    loadHistoricalRows(cutoff, currentKeys),
    loadClosedLetters(),
    loadAuthorizations(),
    loadActiveSpecimensByEmployee(),
    listDisciplines(true),
    listAuthorizationLevels(true),
  ]);

  const rows = [...current, ...historical].map((base, index): SignatureRegistryRow => {
    const key = `${base.employee_id}:${base.position_id}`;
    const letter = letters.get(key) ?? null;
    const authorization = authorizations.get(key) ?? null;
    const employeeSpecimens = specimens.get(base.employee_id);
    const signature = employeeSpecimens?.FIRMA ?? null;
    const initials = employeeSpecimens?.RUBRICA ?? null;
    const retired = !base.employee_active || !base.position_active;
    const status = resolveSignatureRegistryStatus(
      {
        retired,
        hasPosition: true,
        hasScope: Boolean(authorization?.signing_scope_text),
        hasSignatureSpecimen: signature !== null,
        startDate: letter?.start_date ?? null,
        lastEvaluationDate: base.state.last_evaluation_date,
        validUntil: base.state.valid_until,
      },
      cutoff,
    );
    const endOrChange: Pick<SignatureRegistryRow, 'end_or_change_date' | 'end_or_change_kind'> = retired
      ? { end_or_change_date: base.end_date, end_or_change_kind: 'BAJA' }
      : letter?.replaced_at
        ? { end_or_change_date: letter.replaced_at, end_or_change_kind: 'CAMBIO_ALCANCE' }
        : { end_or_change_date: null, end_or_change_kind: null };
    return {
      row_no: index + 1,
      employee_id: base.employee_id,
      employee_code: base.employee_code,
      full_name: base.full_name,
      branch_name: base.branch_name,
      position_id: base.position_id,
      position_code: base.position_code,
      position_name: base.position_name,
      area_name: base.area_name,
      employee_active: base.employee_active,
      position_active: base.position_active,
      retired,
      discipline_id: authorization?.discipline_id ?? null,
      discipline_name: authorization?.discipline_name ?? null,
      is_discipline_responsible: authorization?.is_discipline_responsible ?? false,
      signing_scope_text: authorization?.signing_scope_text ?? null,
      notes: authorization?.notes ?? null,
      authorization_level_id: base.state.authorization_level_id,
      authorization_level_no: base.state.authorization_level_no,
      authorization_level_name: base.state.authorization_level_name,
      letter_id: letter?.id ?? null,
      letter_folio: letter?.folio ?? null,
      start_date: letter?.start_date ?? null,
      evaluation_id: base.state.evaluation_id,
      last_evaluation_date: base.state.last_evaluation_date,
      valid_until: base.state.valid_until,
      ...endOrChange,
      signature_specimen: signature,
      initials_specimen: initials,
      ...status,
    };
  });

  return {
    cutoff_date: cutoff,
    warning_days: AUTHORIZED_PERSONNEL_WARNING_DAYS,
    rows,
    summary: summarizeSignatureRegistry(rows),
    disciplines,
    authorization_levels: authorizationLevels,
  };
};

// --- Captura por fila ----------------------------------------------------------

export interface SignatureAuthorizationInput {
  discipline_id: number | null;
  is_discipline_responsible: boolean;
  signing_scope_text: string | null;
  notes: string | null;
}

const assertEmployeePosition = async (employeeId: number, positionId: number): Promise<void> => {
  const result = await pool.query(`SELECT 1 FROM public.rh_employee_positions WHERE employee_id = $1 AND position_id = $2 LIMIT 1;`, [employeeId, positionId]);
  if (result.rows.length === 0) throwCoded('RH_SIGNATURE_ROW_NOT_FOUND', 'El colaborador no ha tenido ese puesto.');
};

export const saveSignatureAuthorization = async (employeeId: number, positionId: number, input: SignatureAuthorizationInput, userId: string): Promise<AuthorizationInfo> => {
  await assertEmployeePosition(employeeId, positionId);
  if (input.discipline_id !== null) {
    const discipline = await pool.query(`SELECT 1 FROM public.rh_disciplines WHERE id = $1 LIMIT 1;`, [input.discipline_id]);
    if (discipline.rows.length === 0) throwCoded('RH_DISCIPLINE_NOT_FOUND', 'La disciplina no existe.');
  }
  const result = await pool.query(
    `INSERT INTO public.rh_signature_authorizations
       (employee_id, position_id, discipline_id, is_discipline_responsible, signing_scope_text, notes, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (employee_id, position_id) DO UPDATE
       SET discipline_id = EXCLUDED.discipline_id, is_discipline_responsible = EXCLUDED.is_discipline_responsible,
           signing_scope_text = EXCLUDED.signing_scope_text, notes = EXCLUDED.notes,
           updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()
     RETURNING discipline_id, is_discipline_responsible, signing_scope_text, notes,
               (SELECT name FROM public.rh_disciplines d WHERE d.id = rh_signature_authorizations.discipline_id) AS discipline_name;`,
    [employeeId, positionId, input.discipline_id, input.is_discipline_responsible, input.signing_scope_text?.trim() || null, input.notes?.trim() || null, userId],
  );
  const row = result.rows[0];
  return {
    discipline_id: row.discipline_id ? Number(row.discipline_id) : null,
    discipline_name: row.discipline_name ? String(row.discipline_name) : null,
    is_discipline_responsible: Boolean(row.is_discipline_responsible),
    signing_scope_text: row.signing_scope_text ? String(row.signing_scope_text) : null,
    notes: row.notes ? String(row.notes) : null,
  };
};

export interface SigningScopeProposal {
  /** null = la carta no autoriza nada que deje firma (o no hay carta). */
  text: string | null;
  letter_id: number | null;
  letter_folio: string | null;
  letter_status: 'CLOSED' | 'DRAFT' | null;
}

/**
 * Propone el alcance de firma con los Si de la carta REH-REG-008 del puesto: la
 * cerrada y vigente; si aun no hay, el borrador en curso. Sin carta, sin texto.
 */
export const proposeSigningScopeForRow = async (employeeId: number, positionId: number): Promise<SigningScopeProposal> => {
  await assertEmployeePosition(employeeId, positionId);
  const letter = await pool.query(
    `SELECT id, folio, status, other_authorizations
       FROM public.rh_assignment_letters
      WHERE employee_id = $1 AND position_id = $2 AND superseded_by_letter_id IS NULL
      ORDER BY (status = 'CLOSED') DESC, closed_at DESC NULLS LAST, id DESC
      LIMIT 1;`,
    [employeeId, positionId],
  );
  const row = letter.rows[0];
  if (!row) return { text: null, letter_id: null, letter_folio: null, letter_status: null };
  const items = await pool.query(
    `SELECT i.item_no, i.item_text, li.authorized
       FROM public.rh_assignment_letter_items li
       JOIN public.rh_assignment_authorization_items i ON i.id = li.item_id
      WHERE li.letter_id = $1;`,
    [Number(row.id)],
  );
  // La carta guarda su propio texto de "Otras"; si no lo tiene, vale el del puesto.
  const otherAuthorizations = row.other_authorizations ? String(row.other_authorizations) : await getPositionOtherAuthorizations(positionId);
  return {
    text: proposeSigningScope({
      items: items.rows.map((item) => ({ item_no: Number(item.item_no), item_text: String(item.item_text), authorized: Boolean(item.authorized) })),
      otherAuthorizations,
      otherItemNo: OTHER_AUTHORIZATIONS_ITEM_NO,
    }),
    letter_id: Number(row.id),
    letter_folio: row.folio ? String(row.folio) : null,
    letter_status: String(row.status) === 'CLOSED' ? 'CLOSED' : 'DRAFT',
  };
};
