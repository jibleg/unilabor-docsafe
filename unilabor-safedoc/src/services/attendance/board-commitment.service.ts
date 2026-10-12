import pool from '../../config/db';
import { getAttendanceSettings } from './attendance-settings.service';
import { notFound } from './attendance-errors';
import {
  compareRanking,
  summarizeCommitment,
  trendByBlock,
  type CommitmentLevel,
  type CommitmentRow,
  type CommitmentSummary,
  type CommitmentWeights,
  type TrendBlock,
} from './engine/commitment';
import type { DayResult } from './engine/day-calculator';
import {
  neighborPeriod,
  periodLabel,
  periodRange,
  rangeDays,
  trendGranularity,
  type DateRange,
  type Granularity,
  type PeriodType,
} from './engine/periods';
import type { AttendanceSettings } from './engine/settings';
import { addDays, type DateString } from './engine/time';
import { todayInZone } from './timezone';

/**
 * Tablero de compromiso por periodo. Solo considera dias CERRADOS (hasta ayer
 * en la zona horaria del modulo) y colaboradores habilitados y activos.
 */

export interface CommitmentFilters {
  period: PeriodType;
  anchor?: DateString | undefined;
  from?: DateString | undefined;
  to?: DateString | undefined;
  branchId?: number | undefined;
  employeeId?: number | undefined;
}

export interface EnabledEmployee {
  id: number;
  code: string;
  fullName: string;
  area: string | null;
  branchId: number | null;
  branchName: string | null;
}

export interface DailyDetailRow extends CommitmentRow {
  branchId: number | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  earlyDepartureMinutes: number;
  hasPendingReview: boolean;
  incidentName: string | null;
}

export const weightsFromSettings = (settings: AttendanceSettings): CommitmentWeights => ({
  attendance: settings.weight_attendance,
  punctuality: settings.weight_punctuality,
  exits: settings.weight_exits,
  exemplary: settings.commitment_exemplary,
  attention: settings.commitment_attention,
});

/** Colaboradores activos con asistencia habilitada (todas las sucursales). */
export const loadEnabledEmployees = async (): Promise<EnabledEmployee[]> => {
  const { rows } = await pool.query<{
    id: string; code: string; full_name: string; area: string | null; branch_id: string | null; branch_name: string | null;
  }>(
    `SELECT e.id, e.employee_code AS code, e.full_name, e.area, e.branch_id, b.name AS branch_name
       FROM public.employees e
       JOIN attendance.employee_profiles p ON p.employee_id = e.id AND p.is_enabled
       LEFT JOIN public.helpdesk_asset_units b ON b.id = e.branch_id
      WHERE e.is_active
      ORDER BY e.full_name`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    fullName: row.full_name,
    area: row.area,
    branchId: row.branch_id === null ? null : Number(row.branch_id),
    branchName: row.branch_name,
  }));
};

/** Resultados diarios de un rango para un conjunto de colaboradores (una sola consulta). */
export const loadDailyRows = async (
  from: DateString,
  to: DateString,
  employeeIds: readonly number[],
  timeZone: string,
): Promise<DailyDetailRow[]> => {
  if (employeeIds.length === 0 || from > to) return [];
  const { rows } = await pool.query<{
    employee_id: string; work_date: string; branch_id: string | null; day_result: DayResult;
    is_late_accumulation_absence: boolean; late_minutes: number; early_departure_minutes: number;
    worked_hours: string | null; overtime_hours: string; has_clock_out: boolean; has_pending_review: boolean;
    expected_start: string | null; expected_end: string | null;
    clock_in_at: string | null; clock_out_at: string | null; incident_name: string | null;
  }>(
    `SELECT dr.employee_id, to_char(dr.work_date, 'YYYY-MM-DD') AS work_date, dr.branch_id, dr.day_result,
            dr.is_late_accumulation_absence, dr.late_minutes, dr.early_departure_minutes,
            dr.worked_hours, dr.overtime_hours, (dr.clock_out_at IS NOT NULL) AS has_clock_out,
            dr.has_pending_review,
            to_char(dr.expected_start_time, 'HH24:MI') AS expected_start,
            to_char(dr.expected_end_time, 'HH24:MI') AS expected_end,
            to_char(dr.clock_in_at AT TIME ZONE $4, 'HH24:MI') AS clock_in_at,
            to_char(dr.clock_out_at AT TIME ZONE $4, 'HH24:MI') AS clock_out_at,
            it.name AS incident_name
       FROM attendance.daily_results dr
       LEFT JOIN attendance.incidents i ON i.id = dr.incident_id
       LEFT JOIN attendance.incident_types it ON it.id = i.incident_type_id
      WHERE dr.work_date BETWEEN $1::date AND $2::date
        AND dr.employee_id = ANY($3::bigint[])
      ORDER BY dr.work_date, dr.employee_id`,
    [from, to, employeeIds as number[], timeZone],
  );
  return rows.map((row) => ({
    employeeId: Number(row.employee_id),
    workDate: row.work_date,
    dayResult: row.day_result,
    isLateAccumulationAbsence: row.is_late_accumulation_absence,
    lateMinutes: row.late_minutes,
    workedHours: row.worked_hours === null ? null : Number(row.worked_hours),
    overtimeHours: Number(row.overtime_hours),
    hasClockOut: row.has_clock_out,
    branchId: row.branch_id === null ? null : Number(row.branch_id),
    expectedStart: row.expected_start,
    expectedEnd: row.expected_end,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    earlyDepartureMinutes: row.early_departure_minutes,
    hasPendingReview: row.has_pending_review,
    incidentName: row.incident_name,
  }));
};

/** Resuelve el rango del periodo y lo recorta a dias cerrados (hasta ayer). */
export const resolvePeriod = (filters: CommitmentFilters, settings: AttendanceSettings, today: DateString) => {
  const anchor = filters.period === 'custom' ? (filters.from ?? filters.anchor ?? today) : (filters.anchor ?? filters.from ?? today);
  const range = periodRange(filters.period, anchor, settings.week_start, filters.to ?? filters.from ?? anchor);
  const yesterday = addDays(today, -1);
  const closedTo = range.to < yesterday ? range.to : yesterday;
  return { range, closedTo, previous: neighborPeriod(filters.period, range, -1, settings.week_start), next: neighborPeriod(filters.period, range, 1, settings.week_start) };
};

const rangeInfo = (period: PeriodType, range: DateRange) => ({
  from: range.from,
  to: range.to,
  label: periodLabel(period, range.from, range.to),
});

/** Resumen en snake_case para la API. */
export const toApiSummary = (summary: CommitmentSummary) => ({
  expected: summary.expected,
  attendances: summary.attendances,
  punctual: summary.punctual,
  lates: summary.lates,
  late_minutes: summary.lateMinutes,
  absences: summary.absences,
  partial_absences: summary.partialAbsences,
  early_departures: summary.earlyDepartures,
  missing_exit: summary.missingExit,
  complete_exits: summary.completeExits,
  present: summary.present,
  incidents: summary.incidents,
  hours: summary.hours,
  overtime_hours: summary.overtimeHours,
  pct_attendance: summary.pctAttendance,
  pct_punctuality: summary.pctPunctuality,
  pct_exits: summary.pctExits,
  index: summary.index,
  level: summary.level,
  current_streak: summary.currentStreak,
  best_streak: summary.bestStreak,
});

export interface RankedPerson {
  place: number;
  employee: EnabledEmployee;
  summary: CommitmentSummary;
}

const ACHIEVEMENT_STREAK_MIN = 10;

export const buildAchievements = (summary: CommitmentSummary): Array<{ code: string; label: string }> => {
  const list: Array<{ code: string; label: string }> = [];
  if (summary.expected > 0 && summary.absences === 0 && summary.partialAbsences === 0) {
    list.push({ code: 'zero_absences', label: 'Cero faltas' });
  }
  if (summary.expected > 0 && summary.lates === 0) {
    list.push({ code: 'zero_lates', label: 'Cero retardos' });
  }
  if (summary.present > 0 && summary.missingExit === 0) {
    list.push({ code: 'all_exits', label: 'Todas sus salidas registradas' });
  }
  if (summary.bestStreak >= ACHIEVEMENT_STREAK_MIN) {
    list.push({ code: 'punctual_streak', label: `${summary.bestStreak} días puntuales seguidos` });
  }
  if (summary.overtimeHours > 0) {
    list.push({ code: 'overtime', label: `${summary.overtimeHours} h extra` });
  }
  return list;
};

const diff = (person: number | null, team: number | null): number | null =>
  person === null || team === null ? null : person - team;

export interface CommitmentBoard {
  period: PeriodType;
  from: DateString;
  to: DateString;
  label: string;
  closed_through: DateString | null;
  previous: { from: DateString; to: DateString; label: string };
  next: { from: DateString; to: DateString; label: string };
  weights: CommitmentWeights;
  team: Omit<ReturnType<typeof toApiSummary>, 'current_streak' | 'best_streak'> & { employees: number };
  people: ReturnType<typeof apiPerson>[];
  trend: { granularity: Granularity; blocks: TrendBlock[] };
  recognitions: ReturnType<typeof apiPerson>[];
  attention: ReturnType<typeof apiPerson>[];
  detail: ReturnType<typeof buildDetail> | null;
  employees: Array<{ id: number; code: string; full_name: string; branch_id: number | null }>;
  branches: Array<{ id: number; name: string }>;
}

const apiPerson = (person: RankedPerson) => ({
  place: person.place,
  employee_id: person.employee.id,
  code: person.employee.code,
  full_name: person.employee.fullName,
  area: person.employee.area,
  branch_id: person.employee.branchId,
  branch_name: person.employee.branchName,
  index: person.summary.index,
  level: person.summary.level as CommitmentLevel,
  summary: toApiSummary(person.summary),
});

const buildDetail = (
  person: RankedPerson,
  team: CommitmentSummary,
  rows: readonly DailyDetailRow[],
) => ({
  employee_id: person.employee.id,
  full_name: person.employee.fullName,
  code: person.employee.code,
  summary: toApiSummary(person.summary),
  streak: { current: person.summary.currentStreak, best: person.summary.bestStreak },
  achievements: buildAchievements(person.summary),
  comparison: {
    attendance: { person: person.summary.pctAttendance, team: team.pctAttendance, difference: diff(person.summary.pctAttendance, team.pctAttendance) },
    punctuality: { person: person.summary.pctPunctuality, team: team.pctPunctuality, difference: diff(person.summary.pctPunctuality, team.pctPunctuality) },
    exits: { person: person.summary.pctExits, team: team.pctExits, difference: diff(person.summary.pctExits, team.pctExits) },
  },
  days: rows.map((row) => ({
    date: row.workDate,
    day_result: row.dayResult,
    expected_start: row.expectedStart,
    expected_end: row.expectedEnd,
    clock_in: row.clockInAt,
    clock_out: row.clockOutAt,
    late_minutes: row.lateMinutes,
    early_departure_minutes: row.earlyDepartureMinutes,
    worked_hours: row.workedHours,
    overtime_hours: row.overtimeHours,
    is_late_accumulation_absence: row.isLateAccumulationAbsence,
    has_pending_review: row.hasPendingReview,
    incident: row.incidentName,
  })),
  days_to_review: rows
    .filter((row) => row.hasPendingReview || ((row.dayResult === 'present' || row.dayResult === 'late') && !row.hasClockOut))
    .map((row) => ({
      date: row.workDate,
      day_result: row.dayResult,
      reason: row.hasPendingReview ? 'pending_review' : 'missing_exit',
    })),
});

/** Datos base reutilizables por el tablero y las exportaciones. */
export interface CommitmentData {
  settings: AttendanceSettings;
  weights: CommitmentWeights;
  period: PeriodType;
  range: DateRange;
  closedTo: DateString;
  scopeEmployees: EnabledEmployee[];
  rows: DailyDetailRow[];
  ranking: RankedPerson[];
  team: CommitmentSummary;
  allEmployees: EnabledEmployee[];
  granularity: Granularity;
  previous: DateRange;
  next: DateRange;
}

export const loadCommitmentData = async (filters: CommitmentFilters): Promise<CommitmentData> => {
  const settings = await getAttendanceSettings();
  const weights = weightsFromSettings(settings);
  const today = todayInZone(settings.timezone);
  const { range, closedTo, previous, next } = resolvePeriod(filters, settings, today);

  const allEmployees = await loadEnabledEmployees();
  let scope = filters.branchId === undefined ? allEmployees : allEmployees.filter((e) => e.branchId === filters.branchId);
  if (filters.employeeId !== undefined) {
    const chosen = allEmployees.find((e) => e.id === filters.employeeId);
    if (!chosen) notFound('Colaborador no encontrado o sin control de asistencia habilitado');
    scope = scope.filter((e) => e.id === filters.employeeId);
    if (scope.length === 0) notFound('El colaborador no pertenece a la sucursal elegida');
  }

  const rows = await loadDailyRows(range.from, closedTo, scope.map((e) => e.id), settings.timezone);

  const byEmployee = new Map<number, DailyDetailRow[]>();
  for (const row of rows) {
    const list = byEmployee.get(row.employeeId) ?? [];
    list.push(row);
    byEmployee.set(row.employeeId, list);
  }
  const unsorted = scope.map((employee) => ({
    employee,
    summary: summarizeCommitment(byEmployee.get(employee.id) ?? [], weights),
  }));
  unsorted.sort((a, b) =>
    compareRanking(
      { name: a.employee.fullName, summary: a.summary },
      { name: b.employee.fullName, summary: b.summary },
    ),
  );
  const ranking: RankedPerson[] = unsorted.map((entry, index) => ({ place: index + 1, ...entry }));

  // Equipo: se agregan todas las filas; las rachas no aplican a un conjunto.
  const team = summarizeCommitment(rows, weights);
  return {
    settings, weights, period: filters.period, range, closedTo, scopeEmployees: scope, rows, ranking, team,
    allEmployees, granularity: trendGranularity(filters.period, rangeDays(range.from, range.to)), previous, next,
  };
};

export const getCommitmentBoard = async (filters: CommitmentFilters): Promise<CommitmentBoard> => {
  const data = await loadCommitmentData(filters);
  const { ranking, team, weights } = data;
  const { current_streak: _currentStreak, best_streak: _bestStreak, ...teamApi } = toApiSummary(team);

  const recognitions = ranking
    .filter((p) => (p.summary.level === 'exemplary' || p.summary.level === 'committed') && p.summary.expected >= 3)
    .slice(0, 3);
  const attention = ranking
    .filter((p) => (p.summary.level === 'attention' || p.summary.level === 'regular') && p.summary.index !== null)
    .sort((a, b) => (a.summary.index ?? 0) - (b.summary.index ?? 0) || a.employee.fullName.localeCompare(b.employee.fullName, 'es'))
    .slice(0, 6);

  const detailPerson = filters.employeeId === undefined ? null : ranking[0] ?? null;
  const detail = detailPerson
    ? buildDetail(detailPerson, team, data.rows.filter((row) => row.employeeId === detailPerson.employee.id))
    : null;

  const branches = new Map<number, string>();
  for (const e of data.allEmployees) {
    if (e.branchId !== null && e.branchName) branches.set(e.branchId, e.branchName);
  }

  return {
    period: data.period,
    ...rangeInfo(data.period, data.range),
    closed_through: data.closedTo >= data.range.from ? data.closedTo : null,
    previous: rangeInfo(data.period, data.previous),
    next: rangeInfo(data.period, data.next),
    weights,
    team: { ...teamApi, employees: data.scopeEmployees.length },
    people: ranking.map(apiPerson),
    trend: {
      granularity: data.granularity,
      blocks: trendByBlock(data.rows, data.granularity, data.settings.week_start),
    },
    recognitions: recognitions.map(apiPerson),
    attention: attention.map(apiPerson),
    detail,
    employees: data.allEmployees
      .filter((e) => filters.branchId === undefined || e.branchId === filters.branchId)
      .map((e) => ({ id: e.id, code: e.code, full_name: e.fullName, branch_id: e.branchId })),
    branches: [...branches.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
};
