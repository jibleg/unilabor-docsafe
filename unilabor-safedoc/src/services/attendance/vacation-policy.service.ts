import pool from '../../config/db';
import { withTransaction } from '../../utils/transaction';
import { registerAuditEvent } from '../audit.service';
import { invalid, notFound } from './attendance-errors';

/** Tabla de dias de vacaciones por antiguedad (LFT 2023 por defecto). */

/** Fila 'a partir del anio N' -> dias, segun la Ley Federal del Trabajo (2023). */
export const LFT_2023_POLICY: ReadonlyArray<readonly [number, number]> = [
  [1, 12], [2, 14], [3, 16], [4, 18], [5, 20], [6, 22], [11, 24], [16, 26],
  [21, 28], [26, 30], [31, 32], [36, 34], [41, 36], [46, 38], [51, 40],
];

/** Dias que marca la Ley para un anio de antiguedad (el tramo mayor <= anio). */
export const lftDaysForYear = (seniorityYear: number): number => {
  let days = LFT_2023_POLICY[0]![1];
  for (const [fromYear, tierDays] of LFT_2023_POLICY) {
    if (fromYear <= seniorityYear) days = tierDays;
  }
  return days;
};

export interface VacationPolicyRow {
  from_seniority_year: number;
  vacation_days: number;
  law_days: number;
  differs_from_law: boolean;
}

export const toPolicyRow = (fromYear: number, vacationDays: number): VacationPolicyRow => {
  const lawDays = lftDaysForYear(fromYear);
  return {
    from_seniority_year: fromYear,
    vacation_days: vacationDays,
    law_days: lawDays,
    differs_from_law: vacationDays !== lawDays,
  };
};

export const listVacationPolicy = async (): Promise<VacationPolicyRow[]> => {
  const { rows } = await pool.query<{ from_seniority_year: number; vacation_days: string }>(
    `SELECT from_seniority_year::int AS from_seniority_year, vacation_days::text AS vacation_days
       FROM attendance.vacation_policy ORDER BY from_seniority_year`,
  );
  return rows.map((row) => toPolicyRow(row.from_seniority_year, Number(row.vacation_days)));
};

const audit = (userId: string, action: string, metadata: Record<string, unknown>) =>
  registerAuditEvent({
    user_id: userId,
    action,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_vacation_policy',
    metadata,
  }).catch(() => undefined);

export const saveVacationPolicyRow = async (
  fromYear: number,
  vacationDays: number,
  userId: string,
): Promise<VacationPolicyRow[]> => {
  await pool.query(
    `INSERT INTO attendance.vacation_policy (from_seniority_year, vacation_days) VALUES ($1, $2)
     ON CONFLICT (from_seniority_year) DO UPDATE SET vacation_days = EXCLUDED.vacation_days`,
    [fromYear, vacationDays],
  );
  await audit(userId, 'attendance_vacation_policy_saved', { from_seniority_year: fromYear, vacation_days: vacationDays });
  return listVacationPolicy();
};

export const deleteVacationPolicyRow = async (fromYear: number, userId: string): Promise<VacationPolicyRow[]> => {
  if (fromYear === 1) invalid('La fila del anio 1 no se puede borrar.');
  const result = await pool.query('DELETE FROM attendance.vacation_policy WHERE from_seniority_year = $1', [fromYear]);
  if (result.rowCount === 0) notFound('No hay una fila para ese anio de antiguedad.');
  await audit(userId, 'attendance_vacation_policy_row_deleted', { from_seniority_year: fromYear });
  return listVacationPolicy();
};

/** Restaura la tabla de la Ley (configuracion, no evidencia). */
export const resetVacationPolicy = async (userId: string): Promise<VacationPolicyRow[]> => {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM attendance.vacation_policy');
    for (const [fromYear, days] of LFT_2023_POLICY) {
      await client.query(
        'INSERT INTO attendance.vacation_policy (from_seniority_year, vacation_days) VALUES ($1, $2)',
        [fromYear, days],
      );
    }
  });
  await audit(userId, 'attendance_vacation_policy_reset', {});
  return listVacationPolicy();
};
