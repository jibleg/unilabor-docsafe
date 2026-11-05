import type { PoolClient } from 'pg';
import pool from '../config/db';
import { withTransaction, type Queryable } from '../utils/transaction';
import { nextDraftAreaResponsible, resolveAreaResponsible, type AreaResponsibleSource } from './rh-supervision-area-responsible.rules';
import { loadSignatoryConfig, type SignatoryConfig } from './rh-supervision-area-responsible.service';
import type { SupervisionChecklistRecord } from './rh-supervision-checklist.service';

// -----------------------------------------------------------------------------
// Firmantes del ANA-REG-060 en la Fase 6:
//   * Supervisor / Auditor = supervisor asignado a la inscripcion (colaborador x
//     puesto), el mismo dato que imprime el REH-REG-005.
//   * Responsable del Area = el que resuelve la cadena unidad -> general ->
//     suplente para el area del proceso del puesto y la unidad de la ficha del
//     evaluado (rh-supervision-area-responsible.rules.ts).
// Las listas en BORRADOR se sincronizan con esos datos; en firma o cerradas no
// cambian (el contenido quedo congelado al enviarse a firma).
// Nadie supervisa ni avala su propia supervision.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

/** Que borradores sincronizar; sin filtros, todos. */
export interface DraftSignerFilter {
  enrollmentIds?: number[];
  checklistIds?: number[];
  /** Colaboradores evaluados. */
  employeeIds?: number[];
  /** Codigo del area del proceso del puesto. */
  areaCode?: string;
  /** Unidades de la ficha del evaluado. */
  unitIds?: number[];
}

/** Firmantes y unidad que debe tener un borrador. */
export interface DraftSignerChange {
  id: number;
  supervisor_id: number | null;
  supervisor_name: string;
  responsible_id: number | null;
  responsible_name: string;
  responsible_source: AreaResponsibleSource | null;
  branch_id: number | null;
  branch_name: string | null;
  /** Cambia la persona que firma como Responsable del Area (no solo su origen o la unidad). */
  responsible_changed: boolean;
}

const idOrNull = (value: unknown): number | null => (value ? Number(value) : null);

/**
 * Calcula, sin escribir, los borradores cuyos firmantes o unidad difieren de lo
 * que resuelve `config` (la vigente, o una hipotetica para previsualizar un cambio).
 */
export const planDraftSigners = async (db: Queryable, filter: DraftSignerFilter, config: SignatoryConfig): Promise<DraftSignerChange[]> => {
  const params: unknown[] = [];
  const clauses = [`c.status = 'DRAFT'`];
  const addIds = (ids: number[] | undefined, column: string) => {
    if (!ids || ids.length === 0) return;
    params.push(ids);
    clauses.push(`${column} = ANY($${params.length}::bigint[])`);
  };
  addIds(filter.enrollmentIds, 'c.enrollment_id');
  addIds(filter.checklistIds, 'c.id');
  addIds(filter.employeeIds, 'c.employee_id');
  addIds(filter.unitIds, 'emp.branch_id');
  if (filter.areaCode) {
    params.push(filter.areaCode);
    clauses.push(`pa.code = $${params.length}`);
  }
  const drafts = await db.query(
    `SELECT c.id, c.enrollment_id, c.employee_id, c.supervisor_employee_id, c.supervisor_name,
            c.area_responsible_employee_id, c.area_responsible_name, c.area_responsible_source, c.branch_id, c.branch_name,
            emp.branch_id AS employee_branch_id, bu.name AS employee_branch_name, pa.code AS area_code,
            e.supervisor_employee_id AS enrollment_supervisor_id, sup.full_name AS enrollment_supervisor_name
       FROM public.rh_supervision_checklists c
       JOIN public.employees emp ON emp.id = c.employee_id
       JOIN public.rh_positions rp ON rp.id = c.position_id
       LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
       LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id
       LEFT JOIN public.rh_induction_enrollments e ON e.id = c.enrollment_id
       LEFT JOIN public.employees sup ON sup.id = e.supervisor_employee_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY c.id;`,
    params,
  );
  const changes: DraftSignerChange[] = [];
  for (const row of drafts.rows) {
    const hasEnrollment = Boolean(row.enrollment_id);
    const unitId = idOrNull(row.employee_branch_id);
    const current = {
      employee_id: idOrNull(row.area_responsible_employee_id),
      name: String(row.area_responsible_name ?? ''),
      source: (row.area_responsible_source as AreaResponsibleSource | null) ?? null,
    };
    const resolved = resolveAreaResponsible(row.area_code ? config.get(String(row.area_code)) : null, unitId, Number(row.employee_id));
    const responsible = nextDraftAreaResponsible(current, hasEnrollment, resolved);
    // El supervisor de una supervision de area (sin inscripcion) se elige en la lista: no se toca.
    const currentSupervisorId = idOrNull(row.supervisor_employee_id);
    const currentSupervisorName = String(row.supervisor_name ?? '');
    const supervisorId = hasEnrollment ? idOrNull(row.enrollment_supervisor_id) : currentSupervisorId;
    const supervisorName = hasEnrollment ? String(row.enrollment_supervisor_name ?? '') : currentSupervisorName;
    const branchName = row.employee_branch_name ? String(row.employee_branch_name) : null;
    const responsibleChanged = responsible.employee_id !== current.employee_id;
    const changed =
      responsibleChanged ||
      responsible.name !== current.name ||
      responsible.source !== current.source ||
      supervisorId !== currentSupervisorId ||
      supervisorName !== currentSupervisorName ||
      unitId !== idOrNull(row.branch_id) ||
      branchName !== (row.branch_name ? String(row.branch_name) : null);
    if (changed) {
      changes.push({
        id: Number(row.id),
        supervisor_id: supervisorId,
        supervisor_name: supervisorName,
        responsible_id: responsible.employee_id,
        responsible_name: responsible.name,
        responsible_source: responsible.source,
        branch_id: unitId,
        branch_name: branchName,
        responsible_changed: responsibleChanged,
      });
    }
  }
  return changes;
};

// Llave del candado de aviso que serializa la configuracion de responsables y la
// sincronizacion de borradores (fecha y numero de la migracion que los introdujo).
const SIGNATORY_SYNC_LOCK = 2026110503;

/**
 * Serializa, hasta el fin de la transaccion, los cambios a la configuracion de
 * responsables y las sincronizaciones: sin el, una sincronizacion que leyo la
 * configuracion anterior podria escribir despues de otra que ya leyo la nueva.
 */
export const lockSignatorySync = async (client: PoolClient): Promise<void> => {
  await client.query(`SELECT pg_advisory_xact_lock($1);`, [SIGNATORY_SYNC_LOCK]);
};

const syncWithin = async (client: PoolClient, filter: DraftSignerFilter): Promise<number> => {
  await lockSignatorySync(client);
  const changes = await planDraftSigners(client, filter, await loadSignatoryConfig(client));
  if (changes.length === 0) return 0;
  const result = await client.query(
    `UPDATE public.rh_supervision_checklists c
        SET supervisor_employee_id = src.supervisor_id, supervisor_name = src.supervisor_name,
            area_responsible_employee_id = src.responsible_id, area_responsible_name = src.responsible_name,
            area_responsible_source = src.responsible_source, branch_id = src.branch_id, branch_name = src.branch_name,
            updated_at = NOW()
       FROM json_to_recordset($1::json) AS src(
              id bigint, supervisor_id bigint, supervisor_name text, responsible_id bigint, responsible_name text,
              responsible_source text, branch_id bigint, branch_name text)
      -- El estado se revalida sobre la fila destino: si la lista se envio a firma
      -- despues de calcular el cambio, sus firmantes ya quedaron congelados.
      WHERE c.id = src.id AND c.status = 'DRAFT';`,
    [JSON.stringify(changes)],
  );
  return result.rowCount ?? 0;
};

/**
 * Deja en los borradores el supervisor de su inscripcion, el Responsable del
 * Area que resuelve la configuracion vigente y la unidad de la ficha del
 * evaluado. Solo escribe los que cambian y devuelve cuantos fueron.
 *
 * `client` = transaccion ya abierta que acaba de cambiar la configuracion (la
 * sincronizacion ve ese cambio y confirma o revierte con el). No debe tener
 * tomado el candado de ninguna lista: quien lo tenga sincroniza antes de tomarlo.
 */
export const syncDraftSigners = async (filter: DraftSignerFilter = {}, client?: PoolClient): Promise<number> =>
  client ? syncWithin(client, filter) : withTransaction((tx) => syncWithin(tx, filter));

/**
 * Sincronizacion disparada desde fuera del modulo (ficha del colaborador,
 * puestos): si falla no debe tumbar esa operacion; el barrido periodico la repone.
 */
export const resyncDraftSignersQuietly = async (filter: DraftSignerFilter = {}): Promise<void> => {
  try {
    await syncDraftSigners(filter);
  } catch (error) {
    console.error('ANA-REG-060: no se pudieron re-sincronizar los firmantes de los borradores:', error);
  }
};

/** RH asigna (o quita, con null) el supervisor de una o varias inscripciones de la Fase 6. */
export const assignPhase6Supervisor = async (enrollmentIds: number[], supervisorEmployeeId: number | null): Promise<number> => {
  if (supervisorEmployeeId) {
    const supervisor = await pool.query(`SELECT id, is_active FROM public.employees WHERE id = $1 LIMIT 1;`, [supervisorEmployeeId]);
    if (!supervisor.rows[0]?.is_active) {
      throwCoded('RH_SUPERVISION_SUPERVISOR_INVALID', 'El supervisor elegido no existe o esta inactivo.');
    }
    const own = await pool.query(
      `SELECT e.id FROM public.rh_induction_enrollments e WHERE e.id = ANY($1::bigint[]) AND e.employee_id = $2 LIMIT 1;`,
      [enrollmentIds, supervisorEmployeeId],
    );
    if (own.rows.length > 0) {
      throwCoded('RH_SUPERVISION_SELF_SUPERVISION', 'Un colaborador no puede ser su propio supervisor; quitalo de la seleccion o elige a otra persona.');
    }
  }
  // Una lista en firma ya congelo a su supervisor: cambiarlo en la inscripcion la dejaria incoherente.
  const inSignature = await pool.query(
    `SELECT c.folio FROM public.rh_supervision_checklists c
      WHERE c.enrollment_id = ANY($1::bigint[]) AND c.status = 'PENDING_SIGNATURES' ORDER BY c.id LIMIT 3;`,
    [enrollmentIds],
  );
  if (inSignature.rows.length > 0) {
    throwCoded(
      'RH_SUPERVISION_IN_SIGNATURE',
      `No se cambio el supervisor: ${inSignature.rows.map((row) => String(row.folio)).join(', ')} ya esta(n) en firma. Cancela el envio a firma de la lista para reasignarlo.`,
    );
  }
  const updated = await pool.query(
    `UPDATE public.rh_induction_enrollments e
        SET supervisor_employee_id = $2, updated_at = NOW()
       FROM public.rh_induction_phases p
      WHERE e.id = ANY($1::bigint[]) AND p.id = e.phase_id AND p.phase_number = 6
      RETURNING e.id;`,
    [enrollmentIds, supervisorEmployeeId],
  );
  const ids = updated.rows.map((row) => Number(row.id));
  if (ids.length > 0) await syncDraftSigners({ enrollmentIds: ids });
  return ids.length;
};

/** Supervisor asignado y nadie firmando su propia supervision. */
export const assertIndependentSigners = (record: SupervisionChecklistRecord): void => {
  if (record.enrollment_id && !record.supervisor_employee_id) {
    throwCoded('RH_SUPERVISION_SUPERVISOR_NOT_ASSIGNED', 'Asigna el supervisor de este colaborador en el puesto (bandeja Pendientes Fase 6) antes de firmar.');
  }
  if (record.supervisor_employee_id && record.supervisor_employee_id === record.employee_id) {
    throwCoded('RH_SUPERVISION_SELF_SUPERVISION', 'El colaborador evaluado no puede ser su propio supervisor.');
  }
  if (record.area_responsible_employee_id && record.area_responsible_employee_id === record.employee_id) {
    throwCoded(
      'RH_SUPERVISION_SELF_ENDORSEMENT',
      'El colaborador evaluado es el responsable de su area; otra persona debe firmar como Responsable del Area en esta lista.',
    );
  }
};

/** Colaborador ligado al usuario de la sesion (para "Mis supervisiones" y el Buzon de firmas). */
export const resolveEmployeeIdForUser = async (userId: string): Promise<number | null> => {
  const result = await pool.query(`SELECT id FROM public.employees WHERE user_id = $1 AND is_active = TRUE LIMIT 1;`, [userId]);
  return result.rows.length > 0 ? Number(result.rows[0].id) : null;
};
