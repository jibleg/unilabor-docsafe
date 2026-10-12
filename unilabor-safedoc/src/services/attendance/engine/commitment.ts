import { roundTo, type DateString } from './time';
import { blockOf, type Granularity } from './periods';
import type { WeekStart } from './time';
import type { DayResult } from './day-calculator';

/**
 * Metricas de compromiso (roadmap 7.7). PURO: a partir de filas de
 * attendance.daily_results calcula asistencia, puntualidad, salidas, indice,
 * nivel, rachas, ranking y tendencia. Una sola regla de "falta" para todos los
 * tableros: absent + is_late_accumulation_absence.
 */

export interface CommitmentRow {
  employeeId: number;
  workDate: DateString;
  dayResult: DayResult;
  isLateAccumulationAbsence: boolean;
  lateMinutes: number;
  workedHours: number | null;
  overtimeHours: number;
  /** Hay instante de salida registrado. */
  hasClockOut: boolean;
}

export interface CommitmentWeights {
  attendance: number;
  punctuality: number;
  exits: number;
  exemplary: number;
  attention: number;
}

export type CommitmentLevel = 'exemplary' | 'committed' | 'regular' | 'attention' | 'no_data';

export interface CommitmentSummary {
  expected: number;
  attendances: number;
  punctual: number;
  lates: number;
  lateMinutes: number;
  absences: number;
  partialAbsences: number;
  earlyDepartures: number;
  missingExit: number;
  completeExits: number;
  present: number;
  incidents: number;
  hours: number;
  overtimeHours: number;
  pctAttendance: number | null;
  pctPunctuality: number | null;
  pctExits: number | null;
  index: number | null;
  level: CommitmentLevel;
  currentStreak: number;
  bestStreak: number;
}

const NO_SCHEDULE_RESULTS: readonly DayResult[] = ['rest_day', 'holiday', 'no_schedule'];
const PRESENT_RESULTS: readonly DayResult[] = ['present', 'late', 'early_departure'];
/** Resultados que no cuentan para la racha puntual (no se evaluo puntualidad). */
const STREAK_SKIP: readonly DayResult[] = ['rest_day', 'holiday', 'no_schedule', 'incident'];

export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 100) : null);

export const isAbsence = (row: Pick<CommitmentRow, 'dayResult' | 'isLateAccumulationAbsence'>): boolean =>
  row.dayResult === 'absent' || row.isLateAccumulationAbsence;

const breaksStreak = (row: CommitmentRow): boolean =>
  row.dayResult === 'late' || row.dayResult === 'absent' || row.dayResult === 'partial_absence' || row.isLateAccumulationAbsence;

export const levelOf = (index: number | null, weights: Pick<CommitmentWeights, 'exemplary' | 'attention'>): CommitmentLevel => {
  if (index === null) return 'no_data';
  if (index >= weights.exemplary) return 'exemplary';
  if (index >= (weights.exemplary + weights.attention) / 2) return 'committed';
  if (index >= weights.attention) return 'regular';
  return 'attention';
};

export const commitmentIndex = (
  pctAttendance: number | null,
  pctPunctuality: number | null,
  pctExits: number | null,
  weights: Pick<CommitmentWeights, 'attendance' | 'punctuality' | 'exits'>,
): number | null => {
  const total = weights.attendance + weights.punctuality + weights.exits;
  if (pctAttendance === null || total === 0) return null;
  return Math.round(
    (pctAttendance * weights.attendance +
      (pctPunctuality ?? pctAttendance) * weights.punctuality +
      (pctExits ?? pctAttendance) * weights.exits) / total,
  );
};

/** Racha puntual vigente: desde la fecha mas reciente hacia atras. */
export const currentPunctualStreak = (rows: readonly CommitmentRow[]): number => {
  const sorted = [...rows].sort((a, b) => b.workDate.localeCompare(a.workDate));
  let streak = 0;
  for (const row of sorted) {
    if (STREAK_SKIP.includes(row.dayResult)) continue;
    if (breaksStreak(row)) break;
    streak += 1;
  }
  return streak;
};

export const bestPunctualStreak = (rows: readonly CommitmentRow[]): number => {
  let best = 0;
  let current = 0;
  for (const row of [...rows].sort((a, b) => a.workDate.localeCompare(b.workDate))) {
    if (STREAK_SKIP.includes(row.dayResult)) continue;
    if (breaksStreak(row)) {
      current = 0;
      continue;
    }
    current += 1;
    best = Math.max(best, current);
  }
  return best;
};

export const summarizeCommitment = (
  rows: readonly CommitmentRow[],
  weights: CommitmentWeights,
): CommitmentSummary => {
  const scheduled = rows.filter((row) => !NO_SCHEDULE_RESULTS.includes(row.dayResult));
  const incidents = scheduled.filter((row) => row.dayResult === 'incident').length;
  const expectedRows = scheduled.filter((row) => row.dayResult !== 'incident');
  const expected = expectedRows.length;
  const presentRows = expectedRows.filter((row) => PRESENT_RESULTS.includes(row.dayResult));
  const partialAbsences = expectedRows.filter((row) => row.dayResult === 'partial_absence').length;
  const attendances = presentRows.length + partialAbsences * 0.5;
  const punctual = expectedRows.filter(
    (row) => (row.dayResult === 'present' || row.dayResult === 'early_departure') && !row.isLateAccumulationAbsence,
  ).length;
  const earlyDepartures = presentRows.filter((row) => row.dayResult === 'early_departure').length;
  const missingExit = presentRows.filter((row) => row.dayResult !== 'early_departure' && !row.hasClockOut).length;
  const completeExits = presentRows.length - earlyDepartures - missingExit;

  const pctAttendance = pct(attendances, expected);
  const pctPunctuality = pct(punctual, expected);
  const pctExits = pct(completeExits, presentRows.length);
  const index = commitmentIndex(pctAttendance, pctPunctuality, pctExits, weights);

  return {
    expected,
    attendances,
    punctual,
    lates: expectedRows.filter((row) => row.dayResult === 'late').length,
    lateMinutes: expectedRows.reduce((sum, row) => sum + row.lateMinutes, 0),
    absences: expectedRows.filter(isAbsence).length,
    partialAbsences,
    earlyDepartures,
    missingExit,
    completeExits,
    present: presentRows.length,
    incidents,
    hours: roundTo(rows.reduce((sum, row) => sum + (row.workedHours ?? 0), 0), 1),
    overtimeHours: roundTo(rows.reduce((sum, row) => sum + row.overtimeHours, 0), 1),
    pctAttendance,
    pctPunctuality,
    pctExits,
    index,
    level: levelOf(index, weights),
    currentStreak: currentPunctualStreak(rows),
    bestStreak: bestPunctualStreak(rows),
  };
};

export interface RankingEntry {
  name: string;
  summary: Pick<CommitmentSummary, 'index' | 'absences' | 'lates' | 'currentStreak'>;
}

/** Orden del ranking: indice desc (nulls al final), faltas asc, retardos asc, racha desc, nombre. */
export const compareRanking = (a: RankingEntry, b: RankingEntry): number => {
  const ia = a.summary.index;
  const ib = b.summary.index;
  if (ia === null && ib !== null) return 1;
  if (ib === null && ia !== null) return -1;
  if (ia !== null && ib !== null && ia !== ib) return ib - ia;
  return (
    a.summary.absences - b.summary.absences ||
    a.summary.lates - b.summary.lates ||
    b.summary.currentStreak - a.summary.currentStreak ||
    a.name.localeCompare(b.name, 'es')
  );
};

export interface TrendBlock {
  date: string;
  label: string;
  attendances: number;
  lates: number;
  absences: number;
  incidents: number;
}

/** Totales por dia, semana o mes para la grafica de tendencia. */
export const trendByBlock = (
  rows: readonly CommitmentRow[],
  granularity: Granularity,
  weekStart: WeekStart,
): TrendBlock[] => {
  const blocks = new Map<string, TrendBlock>();
  for (const row of rows) {
    if (NO_SCHEDULE_RESULTS.includes(row.dayResult)) continue;
    const { key, label } = blockOf(row.workDate, granularity, weekStart);
    const block = blocks.get(key) ?? { date: key, label, attendances: 0, lates: 0, absences: 0, incidents: 0 };
    if (row.dayResult === 'incident') block.incidents += 1;
    else if (isAbsence(row) || row.dayResult === 'partial_absence') block.absences += 1;
    else if (row.dayResult === 'late') block.lates += 1;
    else block.attendances += 1;
    blocks.set(key, block);
  }
  return [...blocks.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export const LEVEL_LABELS: Record<CommitmentLevel, string> = {
  exemplary: 'Ejemplar',
  committed: 'Comprometido',
  regular: 'Regular',
  attention: 'Requiere atención',
  no_data: 'Sin datos',
};

export const DAY_RESULT_LABELS: Record<DayResult, string> = {
  present: 'Asistencia',
  late: 'Retardo',
  absent: 'Falta',
  partial_absence: 'Falta parcial',
  early_departure: 'Salida anticipada',
  incident: 'Incidencia',
  rest_day: 'Descanso',
  holiday: 'Festivo',
  no_schedule: 'Sin horario',
};
