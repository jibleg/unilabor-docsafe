import pool from '../../config/db';
import { withTransaction, type Queryable } from '../../utils/transaction';
import { getAttendanceSettings } from './attendance-settings.service';
import { distribuirTomados, planPeriods, type PolicyRow } from './engine/vacations';
import { todayInZone } from './timezone';

/**
 * Periodos de vacaciones por aniversario: apertura (upsert), reparto de los
 * dias tomados y aplicacion de la tabla de politica a los periodos vigentes.
 */

export const loadVacationPolicy = async (db: Queryable = pool): Promise<PolicyRow[]> => {
  const { rows } = await db.query<{ from_seniority_year: number; vacation_days: number }>(
    'SELECT from_seniority_year, vacation_days::float8 AS vacation_days FROM attendance.vacation_policy ORDER BY from_seniority_year',
  );
  return rows.map((row) => ({ fromSeniorityYear: row.from_seniority_year, vacationDays: row.vacation_days }));
};

/** Hoy en la zona horaria configurada. */
export const attendanceToday = async (): Promise<string> => todayInZone((await getAttendanceSettings()).timezone);

/** UPSERT de los periodos de un colaborador. Conflicto: solo fechas, NO pisa days_entitled. Devuelve cuantos toco. */
const upsertPeriodsFor = async (
  db: Queryable,
  employeeId: number,
  hireDate: string,
  today: string,
  validityMonths: number,
  policy: readonly PolicyRow[],
): Promise<number> => {
  const plans = planPeriods(hireDate, today, validityMonths, policy);
  if (plans.length === 0) return 0;
  await db.query(
    `INSERT INTO attendance.vacation_periods
       (employee_id, seniority_year, period_start_date, period_due_date, days_entitled)
     SELECT $1, v.year, v.start_date, v.due_date, v.days
       FROM unnest($2::int[], $3::date[], $4::date[], $5::numeric[]) AS v(year, start_date, due_date, days)
     ON CONFLICT (employee_id, seniority_year) DO UPDATE
       SET period_start_date = EXCLUDED.period_start_date,
           period_due_date = EXCLUDED.period_due_date`,
    [
      employeeId,
      plans.map((plan) => plan.seniorityYear),
      plans.map((plan) => plan.startDate),
      plans.map((plan) => plan.dueDate),
      plans.map((plan) => plan.daysEntitled),
    ],
  );
  return plans.length;
};

/** Abre/actualiza los periodos de UN colaborador (con fecha de ingreso). Devuelve cuantos toco. */
export const openVacationPeriodsForEmployee = async (employeeId: number, today?: string): Promise<number> => {
  const [settings, policy, effectiveToday] = await Promise.all([
    getAttendanceSettings(),
    loadVacationPolicy(),
    today ? Promise.resolve(today) : attendanceToday(),
  ]);
  const { rows } = await pool.query<{ hire_date: string | null }>(
    'SELECT hire_date::text AS hire_date FROM public.employees WHERE id = $1',
    [employeeId],
  );
  const hireDate = rows[0]?.hire_date;
  if (!hireDate) return 0;
  return upsertPeriodsFor(pool, employeeId, hireDate, effectiveToday, settings.vacation_validity_months, policy);
};

/** Abre/actualiza los periodos de todos los colaboradores habilitados con fecha de ingreso. Devuelve cuantos periodos toco. */
export const openVacationPeriodsForAll = async (today: string): Promise<number> => {
  const [settings, policy] = await Promise.all([getAttendanceSettings(), loadVacationPolicy()]);
  const { rows } = await pool.query<{ id: string; hire_date: string }>(
    `SELECT e.id::text, e.hire_date::text AS hire_date
       FROM public.employees e
       JOIN attendance.employee_profiles p ON p.employee_id = e.id AND p.is_enabled
      WHERE e.is_active AND e.hire_date IS NOT NULL
      ORDER BY e.id`,
  );
  let touched = 0;
  for (const row of rows) {
    touched += await upsertPeriodsFor(pool, Number(row.id), row.hire_date, today, settings.vacation_validity_months, policy);
  }
  return touched;
};

/** Recalcula los dias tomados (reparto del mas antiguo al mas nuevo) de un colaborador a partir de sus incidencias autorizadas. */
export const recalculateVacationDaysTaken = async (employeeId: number): Promise<void> => {
  const today = await attendanceToday();
  await withTransaction(async (client) => {
    const periods = await client.query<{
      id: string;
      days_entitled: number;
      days_adjustment: number;
      days_taken: number;
      expired: boolean;
    }>(
      `SELECT id::text, days_entitled::float8, days_adjustment::float8, days_taken::float8,
              (period_due_date < $2::date) AS expired
         FROM attendance.vacation_periods
        WHERE employee_id = $1
        ORDER BY seniority_year
        FOR UPDATE`,
      [employeeId, today],
    );
    if (periods.rows.length === 0) return;

    const total = await client.query<{ total: number }>(
      `SELECT COALESCE(SUM(i.days), 0)::float8 AS total
         FROM attendance.incidents i
         JOIN attendance.incident_types t ON t.id = i.incident_type_id
        WHERE i.employee_id = $1 AND i.incident_status = 'authorized'
          AND t.deducts_vacation AND NOT t.is_hourly`,
      [employeeId],
    );

    const distribution = distribuirTomados(
      periods.rows.map((row) => ({ entitled: row.days_entitled, adjustment: row.days_adjustment, expired: row.expired })),
      total.rows[0]?.total ?? 0,
    );
    for (const [index, row] of periods.rows.entries()) {
      const taken = distribution[index] ?? 0;
      if (taken !== row.days_taken) {
        await client.query('UPDATE attendance.vacation_periods SET days_taken = $2 WHERE id = $1', [row.id, taken]);
      }
    }
  });
};

/**
 * Actualiza days_entitled de los periodos NO vencidos a la tabla vigente, sin
 * tocar ajustes ni tomados (el reparto de tomados se recalcula para los
 * colaboradores afectados). Devuelve cuantos periodos cambiaron.
 */
export const applyPolicyToCurrentPeriods = async (): Promise<number> => {
  const today = await attendanceToday();
  const { rows } = await pool.query<{ employee_id: string }>(
    `UPDATE attendance.vacation_periods p
        SET days_entitled = x.days
       FROM (
         SELECT vp.id,
                COALESCE((SELECT pol.vacation_days FROM attendance.vacation_policy pol
                           WHERE pol.from_seniority_year <= vp.seniority_year
                           ORDER BY pol.from_seniority_year DESC LIMIT 1), 0) AS days
           FROM attendance.vacation_periods vp
          WHERE vp.period_due_date >= $1::date
       ) x
      WHERE x.id = p.id AND p.days_entitled <> x.days
      RETURNING p.employee_id::text`,
    [today],
  );
  const affected = [...new Set(rows.map((row) => Number(row.employee_id)))];
  for (const employeeId of affected) {
    await recalculateVacationDaysTaken(employeeId).catch((error) =>
      console.error('[attendance] recalculateVacationDaysTaken tras cambio de politica:', error),
    );
  }
  return rows.length;
};
