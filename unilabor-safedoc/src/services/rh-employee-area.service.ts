import type { PoolClient } from 'pg';
import pool from '../config/db';

/**
 * Catalogo de secciones / departamentos del colaborador (rh_employee_areas). employees.area solo
 * guarda nombres de este catalogo: se elige de una lista con buscador y el
 * backend traduce cualquier captura ("validacion") al nombre oficial
 * ("VALIDACIÓN") o la rechaza si no existe.
 */
export interface EmployeeArea {
  id: number;
  name: string;
  employees: number;
}

const collapse = (value: string): string => value.trim().replace(/\s+/g, ' ');

/** Clave de comparacion: sin mayusculas, acentos ni espacios dobles (igual que la migracion 20261030_01). */
export const areaKey = (value: string): string =>
  collapse(value)
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u');

const codedError = (code: string, message: string, extra: Record<string, unknown> = {}) => {
  const error = new Error(message) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = message;
  Object.assign(error, extra);
  return error;
};

export const listEmployeeAreas = async (): Promise<EmployeeArea[]> => {
  const result = await pool.query(
    `SELECT a.id, a.name,
            (SELECT COUNT(*)::int FROM public.employees e WHERE e.area = a.name AND e.is_active = TRUE) AS employees
       FROM public.rh_employee_areas a
      WHERE a.is_active = TRUE
      ORDER BY a.name ASC;`,
  );
  return result.rows.map((row) => ({ id: Number(row.id), name: String(row.name), employees: Number(row.employees ?? 0) }));
};

/** Alta de un area nueva: se guarda en MAYUSCULAS; si ya existe (aunque cambien acentos o mayusculas) se rechaza. */
export const createEmployeeArea = async (rawName: string, actorUserId: string | null): Promise<EmployeeArea> => {
  const name = collapse(rawName).toLocaleUpperCase('es-MX');
  if (name.length < 2 || name.length > 80) {
    throw codedError('EMPLOYEE_AREA_INVALID', 'El nombre de la seccion debe tener entre 2 y 80 caracteres.');
  }
  const key = areaKey(name);
  const existing = await pool.query(`SELECT id, name, is_active FROM public.rh_employee_areas WHERE name_key = $1 LIMIT 1;`, [key]);
  const found = existing.rows[0];
  if (found?.is_active) {
    throw codedError('EMPLOYEE_AREA_DUPLICATED', `Ya existe la seccion "${found.name}"; eligela de la lista.`, { existing_name: String(found.name) });
  }
  const result = found
    ? await pool.query(`UPDATE public.rh_employee_areas SET is_active = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, name;`, [found.id])
    : await pool.query(
        `INSERT INTO public.rh_employee_areas (name, name_key, created_by_user_id) VALUES ($1, $2, $3) RETURNING id, name;`,
        [name, key, actorUserId],
      );
  return { id: Number(result.rows[0].id), name: String(result.rows[0].name), employees: 0 };
};

/**
 * Traduce el area capturada al nombre oficial del catalogo. Vacio = sin area.
 * `currentArea` permite conservar el valor que el colaborador ya tenia aunque
 * no este en el catalogo (registros previos a la normalizacion).
 */
export const resolveEmployeeAreaName = async (
  client: PoolClient,
  rawArea: unknown,
  currentArea: string | null = null,
): Promise<string | null> => {
  if (rawArea === null || rawArea === undefined) return null;
  const text = collapse(String(rawArea));
  if (!text) return null;
  if (currentArea && text === currentArea) return currentArea;
  const result = await client.query(`SELECT name FROM public.rh_employee_areas WHERE name_key = $1 AND is_active = TRUE LIMIT 1;`, [
    areaKey(text),
  ]);
  if (result.rows.length === 0) {
    throw codedError('EMPLOYEE_AREA_NOT_IN_CATALOG', `La seccion "${text}" no esta en el catalogo. Eligela de la lista o agregala como seccion nueva.`);
  }
  return String(result.rows[0].name);
};
