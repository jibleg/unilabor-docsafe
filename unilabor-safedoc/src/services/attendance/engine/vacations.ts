import { resolveDay, type EngineAssignment, type EngineShift } from './schedule';
import {
  addDays,
  dateToLocalMs,
  isoWeekday,
  roundTo,
  startOfWeek,
  type DateString,
  type WeekStart,
} from './time';

/**
 * Logica PURA de vacaciones: derecho por antiguedad, fechas de aniversario y
 * vencimiento, reparto de dias tomados, saldo, evaluacion de una solicitud y
 * conteo de dias laborables de un rango. Sin acceso a BD.
 */

export interface PolicyRow {
  fromSeniorityYear: number;
  vacationDays: number;
}

/** Dias del anio de antiguedad `n`: la fila con mayor from_seniority_year <= n (0 si n < 1 o sin tabla). */
export const diasPorAntiguedad = (n: number, table: readonly PolicyRow[]): number => {
  if (n < 1 || table.length === 0) return 0;
  let best: PolicyRow | null = null;
  for (const row of table) {
    if (row.fromSeniorityYear <= n && (best === null || row.fromSeniorityYear > best.fromSeniorityYear)) {
      best = row;
    }
  }
  return best ? best.vacationDays : 0;
};

const parseDate = (date: DateString): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return [y, m, d];
};

const formatDate = (y: number, m: number, d: number): DateString =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Suma meses a una fecha; si el dia no existe en el mes destino se usa el ultimo dia del mes. */
export const sumarMeses = (date: DateString, months: number): DateString => {
  const [y, m, d] = parseDate(date);
  const totalMonths = y * 12 + (m - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return formatDate(year, month, Math.min(d, daysInMonth(year, month)));
};

/** Aniversario numero `n` (n anios despues del ingreso). */
export const fechaAniversario = (hireDate: DateString, n: number): DateString => sumarMeses(hireDate, n * 12);

/** Anios de antiguedad cumplidos a `today` (0 si aun no cumple el primero). */
export const aniosCumplidos = (hireDate: DateString, today: DateString): number => {
  const [hy] = parseDate(hireDate);
  const [ty] = parseDate(today);
  let years = ty - hy;
  while (years > 0 && fechaAniversario(hireDate, years) > today) years -= 1;
  return Math.max(0, years);
};

export interface PeriodPlan {
  seniorityYear: number;
  startDate: DateString;
  dueDate: DateString;
  daysEntitled: number;
}

/** Periodos que corresponden a la fecha: uno por cada aniversario cumplido (1..n). */
export const planPeriods = (
  hireDate: DateString,
  today: DateString,
  validityMonths: number,
  table: readonly PolicyRow[],
): PeriodPlan[] => {
  const years = aniosCumplidos(hireDate, today);
  const plans: PeriodPlan[] = [];
  for (let n = 1; n <= years; n += 1) {
    const startDate = fechaAniversario(hireDate, n);
    plans.push({
      seniorityYear: n,
      startDate,
      dueDate: sumarMeses(startDate, validityMonths),
      daysEntitled: diasPorAntiguedad(n, table),
    });
  }
  return plans;
};

export interface TakenCapacity {
  entitled: number;
  adjustment: number;
  expired: boolean;
}

/**
 * Reparte `totalTaken` del periodo MAS ANTIGUO al mas nuevo (la entrada debe ir
 * ordenada por anio). Un periodo vencido aporta 0 y no recibe cargos. Lo que no
 * cupo en ningun periodo se suma al ultimo (puede dejar saldo negativo visible).
 */
export const distribuirTomados = (periods: readonly TakenCapacity[], totalTaken: number): number[] => {
  let remaining = Math.max(0, totalTaken);
  const result = periods.map((period) => {
    const available = period.expired ? 0 : Math.max(0, period.entitled + period.adjustment);
    const used = Math.min(available, remaining);
    remaining = roundTo(remaining - used, 2);
    return roundTo(used, 2);
  });
  if (remaining > 0 && result.length > 0) {
    const lastIndex = result.length - 1;
    result[lastIndex] = roundTo((result[lastIndex] ?? 0) + remaining, 2);
  }
  return result;
};

export interface BalancePeriod {
  entitled: number;
  adjustment: number;
  taken: number;
  expired: boolean;
  dueDate: DateString;
}

export interface BalanceSummary {
  entitled: number;
  adjustment: number;
  taken: number;
  balance: number;
  /** Primer periodo vigente con saldo > 0 (el siguiente en vencer). */
  expiring: { days: number; due_date: DateString } | null;
}

export const periodBalance = (period: Pick<BalancePeriod, 'entitled' | 'adjustment' | 'taken'>): number =>
  roundTo(period.entitled + period.adjustment - period.taken, 2);

/** Saldo = suma(derecho + ajuste - tomados) de los periodos NO vencidos (entrada ordenada por anio). */
export const summarizeBalance = (periods: readonly BalancePeriod[]): BalanceSummary => {
  const current = periods.filter((period) => !period.expired);
  const sum = (pick: (p: BalancePeriod) => number): number => roundTo(current.reduce((acc, p) => acc + pick(p), 0), 2);
  const next = current.find((period) => periodBalance(period) > 0);
  return {
    entitled: sum((p) => p.entitled),
    adjustment: sum((p) => p.adjustment),
    taken: sum((p) => p.taken),
    balance: sum((p) => periodBalance(p)),
    expiring: next ? { days: periodBalance(next), due_date: next.dueDate } : null,
  };
};

export type NoBalancePolicy = 'warn' | 'block' | 'allow';

export interface RequestEvaluation {
  /** El tipo descuenta vacaciones (si no, no hay nada que evaluar). */
  applies: boolean;
  /** Sin fecha de ingreso no hay periodos: no se puede calcular el saldo. */
  no_hire_date: boolean;
  working_days: number;
  balance: number;
  /** Dias ya solicitados y pendientes de autorizar. */
  pending: number;
  /** balance - pending. */
  available: number;
  exceeds: number;
  policy: NoBalancePolicy;
  /** La politica impide registrar la solicitud. */
  blocked: boolean;
  message: string | null;
}

export interface EvaluateRequestInput {
  deductsVacation: boolean;
  isHourly: boolean;
  hasHireDate: boolean;
  workingDays: number;
  balance: number;
  pending: number;
  policy: NoBalancePolicy;
}

/** Evalua una solicitud de vacaciones contra el saldo segun settings.vacations_no_balance. */
export const evaluateRequest = (input: EvaluateRequestInput): RequestEvaluation => {
  const base = {
    working_days: input.workingDays,
    balance: input.balance,
    pending: input.pending,
    policy: input.policy,
  };
  if (!input.deductsVacation || input.isHourly) {
    return { ...base, applies: false, no_hire_date: false, available: 0, exceeds: 0, blocked: false, message: null };
  }
  if (!input.hasHireDate) {
    const blocked = input.policy === 'block';
    return {
      ...base,
      applies: true,
      no_hire_date: true,
      available: 0,
      exceeds: 0,
      blocked,
      message: 'El colaborador no tiene fecha de ingreso: no se puede calcular su saldo de vacaciones.',
    };
  }
  const available = roundTo(input.balance - input.pending, 2);
  const exceeds = roundTo(Math.max(0, input.workingDays - available), 2);
  const blocked = exceeds > 0 && input.policy === 'block';
  const message =
    exceeds > 0 && input.policy !== 'allow'
      ? `La solicitud (${input.workingDays} dias) excede el saldo disponible (${available} dias) por ${exceeds} dias.`
      : null;
  return { ...base, applies: true, no_hire_date: false, available, exceeds, blocked, message };
};

export interface WorkingDaysInput {
  from: DateString;
  to: DateString;
  assignments: readonly EngineAssignment[];
  shiftsById: ReadonlyMap<number, EngineShift>;
  holidays: ReadonlySet<DateString>;
  weekStart: WeekStart;
}

/**
 * Dias laborables de un rango: el dia cuenta solo si tiene turno segun la
 * programacion; los festivos no cuentan. Si la semana del dia no tiene ninguna
 * programacion (ni turno ni descanso) se asume lunes a viernes.
 */
export const countWorkingDays = (input: WorkingDaysInput): number => {
  const weekProgrammed = new Map<DateString, boolean>();
  const isWeekProgrammed = (date: DateString): boolean => {
    const first = startOfWeek(date, input.weekStart);
    let cached = weekProgrammed.get(first);
    if (cached === undefined) {
      cached = false;
      for (let i = 0; i < 7 && !cached; i += 1) {
        const plan = resolveDay(input.assignments, input.shiftsById, addDays(first, i), input.weekStart);
        cached = plan.segments.length > 0 || plan.isRestDay;
      }
      weekProgrammed.set(first, cached);
    }
    return cached;
  };

  let count = 0;
  for (let date = input.from; dateToLocalMs(date) <= dateToLocalMs(input.to); date = addDays(date, 1)) {
    if (input.holidays.has(date)) continue;
    if (isWeekProgrammed(date)) {
      if (resolveDay(input.assignments, input.shiftsById, date, input.weekStart).segments.length > 0) count += 1;
    } else if (isoWeekday(date) <= 5) {
      count += 1;
    }
  }
  return count;
};
