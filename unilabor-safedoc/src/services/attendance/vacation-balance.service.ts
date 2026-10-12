import pool from '../../config/db';
import type { Queryable } from '../../utils/transaction';
import { conflict, invalid, notFound } from './attendance-errors';
import { getAttendanceSettings } from './attendance-settings.service';
import {
  evaluateRequest,
  periodBalance,
  summarizeBalance,
  type BalanceSummary,
  type RequestEvaluation,
} from './engine/vacations';
import {
  attendanceToday,
  openVacationPeriodsForEmployee,
  recalculateVacationDaysTaken,
} from './vacation-periods.service';
import { getWorkingDays } from './working-days.service';

/** Saldos de vacaciones, ajustes manuales y evaluacion de solicitudes. */

export interface VacationPeriodView {
  id: number;
  seniority_year: number;
  period_start_date: string;
  period_due_date: string;
  days_entitled: number;
  days_adjustment: number;
  adjustment_reason: string | null;
  days_taken: number;
  expired: boolean;
  balance: number;
}

export interface EmployeeVacations {
  employee: { id: number; full_name: string; employee_code: string };
  hire_date: string | null;
  periods: VacationPeriodView[];
  balance: BalanceSummary;
}

interface PeriodRow {
  id: string;
  seniority_year: number;
  period_start_date: string;
  period_due_date: string;
  days_entitled: number;
  days_adjustment: number;
  adjustment_reason: string | null;
  days_taken: number;
  expired: boolean;
}

const loadPeriods = async (employeeId: number, today: string, db: Queryable = pool): Promise<VacationPeriodView[]> => {
  const { rows } = await db.query<PeriodRow>(
    `SELECT id::text, seniority_year, period_start_date::text, period_due_date::text,
            days_entitled::float8, days_adjustment::float8, adjustment_reason, days_taken::float8,
            (period_due_date < $2::date) AS expired
       FROM attendance.vacation_periods
      WHERE employee_id = $1
      ORDER BY seniority_year`,
    [employeeId, today],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    seniority_year: row.seniority_year,
    period_start_date: row.period_start_date,
    period_due_date: row.period_due_date,
    days_entitled: row.days_entitled,
    days_adjustment: row.days_adjustment,
    adjustment_reason: row.adjustment_reason,
    days_taken: row.days_taken,
    expired: row.expired,
    balance: periodBalance({ entitled: row.days_entitled, adjustment: row.days_adjustment, taken: row.days_taken }),
  }));
};

const summarize = (periods: VacationPeriodView[]): BalanceSummary =>
  summarizeBalance(
    periods.map((period) => ({
      entitled: period.days_entitled,
      adjustment: period.days_adjustment,
      taken: period.days_taken,
      expired: period.expired,
      dueDate: period.period_due_date,
    })),
  );

export const getEmployeeVacations = async (employeeId: number): Promise<EmployeeVacations> => {
  const { rows } = await pool.query<{ id: string; full_name: string; employee_code: string; hire_date: string | null }>(
    'SELECT id::text, full_name, employee_code, hire_date::text AS hire_date FROM public.employees WHERE id = $1',
    [employeeId],
  );
  const employee = rows[0];
  if (!employee) return notFound('Colaborador no encontrado.');
  const periods = await loadPeriods(employeeId, await attendanceToday());
  return {
    employee: { id: Number(employee.id), full_name: employee.full_name, employee_code: employee.employee_code },
    hire_date: employee.hire_date,
    periods,
    balance: summarize(periods),
  };
};

/** Abre los periodos que correspondan por antiguedad y recalcula los dias tomados. */
export const openPeriodsForEmployee = async (
  employeeId: number,
): Promise<EmployeeVacations & { periods_touched: number }> => {
  const current = await getEmployeeVacations(employeeId);
  if (!current.hire_date) {
    return conflict('El colaborador no tiene fecha de ingreso: capturala en su expediente de RH.');
  }
  const touched = await openVacationPeriodsForEmployee(employeeId);
  await recalculateVacationDaysTaken(employeeId);
  return { ...(await getEmployeeVacations(employeeId)), periods_touched: touched };
};

export interface AdjustInput {
  periodId: number;
  adjustment: number;
  reason: string;
  userId: string;
}

export const adjustVacationPeriod = async (
  input: AdjustInput,
): Promise<{ employeeId: number; previousAdjustment: number; vacations: EmployeeVacations }> => {
  const reason = input.reason.trim();
  if (reason.length < 5) invalid('Escribe el motivo del ajuste (minimo 5 caracteres).');
  const found = await pool.query<{ employee_id: string; days_adjustment: number }>(
    'SELECT employee_id::text, days_adjustment::float8 FROM attendance.vacation_periods WHERE id = $1',
    [input.periodId],
  );
  const row = found.rows[0];
  if (!row) return notFound('Periodo de vacaciones no encontrado.');
  await pool.query(
    'UPDATE attendance.vacation_periods SET days_adjustment = $2, adjustment_reason = $3 WHERE id = $1',
    [input.periodId, input.adjustment, reason],
  );
  const employeeId = Number(row.employee_id);
  // El ajuste cambia la capacidad de cada periodo: se vuelve a repartir lo tomado.
  await recalculateVacationDaysTaken(employeeId);
  return { employeeId, previousAdjustment: row.days_adjustment, vacations: await getEmployeeVacations(employeeId) };
};

/** Dias ya solicitados (capturados, por autorizar) que descuentan vacaciones. */
const getPendingDays = async (employeeId: number, excludeIncidentId: number | null, db: Queryable): Promise<number> => {
  const { rows } = await db.query<{ total: number }>(
    `SELECT COALESCE(SUM(i.days), 0)::float8 AS total
       FROM attendance.incidents i
       JOIN attendance.incident_types t ON t.id = i.incident_type_id
      WHERE i.employee_id = $1 AND i.incident_status = 'captured'
        AND t.deducts_vacation AND NOT t.is_hourly
        AND ($2::bigint IS NULL OR i.id <> $2)`,
    [employeeId, excludeIncidentId],
  );
  return rows[0]?.total ?? 0;
};

export interface EvaluateInput {
  employeeId: number;
  type: { deducts_vacation: boolean; is_hourly: boolean };
  startDate: string;
  endDate: string;
  /** Dias ya calculados (si se omite se cuentan los laborables). */
  workingDays?: number | undefined;
  /** Incidencia que se esta autorizando: no cuenta como pendiente de si misma. */
  excludeIncidentId?: number | undefined;
}

export const evaluateVacationRequest = async (input: EvaluateInput, db: Queryable = pool): Promise<RequestEvaluation> => {
  const settings = await getAttendanceSettings();
  if (!input.type.deducts_vacation || input.type.is_hourly) {
    return evaluateRequest({
      deductsVacation: false, isHourly: input.type.is_hourly, hasHireDate: true,
      workingDays: 0, balance: 0, pending: 0, policy: settings.vacations_no_balance,
    });
  }
  const workingDays = input.workingDays ?? (await getWorkingDays(input.employeeId, input.startDate, input.endDate, db));
  const hire = await db.query<{ hire_date: string | null }>(
    'SELECT hire_date::text AS hire_date FROM public.employees WHERE id = $1',
    [input.employeeId],
  );
  const hasHireDate = Boolean(hire.rows[0]?.hire_date);
  let balance = 0;
  let pending = 0;
  if (hasHireDate) {
    await openVacationPeriodsForEmployee(input.employeeId);
    const periods = await loadPeriods(input.employeeId, await attendanceToday(), db);
    balance = summarize(periods).balance;
    pending = await getPendingDays(input.employeeId, input.excludeIncidentId ?? null, db);
  }
  return evaluateRequest({
    deductsVacation: true, isHourly: false, hasHireDate, workingDays, balance, pending,
    policy: settings.vacations_no_balance,
  });
};

export interface PreviewInput {
  employeeId: number;
  incidentTypeId: number;
  startDate: string;
  endDate: string;
}

export const previewVacationRequest = async (input: PreviewInput): Promise<RequestEvaluation & { is_hourly: boolean; deducts_vacation: boolean }> => {
  const type = await pool.query<{ deducts_vacation: boolean; is_hourly: boolean }>(
    'SELECT deducts_vacation, is_hourly FROM attendance.incident_types WHERE id = $1',
    [input.incidentTypeId],
  );
  const row = type.rows[0];
  if (!row) return notFound('Tipo de incidencia no encontrado.');
  const exists = await pool.query('SELECT 1 FROM public.employees WHERE id = $1', [input.employeeId]);
  if (exists.rows.length === 0) return notFound('Colaborador no encontrado.');
  if (input.endDate < input.startDate) invalid('La fecha final no puede ser anterior a la inicial.');
  const evaluation = await evaluateVacationRequest({
    employeeId: input.employeeId,
    type: row,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  // Aun si el tipo no descuenta, el conteo de dias laborables es informativo.
  const workingDays = evaluation.applies
    ? evaluation.working_days
    : row.is_hourly
      ? 0
      : await getWorkingDays(input.employeeId, input.startDate, input.endDate);
  return { ...evaluation, working_days: workingDays, is_hourly: row.is_hourly, deducts_vacation: row.deducts_vacation };
};

export interface BalancesFilter {
  branchId?: number | undefined;
  search?: string | undefined;
  page: number;
  limit: number;
}

export const listVacationBalances = async (filter: BalancesFilter) => {
  const today = await attendanceToday();
  const params: unknown[] = [];
  const where: string[] = ['e.is_active', 'p.is_enabled'];
  if (filter.branchId) {
    params.push(filter.branchId);
    where.push(`e.branch_id = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`);
  }
  const whereSql = where.join(' AND ');
  const total = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM public.employees e JOIN attendance.employee_profiles p ON p.employee_id = e.id WHERE ${whereSql}`,
    params,
  );
  params.push(today, filter.limit, (filter.page - 1) * filter.limit);
  const todayRef = `$${params.length - 2}`;
  const { rows } = await pool.query<{
    employee_id: string; full_name: string; employee_code: string; branch_id: string | null; branch_name: string | null;
    hire_date: string | null; entitled: number; adjustment: number; taken: number; balance: number;
    expiring_days: number | null; expiring_due_date: string | null;
  }>(
    `SELECT e.id::text AS employee_id, e.full_name, e.employee_code, e.branch_id::text, u.name AS branch_name,
            e.hire_date::text AS hire_date,
            COALESCE(SUM(vp.days_entitled) FILTER (WHERE vp.period_due_date >= ${todayRef}::date), 0)::float8 AS entitled,
            COALESCE(SUM(vp.days_adjustment) FILTER (WHERE vp.period_due_date >= ${todayRef}::date), 0)::float8 AS adjustment,
            COALESCE(SUM(vp.days_taken) FILTER (WHERE vp.period_due_date >= ${todayRef}::date), 0)::float8 AS taken,
            COALESCE(SUM(vp.days_entitled + vp.days_adjustment - vp.days_taken) FILTER (WHERE vp.period_due_date >= ${todayRef}::date), 0)::float8 AS balance,
            (SELECT (x.days_entitled + x.days_adjustment - x.days_taken)::float8 FROM attendance.vacation_periods x
              WHERE x.employee_id = e.id AND x.period_due_date >= ${todayRef}::date AND x.days_entitled + x.days_adjustment - x.days_taken > 0
              ORDER BY x.seniority_year LIMIT 1) AS expiring_days,
            (SELECT x.period_due_date::text FROM attendance.vacation_periods x
              WHERE x.employee_id = e.id AND x.period_due_date >= ${todayRef}::date AND x.days_entitled + x.days_adjustment - x.days_taken > 0
              ORDER BY x.seniority_year LIMIT 1) AS expiring_due_date
       FROM public.employees e
       JOIN attendance.employee_profiles p ON p.employee_id = e.id
       LEFT JOIN public.helpdesk_asset_units u ON u.id = e.branch_id
       LEFT JOIN attendance.vacation_periods vp ON vp.employee_id = e.id
      WHERE ${whereSql}
      GROUP BY e.id, u.name
      ORDER BY e.full_name
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const totalCount = Number(total.rows[0]?.count ?? 0);
  return {
    data: rows.map((row) => ({
      employee_id: Number(row.employee_id),
      full_name: row.full_name,
      employee_code: row.employee_code,
      branch_id: row.branch_id === null ? null : Number(row.branch_id),
      branch_name: row.branch_name,
      hire_date: row.hire_date,
      entitled: row.entitled,
      adjustment: row.adjustment,
      taken: row.taken,
      balance: row.balance,
      expiring: row.expiring_days === null || row.expiring_due_date === null
        ? null
        : { days: row.expiring_days, due_date: row.expiring_due_date },
    })),
    pagination: {
      page: filter.page,
      limit: filter.limit,
      total: totalCount,
      pages: Math.max(1, Math.ceil(totalCount / filter.limit)),
    },
  };
};
