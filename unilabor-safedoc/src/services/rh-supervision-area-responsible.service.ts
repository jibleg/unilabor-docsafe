import pool from '../config/db';
import type { Queryable } from '../utils/transaction';
import { listValidAreaResponsibles, type AreaResponsibleCandidate, type ResolvedAreaResponsible } from './rh-supervision-area-responsible.rules';

// -----------------------------------------------------------------------------
// Responsable del Area: lectura de la configuracion (general, suplente y
// responsables propios por unidad) y resolucion para un evaluado. La decision
// la toma la regla pura de rh-supervision-area-responsible.rules.ts; aqui solo
// se cargan los datos. La usan la sincronizacion de borradores del ANA-REG-060
// (Fase 6) y los firmantes sugeridos del REH-REG-003 / REH-REG-008 (Fase 7).
// -----------------------------------------------------------------------------

/** Colaborador configurado como responsable, con lo que la UI necesita para advertir. */
export interface SignatoryPerson extends AreaResponsibleCandidate {
  /** Tiene usuario de sistema vinculado y activo (sin el no puede firmar en su Buzon). */
  has_user: boolean;
  /** Unidad de su propia ficha (puede no ser la unidad que avala). */
  unit_id: number | null;
  unit_name: string | null;
}

/** Firmantes configurados de un area del proceso. */
export interface AreaSignatories {
  general: SignatoryPerson | null;
  alternate: SignatoryPerson | null;
  /** unit_id -> responsable propio de la unidad (sin entrada = hereda del general). */
  units: Map<number, SignatoryPerson>;
}

/** Codigo del area del proceso (PRE, ANA, POS, ADM) -> sus firmantes. */
export type SignatoryConfig = Map<string, AreaSignatories>;

const PERSON_COLUMNS = `emp.id AS employee_id, emp.full_name, emp.is_active, COALESCE(u.is_active, FALSE) AS has_user,
            emp.branch_id, bu.name AS branch_name`;
const PERSON_JOINS = `LEFT JOIN public.users u ON u.id = emp.user_id
       LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id`;

const mapPerson = (row: any): SignatoryPerson => ({
  employee_id: Number(row.employee_id),
  name: String(row.full_name),
  is_active: Boolean(row.is_active),
  has_user: Boolean(row.has_user),
  unit_id: row.branch_id ? Number(row.branch_id) : null,
  unit_name: row.branch_name ? String(row.branch_name) : null,
});

/** Un colaborador con su estado vigente (null = no existe). */
export const loadSignatoryPerson = async (db: Queryable, employeeId: number): Promise<SignatoryPerson | null> => {
  const result = await db.query(`SELECT ${PERSON_COLUMNS} FROM public.employees emp ${PERSON_JOINS} WHERE emp.id = $1 LIMIT 1;`, [employeeId]);
  return result.rows.length > 0 ? mapPerson(result.rows[0]) : null;
};

/** El area de la configuracion, creandola vacia si aun no tiene firmantes. */
export const areaSignatoriesOf = (config: SignatoryConfig, areaKey: string): AreaSignatories => {
  const area: AreaSignatories = config.get(areaKey) ?? { general: null, alternate: null, units: new Map() };
  config.set(areaKey, area);
  return area;
};

/** Toda la configuracion de responsables del area, con el estado vigente de cada colaborador. */
export const loadSignatoryConfig = async (db: Queryable = pool): Promise<SignatoryConfig> => {
  const result = await db.query(
    `SELECT cfg.area_key, cfg.level, cfg.unit_id, ${PERSON_COLUMNS}
       FROM (
         SELECT s.area_key, 'GENERAL' AS level, NULL::bigint AS unit_id, s.area_responsible_employee_id AS employee_id
           FROM public.rh_supervision_area_signatories s
         UNION ALL
         SELECT s.area_key, 'ALTERNATE', NULL::bigint, s.alternate_employee_id
           FROM public.rh_supervision_area_signatories s
         UNION ALL
         SELECT us.area_key, 'UNIT', us.unit_id, us.area_responsible_employee_id
           FROM public.rh_supervision_unit_area_signatories us
       ) cfg
       JOIN public.employees emp ON emp.id = cfg.employee_id
       ${PERSON_JOINS};`,
  );
  const config: SignatoryConfig = new Map();
  for (const row of result.rows) {
    const area = areaSignatoriesOf(config, String(row.area_key));
    const person = mapPerson(row);
    if (String(row.level) === 'UNIT') area.units.set(Number(row.unit_id), person);
    else if (String(row.level) === 'GENERAL') area.general = person;
    else area.alternate = person;
  }
  return config;
};

/**
 * Cadena de responsables validos (unidad, general, suplente) para un
 * colaborador evaluado en un puesto: el area sale del puesto y la unidad de la
 * ficha del evaluado. Vacia = nadie valido.
 */
export const listAreaResponsiblesFor = async (positionId: number, employeeId: number): Promise<ResolvedAreaResponsible<SignatoryPerson>[]> => {
  const facts = await pool.query(
    `SELECT pa.code AS area_key, (SELECT emp.branch_id FROM public.employees emp WHERE emp.id = $2) AS unit_id
       FROM public.rh_positions rp
       LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
      WHERE rp.id = $1 LIMIT 1;`,
    [positionId, employeeId],
  );
  const row = facts.rows[0];
  if (!row?.area_key) return [];
  const config = await loadSignatoryConfig();
  return listValidAreaResponsibles(config.get(String(row.area_key)), row.unit_id ? Number(row.unit_id) : null, employeeId);
};

/** Responsable del Area para un colaborador evaluado en un puesto: el primero de la cadena. Null = nadie valido. */
export const resolveAreaResponsibleFor = async (positionId: number, employeeId: number): Promise<ResolvedAreaResponsible<SignatoryPerson> | null> =>
  (await listAreaResponsiblesFor(positionId, employeeId))[0] ?? null;
