import type { PoolClient } from 'pg';
import pool from '../config/db';
import { withTransaction, type Queryable } from '../utils/transaction';
import { resolveAreaResponsible, type ResolvedAreaResponsibleSource } from './rh-supervision-area-responsible.rules';
import {
  areaSignatoriesOf,
  loadSignatoryConfig,
  loadSignatoryPerson,
  type SignatoryConfig,
  type SignatoryPerson,
} from './rh-supervision-area-responsible.service';
import { lockSignatorySync, planDraftSigners, syncDraftSigners } from './rh-supervision-signers.service';

// -----------------------------------------------------------------------------
// Configuracion "Firmantes por area" del ANA-REG-060:
//   * Responsable general por area del proceso (respaldo) y su suplente.
//   * Responsable propio por unidad y area (excepcion opcional sobre el general).
// Cada guardado es transaccional, valida con errores codificados (no ignora en
// silencio un area, unidad o colaborador invalido), re-sincroniza los
// borradores afectados y devuelve el antes/despues para la auditoria.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

// --- Consulta -------------------------------------------------------------------

export interface SupervisionAreaSignatory {
  /** Codigo del area del proceso (PRE, ANA, POS, ADM). */
  area_key: string;
  area_name: string;
  /** Responsable general del area: avala las listas de las unidades sin responsable propio. */
  area_responsible_employee_id: number | null;
  area_responsible_name: string;
  /** Suplente general: firma cuando el evaluado es el propio responsable general. */
  alternate_employee_id: number | null;
  alternate_name: string;
  /** Estado vigente de ambos (null = sin configurar). */
  responsible: SignatoryPerson | null;
  alternate: SignatoryPerson | null;
  /** Puestos activos que rige el area. */
  positions: number;
  /** Colaboradores activos con al menos un puesto del area. */
  employees: number;
  /** Inscripciones de Fase 6 activas sin acreditar en puestos del area. */
  phase6_pending: number;
  configured: boolean;
  /** Fase 6 (activa o en cola) del area donde el evaluado es el propio responsable general: ahi firma el suplente. */
  responsible_self_evaluations: number;
}

export interface SupervisionUnitAreaSignatory {
  area_key: string;
  area_name: string;
  /** Colaboradores activos de la unidad con al menos un puesto del area. */
  employees: number;
  phase6_pending: number;
  /** Listas en borrador (se actualizan al cambiar el responsable) y en firma (ya no cambian). */
  drafts: number;
  in_signature: number;
  /** Responsable propio de la unidad (null = hereda del general). */
  own: SignatoryPerson | null;
  /** Quien firma hoy por esta unidad y area, y de que nivel sale. */
  effective: SignatoryPerson | null;
  effective_source: ResolvedAreaResponsibleSource | null;
  /** Fase 6 (activa o en cola) de la celda donde el evaluado es el responsable efectivo: ahi firma el siguiente nivel. */
  effective_self_evaluations: number;
}

export interface SupervisionUnitSignatories {
  unit_id: number;
  unit_code: string;
  unit_name: string;
  /** Colaboradores activos con la unidad en su ficha. */
  employees: number;
  phase6_pending: number;
  areas: SupervisionUnitAreaSignatory[];
}

export interface SupervisionSignatoriesOverview {
  /** Responsable general por area (respaldo). */
  rows: SupervisionAreaSignatory[];
  /** Responsables por unidad: todas las areas de cada unidad activa. */
  units: SupervisionUnitSignatories[];
  /** Colaboradores activos sin sucursal en su ficha: usan siempre el responsable general. */
  employees_without_unit: number;
}

interface Phase6Row {
  employee_id: number;
  unit_id: number | null;
  area_key: string;
  active: boolean;
}

const cellKey = (unitId: number, areaKey: string): string => `${unitId}:${areaKey}`;

/** Inscripciones de Fase 6 sin acreditar (activas o en cola) de colaboradores activos, con su unidad y area. */
const loadPhase6Rows = async (): Promise<Phase6Row[]> => {
  const result = await pool.query(
    `SELECT e.employee_id, emp.branch_id AS unit_id, pa.code AS area_key, e.queue_status = 'ACTIVE' AS active
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
       JOIN public.employees emp ON emp.id = e.employee_id AND emp.is_active
       JOIN public.rh_positions rp ON rp.id = e.position_id
       JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.queue_status IN ('ACTIVE', 'QUEUED') AND (ea.status IS NULL OR ea.status <> 'passed');`,
  );
  return result.rows.map((row) => ({
    employee_id: Number(row.employee_id),
    unit_id: row.unit_id ? Number(row.unit_id) : null,
    area_key: String(row.area_key),
    active: Boolean(row.active),
  }));
};

/** Las areas del proceso con su responsable general, suplente y carga pendiente. */
const listAreaSignatories = async (config: SignatoryConfig, phase6: Phase6Row[]): Promise<SupervisionAreaSignatory[]> => {
  const result = await pool.query(
    `SELECT pa.code AS area_key, pa.name AS area_name,
            s.area_responsible_employee_id, COALESCE(resp.full_name, s.area_responsible_name, '') AS area_responsible_name,
            s.alternate_employee_id, COALESCE(alt.full_name, '') AS alternate_name,
            (SELECT count(*) FROM public.rh_positions rp WHERE rp.process_area_id = pa.id AND rp.is_active) AS positions,
            (SELECT count(DISTINCT ep.employee_id)
               FROM public.rh_employee_positions ep
               JOIN public.rh_positions rp ON rp.id = ep.position_id AND rp.process_area_id = pa.id
               JOIN public.employees emp ON emp.id = ep.employee_id AND emp.is_active
              WHERE ep.is_active) AS employees,
            (SELECT count(*)
               FROM public.rh_induction_enrollments e
               JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
               JOIN public.rh_positions rp ON rp.id = e.position_id AND rp.process_area_id = pa.id
               LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
              WHERE e.queue_status = 'ACTIVE' AND (ea.status IS NULL OR ea.status <> 'passed')) AS phase6_pending
       FROM public.rh_process_areas pa
       LEFT JOIN public.rh_supervision_area_signatories s ON s.area_key = pa.code
       LEFT JOIN public.employees resp ON resp.id = s.area_responsible_employee_id
       LEFT JOIN public.employees alt ON alt.id = s.alternate_employee_id
      WHERE pa.is_active
      ORDER BY pa.sort_order ASC;`,
  );
  return result.rows.map((row) => {
    const areaKey = String(row.area_key);
    const responsibleId = row.area_responsible_employee_id ? Number(row.area_responsible_employee_id) : null;
    return {
      area_key: areaKey,
      area_name: String(row.area_name),
      area_responsible_employee_id: responsibleId,
      area_responsible_name: String(row.area_responsible_name ?? ''),
      alternate_employee_id: row.alternate_employee_id ? Number(row.alternate_employee_id) : null,
      alternate_name: String(row.alternate_name ?? ''),
      responsible: config.get(areaKey)?.general ?? null,
      alternate: config.get(areaKey)?.alternate ?? null,
      positions: Number(row.positions ?? 0),
      employees: Number(row.employees ?? 0),
      phase6_pending: Number(row.phase6_pending ?? 0),
      configured: Boolean(responsibleId),
      responsible_self_evaluations: responsibleId ? phase6.filter((entry) => entry.area_key === areaKey && entry.employee_id === responsibleId).length : 0,
    };
  });
};

/** Cuenta por celda (unidad, area) a partir de filas { unit_id, area_key, total }. */
const countByCell = (rows: any[]): Map<string, number> =>
  new Map(rows.map((row) => [cellKey(Number(row.unit_id), String(row.area_key)), Number(row.total ?? 0)]));

const listUnitSignatories = async (
  config: SignatoryConfig,
  areas: SupervisionAreaSignatory[],
  phase6: Phase6Row[],
): Promise<SupervisionUnitSignatories[]> => {
  const [units, employees, lists] = await Promise.all([
    pool.query(
      `SELECT bu.id, bu.code, bu.name,
              (SELECT count(*) FROM public.employees emp WHERE emp.is_active AND emp.branch_id = bu.id) AS employees
         FROM public.helpdesk_asset_units bu
        WHERE bu.is_active
        ORDER BY bu.sort_order ASC, bu.name ASC;`,
    ),
    pool.query(
      `SELECT emp.branch_id AS unit_id, pa.code AS area_key, count(DISTINCT emp.id) AS total
         FROM public.rh_employee_positions ep
         JOIN public.rh_positions rp ON rp.id = ep.position_id
         JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
         JOIN public.employees emp ON emp.id = ep.employee_id AND emp.is_active
        WHERE ep.is_active AND emp.branch_id IS NOT NULL
        GROUP BY emp.branch_id, pa.code;`,
    ),
    pool.query(
      // Un borrador sigue a la unidad vigente de la ficha; una lista en firma, a la unidad con la que se congelo.
      `SELECT x.unit_id, x.area_key, x.status, count(*) AS total
         FROM (
           SELECT CASE WHEN c.status = 'DRAFT' THEN emp.branch_id ELSE c.branch_id END AS unit_id, pa.code AS area_key, c.status
             FROM public.rh_supervision_checklists c
             JOIN public.employees emp ON emp.id = c.employee_id
             JOIN public.rh_positions rp ON rp.id = c.position_id
             JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
            WHERE c.status IN ('DRAFT', 'PENDING_SIGNATURES')
         ) x
        WHERE x.unit_id IS NOT NULL
        GROUP BY x.unit_id, x.area_key, x.status;`,
    ),
  ]);
  const employeesByCell = countByCell(employees.rows);
  const draftsByCell = countByCell(lists.rows.filter((row) => String(row.status) === 'DRAFT'));
  const inSignatureByCell = countByCell(lists.rows.filter((row) => String(row.status) === 'PENDING_SIGNATURES'));
  return units.rows.map((unit) => {
    const unitId = Number(unit.id);
    const unitPhase6 = phase6.filter((entry) => entry.unit_id === unitId);
    return {
      unit_id: unitId,
      unit_code: String(unit.code),
      unit_name: String(unit.name),
      employees: Number(unit.employees ?? 0),
      phase6_pending: unitPhase6.filter((entry) => entry.active).length,
      areas: areas.map((area) => {
        const key = cellKey(unitId, area.area_key);
        const areaConfig = config.get(area.area_key);
        const effective = resolveAreaResponsible(areaConfig, unitId, null);
        const cellPhase6 = unitPhase6.filter((entry) => entry.area_key === area.area_key);
        return {
          area_key: area.area_key,
          area_name: area.area_name,
          employees: employeesByCell.get(key) ?? 0,
          phase6_pending: cellPhase6.filter((entry) => entry.active).length,
          drafts: draftsByCell.get(key) ?? 0,
          in_signature: inSignatureByCell.get(key) ?? 0,
          own: areaConfig?.units.get(unitId) ?? null,
          effective: effective?.candidate ?? null,
          effective_source: effective?.source ?? null,
          effective_self_evaluations: effective ? cellPhase6.filter((entry) => entry.employee_id === effective.candidate.employee_id).length : 0,
        };
      }),
    };
  });
};

/** Todo lo que muestra la pestaña "Firmantes por area". */
export const getSignatoriesOverview = async (): Promise<SupervisionSignatoriesOverview> => {
  const [config, phase6] = await Promise.all([loadSignatoryConfig(), loadPhase6Rows()]);
  const rows = await listAreaSignatories(config, phase6);
  const [units, withoutUnit] = await Promise.all([
    listUnitSignatories(config, rows, phase6),
    pool.query(`SELECT count(*) AS total FROM public.employees WHERE is_active AND branch_id IS NULL;`),
  ]);
  return { rows, units, employees_without_unit: Number(withoutUnit.rows[0]?.total ?? 0) };
};

// --- Guardado -------------------------------------------------------------------

export interface SignatoryRef {
  employee_id: number;
  name: string;
}

interface SignatoryRefChange {
  before: SignatoryRef | null;
  after: SignatoryRef | null;
}

/** Un cambio aplicado a la configuracion, con lo necesario para auditarlo. */
export interface SignatoryChange {
  scope: 'GENERAL' | 'UNIT';
  area_key: string;
  area_name: string;
  /** Solo en cambios por unidad. */
  unit_id: number | null;
  unit_name: string | null;
  /** null = ese firmante no cambio. */
  responsible: SignatoryRefChange | null;
  /** Suplente general (solo en cambios generales). */
  alternate: SignatoryRefChange | null;
  /** Borradores que tomaron otro responsable (u otro origen) por este cambio. */
  drafts_updated: number;
}

const refOf = (id: unknown, name: unknown): SignatoryRef | null => (id ? { employee_id: Number(id), name: String(name ?? '') } : null);

const requireArea = async (db: Queryable, areaKey: string): Promise<{ code: string; name: string }> => {
  const result = await db.query(`SELECT code, name FROM public.rh_process_areas WHERE code = $1 AND is_active LIMIT 1;`, [areaKey.trim().toUpperCase()]);
  if (result.rows.length === 0) {
    throwCoded('RH_SUPERVISION_AREA_NOT_FOUND', `El area del proceso "${areaKey}" no existe o esta inactiva.`);
  }
  return { code: String(result.rows[0].code), name: String(result.rows[0].name) };
};

const requireUnit = async (db: Queryable, unitId: number): Promise<{ id: number; name: string }> => {
  const result = await db.query(`SELECT id, name FROM public.helpdesk_asset_units WHERE id = $1 AND is_active LIMIT 1;`, [unitId]);
  if (result.rows.length === 0) {
    throwCoded('RH_SUPERVISION_UNIT_NOT_FOUND', `La unidad ${unitId} no existe o esta inactiva.`);
  }
  return { id: Number(result.rows[0].id), name: String(result.rows[0].name) };
};

/** Un firmante NUEVO debe existir y estar activo (el que ya estaba no se revalida: pudo darse de baja despues). */
const requireActiveSignatory = async (db: Queryable, employeeId: number | null): Promise<SignatoryRef | null> => {
  if (!employeeId) return null;
  const person = await loadSignatoryPerson(db, employeeId);
  if (!person || !person.is_active) {
    throwCoded('RH_SUPERVISION_SIGNER_INVALID', 'El colaborador elegido como firmante no existe o esta inactivo.');
  }
  return { employee_id: person!.employee_id, name: person!.name };
};

export interface AreaSignatoryInput {
  area_key: string;
  area_responsible_employee_id: number | null;
  /** undefined = no tocar el suplente; null = quitarlo. */
  alternate_employee_id?: number | null | undefined;
}

const saveAreaSignatory = async (client: PoolClient, row: AreaSignatoryInput, actorUserId: string | null): Promise<SignatoryChange | null> => {
  const area = await requireArea(client, row.area_key);
  const current = await client.query(
    `SELECT s.area_responsible_employee_id, COALESCE(resp.full_name, s.area_responsible_name) AS responsible_name,
            s.alternate_employee_id, alt.full_name AS alternate_name
       FROM public.rh_supervision_area_signatories s
       LEFT JOIN public.employees resp ON resp.id = s.area_responsible_employee_id
       LEFT JOIN public.employees alt ON alt.id = s.alternate_employee_id
      WHERE s.area_key = $1 LIMIT 1;`,
    [area.code],
  );
  const responsibleBefore = refOf(current.rows[0]?.area_responsible_employee_id, current.rows[0]?.responsible_name);
  const alternateBefore = refOf(current.rows[0]?.alternate_employee_id, current.rows[0]?.alternate_name);
  const responsibleId = row.area_responsible_employee_id;
  const alternateId = row.alternate_employee_id === undefined ? (alternateBefore?.employee_id ?? null) : row.alternate_employee_id;
  const responsibleChanged = responsibleId !== (responsibleBefore?.employee_id ?? null);
  const alternateChanged = alternateId !== (alternateBefore?.employee_id ?? null);
  if (!responsibleChanged && !alternateChanged) return null;
  if (responsibleId && responsibleId === alternateId) {
    throwCoded('RH_SUPERVISION_ALTERNATE_SAME', `En ${area.name} el suplente debe ser una persona distinta del responsable general.`);
  }
  const responsibleAfter = responsibleChanged ? await requireActiveSignatory(client, responsibleId) : responsibleBefore;
  const alternateAfter = alternateChanged ? await requireActiveSignatory(client, alternateId) : alternateBefore;
  await client.query(
    `INSERT INTO public.rh_supervision_area_signatories
       (area_key, area_name, area_responsible_employee_id, area_responsible_name, alternate_employee_id, updated_by_user_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (area_key) DO UPDATE
       SET area_name = EXCLUDED.area_name, area_responsible_employee_id = EXCLUDED.area_responsible_employee_id,
           area_responsible_name = EXCLUDED.area_responsible_name, alternate_employee_id = EXCLUDED.alternate_employee_id,
           updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW();`,
    [area.code, area.name, responsibleAfter?.employee_id ?? null, responsibleAfter?.name ?? '', alternateAfter?.employee_id ?? null, actorUserId],
  );
  return {
    scope: 'GENERAL',
    area_key: area.code,
    area_name: area.name,
    unit_id: null,
    unit_name: null,
    responsible: responsibleChanged ? { before: responsibleBefore, after: responsibleAfter } : null,
    alternate: alternateChanged ? { before: alternateBefore, after: alternateAfter } : null,
    drafts_updated: await syncDraftSigners({ areaCode: area.code }, client),
  };
};

/** Guarda el responsable general (y el suplente) de las areas indicadas. Devuelve solo lo que cambio. */
export const saveAreaSignatories = async (rows: AreaSignatoryInput[], actorUserId: string | null): Promise<SignatoryChange[]> =>
  withTransaction(async (client) => {
    await lockSignatorySync(client);
    const changes: SignatoryChange[] = [];
    for (const row of rows) {
      const change = await saveAreaSignatory(client, row, actorUserId);
      if (change) changes.push(change);
    }
    return changes;
  });

export interface UnitSignatoryInput {
  unit_id: number;
  area_key: string;
  /** null = la unidad hereda el responsable general del area. */
  area_responsible_employee_id: number | null;
}

const saveUnitSignatory = async (client: PoolClient, row: UnitSignatoryInput, actorUserId: string | null): Promise<SignatoryChange | null> => {
  const area = await requireArea(client, row.area_key);
  const unit = await requireUnit(client, row.unit_id);
  const current = await client.query(
    `SELECT us.area_responsible_employee_id, resp.full_name AS responsible_name
       FROM public.rh_supervision_unit_area_signatories us
       LEFT JOIN public.employees resp ON resp.id = us.area_responsible_employee_id
      WHERE us.unit_id = $1 AND us.area_key = $2 LIMIT 1;`,
    [unit.id, area.code],
  );
  const before = refOf(current.rows[0]?.area_responsible_employee_id, current.rows[0]?.responsible_name);
  if (row.area_responsible_employee_id === (before?.employee_id ?? null)) return null;
  const after = await requireActiveSignatory(client, row.area_responsible_employee_id);
  // Al volver a "hereda del general" la fila se conserva con el responsable en NULL (rastro de quien lo retiro).
  await client.query(
    `INSERT INTO public.rh_supervision_unit_area_signatories (unit_id, area_key, area_responsible_employee_id, updated_by_user_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (unit_id, area_key) DO UPDATE
       SET area_responsible_employee_id = EXCLUDED.area_responsible_employee_id,
           updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW();`,
    [unit.id, area.code, after?.employee_id ?? null, actorUserId],
  );
  return {
    scope: 'UNIT',
    area_key: area.code,
    area_name: area.name,
    unit_id: unit.id,
    unit_name: unit.name,
    responsible: { before, after },
    alternate: null,
    drafts_updated: await syncDraftSigners({ areaCode: area.code, unitIds: [unit.id] }, client),
  };
};

/** Guarda el responsable propio de las celdas (unidad, area) indicadas. Devuelve solo lo que cambio. */
export const saveUnitSignatories = async (rows: UnitSignatoryInput[], actorUserId: string | null): Promise<SignatoryChange[]> =>
  withTransaction(async (client) => {
    await lockSignatorySync(client);
    const changes: SignatoryChange[] = [];
    for (const row of rows) {
      const change = await saveUnitSignatory(client, row, actorUserId);
      if (change) changes.push(change);
    }
    return changes;
  });

// --- Impacto de un cambio por unidad ---------------------------------------------

export interface UnitSignatoryImpactInput {
  areaKey: string;
  unitIds: number[];
  /** Responsable propio que se quiere dejar; null = heredar el general. */
  employeeId: number | null;
}

export interface UnitSignatoryImpact {
  /** Borradores que cambiarian de Responsable del Area. */
  drafts_to_update: number;
  /** Listas en firma de esas unidades: sus firmantes quedaron congelados y no cambian. */
  in_signature_unchanged: number;
  /** Fase 6 (activa o en cola) de esas unidades donde el evaluado es el propio candidato: ahi firmaria el general o su suplente. */
  candidate_self_evaluations: number;
}

/** Previsualiza, sin guardar, el efecto de dejar a `employeeId` como responsable propio de esas unidades en el area. */
export const previewUnitSignatoryImpact = async (input: UnitSignatoryImpactInput): Promise<UnitSignatoryImpact> => {
  const area = await requireArea(pool, input.areaKey);
  const candidate = input.employeeId ? await loadSignatoryPerson(pool, input.employeeId) : null;
  if (input.employeeId && !candidate?.is_active) {
    throwCoded('RH_SUPERVISION_SIGNER_INVALID', 'El colaborador elegido como firmante no existe o esta inactivo.');
  }
  const config = await loadSignatoryConfig();
  const areaConfig = areaSignatoriesOf(config, area.code);
  for (const unitId of input.unitIds) {
    if (candidate) areaConfig.units.set(unitId, candidate);
    else areaConfig.units.delete(unitId);
  }
  const [changes, inSignature, selfEvaluations] = await Promise.all([
    planDraftSigners(pool, { areaCode: area.code, unitIds: input.unitIds }, config),
    pool.query(
      `SELECT count(*) AS total
         FROM public.rh_supervision_checklists c
         JOIN public.rh_positions rp ON rp.id = c.position_id
         JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id AND pa.code = $1
        WHERE c.status = 'PENDING_SIGNATURES' AND c.branch_id = ANY($2::bigint[]);`,
      [area.code, input.unitIds],
    ),
    pool.query(
      `SELECT count(*) AS total
         FROM public.rh_induction_enrollments e
         JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
         JOIN public.employees emp ON emp.id = e.employee_id AND emp.is_active AND emp.branch_id = ANY($2::bigint[])
         JOIN public.rh_positions rp ON rp.id = e.position_id
         JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id AND pa.code = $1
         LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
        WHERE e.employee_id = $3 AND e.queue_status IN ('ACTIVE', 'QUEUED') AND (ea.status IS NULL OR ea.status <> 'passed');`,
      [area.code, input.unitIds, input.employeeId],
    ),
  ]);
  return {
    drafts_to_update: changes.filter((change) => change.responsible_changed).length,
    in_signature_unchanged: Number(inSignature.rows[0]?.total ?? 0),
    candidate_self_evaluations: Number(selfEvaluations.rows[0]?.total ?? 0),
  };
};
