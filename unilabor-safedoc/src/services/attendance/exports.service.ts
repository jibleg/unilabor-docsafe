import ExcelJS from 'exceljs';
import pool from '../../config/db';
import { getAttendanceSettings } from './attendance-settings.service';
import { invalid } from './attendance-errors';
import {
  loadCommitmentData, toApiSummary, type CommitmentData, type CommitmentFilters,
} from './board-commitment.service';
import { DAY_RESULT_LABELS, LEVEL_LABELS, trendByBlock } from './engine/commitment';
import type { DayResult } from './engine/day-calculator';
import type { DateString } from './engine/time';
import { MAX_DAYS_EXPORT_ROWS } from '../../schemas/attendance/exports.schema';

/** Exportaciones a Excel (exceljs). Cada funcion devuelve el libro y un nombre de archivo sugerido. */

export interface ExcelExport {
  workbook: ExcelJS.Workbook;
  fileName: string;
}

const HEADER_FILL = 'FF00416A';
const TOTAL_FILL = 'FFE8EEF3';

const newWorkbook = (title: string): ExcelJS.Workbook => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DocSafe - Control de Asistencias';
  workbook.title = title;
  workbook.created = new Date();
  return workbook;
};

interface ColumnSpec {
  header: string;
  key: string;
  width: number;
  format?: string;
  align?: 'left' | 'center' | 'right';
}

/** Hoja con encabezado estilizado, filtros y fila congelada. */
const addTable = (
  workbook: ExcelJS.Workbook,
  name: string,
  columns: readonly ColumnSpec[],
  rows: readonly Record<string, unknown>[],
  preamble: readonly string[] = [],
): ExcelJS.Worksheet => {
  const sheet = workbook.addWorksheet(name);
  preamble.forEach((text, index) => {
    const cell = sheet.getCell(index + 1, 1);
    cell.value = text;
    cell.font = { bold: index === 0, size: index === 0 ? 14 : 10, color: { argb: 'FF1F2933' } };
  });
  const headerRowNumber = preamble.length === 0 ? 1 : preamble.length + 2;
  const headerRow = sheet.getRow(headerRowNumber);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    sheet.getColumn(index + 1).width = column.width;
  });
  headerRow.height = 28;
  rows.forEach((data, rowIndex) => {
    const row = sheet.getRow(headerRowNumber + 1 + rowIndex);
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      const value = data[column.key];
      cell.value = (value ?? null) as ExcelJS.CellValue;
      if (column.format) cell.numFmt = column.format;
      cell.alignment = { vertical: 'middle', horizontal: column.align ?? (typeof value === 'number' ? 'right' : 'left') };
    });
  });
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + rows.length, column: columns.length },
    };
  }
  return sheet;
};

/** 'YYYY-MM-DD' -> Date UTC (la celda usa formato dd/mm/yyyy, sin corrimiento de zona). */
const toExcelDate = (date: DateString): Date => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
const DATE_FORMAT = 'dd/mm/yyyy';

const percentOrNull = (value: number | null): number | null => (value === null ? null : value / 100);

const commitmentColumns = (): ColumnSpec[] => [
  { header: 'Lugar', key: 'place', width: 8, align: 'center' },
  { header: 'Número', key: 'code', width: 12 },
  { header: 'Colaborador', key: 'name', width: 34 },
  { header: 'Sucursal', key: 'branch', width: 22 },
  { header: 'Índice', key: 'index', width: 10, align: 'center' },
  { header: 'Nivel', key: 'level', width: 18 },
  { header: 'Días esperados', key: 'expected', width: 12, align: 'center' },
  { header: 'Asistencias', key: 'attendances', width: 12, format: '0.0', align: 'center' },
  { header: '% Asistencia', key: 'pctAttendance', width: 12, format: '0%', align: 'center' },
  { header: '% Puntualidad', key: 'pctPunctuality', width: 13, format: '0%', align: 'center' },
  { header: '% Salidas', key: 'pctExits', width: 11, format: '0%', align: 'center' },
  { header: 'Retardos', key: 'lates', width: 10, align: 'center' },
  { header: 'Min. retardo', key: 'lateMinutes', width: 12, align: 'center' },
  { header: 'Faltas', key: 'absences', width: 9, align: 'center' },
  { header: 'Faltas parciales', key: 'partialAbsences', width: 12, align: 'center' },
  { header: 'Salidas anticipadas', key: 'earlyDepartures', width: 13, align: 'center' },
  { header: 'Sin salida', key: 'missingExit', width: 11, align: 'center' },
  { header: 'Incidencias', key: 'incidents', width: 11, align: 'center' },
  { header: 'Horas', key: 'hours', width: 9, format: '0.0', align: 'center' },
  { header: 'Horas extra', key: 'overtimeHours', width: 11, format: '0.0', align: 'center' },
  { header: 'Racha puntual', key: 'streak', width: 13, align: 'center' },
];

const daysColumns = (withEmployee: boolean): ColumnSpec[] => [
  { header: 'Fecha', key: 'date', width: 12, format: DATE_FORMAT, align: 'center' },
  ...(withEmployee
    ? [
        { header: 'Número', key: 'code', width: 12 },
        { header: 'Colaborador', key: 'name', width: 34 },
        { header: 'Área', key: 'area', width: 22 },
        { header: 'Sucursal', key: 'branch', width: 22 },
      ]
    : []),
  { header: 'Resultado', key: 'result', width: 18 },
  { header: 'Entrada esperada', key: 'expectedStart', width: 12, align: 'center' },
  { header: 'Salida esperada', key: 'expectedEnd', width: 12, align: 'center' },
  { header: 'Entrada', key: 'clockIn', width: 10, align: 'center' },
  { header: 'Salida', key: 'clockOut', width: 10, align: 'center' },
  { header: 'Retardo (min)', key: 'lateMinutes', width: 12, align: 'center' },
  { header: 'Salida anticipada (min)', key: 'earlyMinutes', width: 14, align: 'center' },
  { header: 'Horas', key: 'hours', width: 9, format: '0.00', align: 'center' },
  { header: 'Horas extra', key: 'overtime', width: 11, format: '0.00', align: 'center' },
  { header: 'Falta por retardos', key: 'lateAbsence', width: 13, align: 'center' },
  { header: 'Revisión pendiente', key: 'pending', width: 13, align: 'center' },
  { header: 'Incidencia', key: 'incident', width: 22 },
];

const yesNo = (value: boolean): string => (value ? 'Sí' : 'No');

export const buildCommitmentWorkbook = async (filters: CommitmentFilters): Promise<ExcelExport> => {
  const data = await loadCommitmentData(filters);
  return { workbook: commitmentWorkbookFromData(data, filters), fileName: commitmentFileName(data, filters) };
};

export const periodTitle = (data: CommitmentData): string => `${data.range.from} a ${data.range.to}`;

const commitmentFileName = (data: CommitmentData, filters: CommitmentFilters): string =>
  `compromiso-asistencia_${data.range.from}_${data.range.to}${filters.employeeId === undefined ? '' : `_colaborador-${filters.employeeId}`}.xlsx`;

const commitmentWorkbookFromData = (data: CommitmentData, filters: CommitmentFilters): ExcelJS.Workbook => {
  const workbook = newWorkbook('Compromiso de asistencia');
  const team = toApiSummary(data.team);
  const note = data.closedTo < data.range.to ? ` (dias cerrados hasta ${data.closedTo})` : '';

  const summaryRows: Array<Record<string, unknown>> = [
    { metric: 'Periodo', value: `${data.range.from} a ${data.range.to}${note}` },
    { metric: 'Colaboradores', value: data.scopeEmployees.length },
    { metric: 'Índice de compromiso del equipo', value: team.index },
    { metric: 'Nivel', value: LEVEL_LABELS[team.level] },
    { metric: 'Días esperados', value: team.expected },
    { metric: 'Asistencias', value: team.attendances },
    { metric: '% Asistencia', value: percentOrNull(team.pct_attendance) },
    { metric: '% Puntualidad', value: percentOrNull(team.pct_punctuality) },
    { metric: '% Salidas completas', value: percentOrNull(team.pct_exits) },
    { metric: 'Retardos', value: team.lates },
    { metric: 'Minutos de retardo', value: team.late_minutes },
    { metric: 'Faltas (incluye por retardos)', value: team.absences },
    { metric: 'Faltas parciales', value: team.partial_absences },
    { metric: 'Salidas anticipadas', value: team.early_departures },
    { metric: 'Sin salida registrada', value: team.missing_exit },
    { metric: 'Incidencias', value: team.incidents },
    { metric: 'Horas trabajadas', value: team.hours },
    { metric: 'Horas extra', value: team.overtime_hours },
    { metric: 'Pesos (asistencia/puntualidad/salidas)', value: `${data.weights.attendance}/${data.weights.punctuality}/${data.weights.exits}` },
    { metric: 'Umbrales (ejemplar/atención)', value: `${data.weights.exemplary}/${data.weights.attention}` },
  ];
  const summarySheet = addTable(
    workbook, 'Resumen',
    [
      { header: 'Concepto', key: 'metric', width: 44 },
      { header: 'Valor', key: 'value', width: 34, align: 'left' },
    ],
    summaryRows,
  );
  [8, 9, 10].forEach((rowNumber) => { summarySheet.getRow(rowNumber).getCell(2).numFmt = '0%'; });

  addTable(
    workbook, 'Colaboradores', commitmentColumns(),
    data.ranking.map((p) => ({
      place: p.place, code: p.employee.code, name: p.employee.fullName, branch: p.employee.branchName,
      index: p.summary.index, level: LEVEL_LABELS[p.summary.level], expected: p.summary.expected,
      attendances: p.summary.attendances, pctAttendance: percentOrNull(p.summary.pctAttendance),
      pctPunctuality: percentOrNull(p.summary.pctPunctuality), pctExits: percentOrNull(p.summary.pctExits),
      lates: p.summary.lates, lateMinutes: p.summary.lateMinutes, absences: p.summary.absences,
      partialAbsences: p.summary.partialAbsences, earlyDepartures: p.summary.earlyDepartures,
      missingExit: p.summary.missingExit, incidents: p.summary.incidents, hours: p.summary.hours,
      overtimeHours: p.summary.overtimeHours, streak: p.summary.currentStreak,
    })),
  );

  if (filters.employeeId !== undefined) {
    const person = data.ranking[0];
    const rows = data.rows.filter((row) => row.employeeId === filters.employeeId);
    addTable(
      workbook, 'Días', daysColumns(false),
      rows.map((row) => dayRow(row)),
      person ? [`${person.employee.fullName} (${person.employee.code})`, `Periodo ${periodTitle(data)}`] : [],
    );
  }
  // Tendencia disponible como referencia en el libro (misma regla de faltas).
  const trend = trendByBlock(data.rows, data.granularity, data.settings.week_start);
  addTable(
    workbook, 'Tendencia',
    [
      { header: 'Bloque', key: 'date', width: 14 },
      { header: 'Asistencias', key: 'attendances', width: 13, align: 'center' },
      { header: 'Retardos', key: 'lates', width: 11, align: 'center' },
      { header: 'Faltas', key: 'absences', width: 10, align: 'center' },
      { header: 'Incidencias', key: 'incidents', width: 12, align: 'center' },
    ],
    trend.map((block) => ({ ...block })),
  );
  return workbook;
};

interface DayLike {
  workDate: DateString;
  dayResult: DayResult;
  expectedStart: string | null;
  expectedEnd: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  workedHours: number | null;
  overtimeHours: number;
  isLateAccumulationAbsence: boolean;
  hasPendingReview: boolean;
  incidentName: string | null;
}

const dayRow = (row: DayLike): Record<string, unknown> => ({
  date: toExcelDate(row.workDate),
  result: DAY_RESULT_LABELS[row.dayResult],
  expectedStart: row.expectedStart, expectedEnd: row.expectedEnd,
  clockIn: row.clockInAt, clockOut: row.clockOutAt,
  lateMinutes: row.lateMinutes, earlyMinutes: row.earlyDepartureMinutes,
  hours: row.workedHours, overtime: row.overtimeHours,
  lateAbsence: yesNo(row.isLateAccumulationAbsence), pending: yesNo(row.hasPendingReview),
  incident: row.incidentName,
});

interface DayExportRow extends DayLike {
  code: string;
  fullName: string;
  area: string | null;
  branchName: string | null;
}

const queryDays = async (
  from: DateString,
  to: DateString,
  opts: { result?: DayResult | undefined; branchId?: number | undefined; employeeId?: number | undefined; onlyOvertime?: boolean },
  limit: number,
): Promise<DayExportRow[]> => {
  const settings = await getAttendanceSettings();
  const { rows } = await pool.query<{
    work_date: string; day_result: DayResult; expected_start: string | null; expected_end: string | null;
    clock_in_at: string | null; clock_out_at: string | null; late_minutes: number; early_departure_minutes: number;
    worked_hours: string | null; overtime_hours: string; is_late_accumulation_absence: boolean;
    has_pending_review: boolean; incident_name: string | null; code: string; full_name: string;
    area: string | null; branch_name: string | null;
  }>(
    `SELECT to_char(dr.work_date, 'YYYY-MM-DD') AS work_date, dr.day_result,
            to_char(dr.expected_start_time, 'HH24:MI') AS expected_start,
            to_char(dr.expected_end_time, 'HH24:MI') AS expected_end,
            to_char(dr.clock_in_at AT TIME ZONE $7, 'HH24:MI') AS clock_in_at,
            to_char(dr.clock_out_at AT TIME ZONE $7, 'HH24:MI') AS clock_out_at,
            dr.late_minutes, dr.early_departure_minutes, dr.worked_hours, dr.overtime_hours,
            dr.is_late_accumulation_absence, dr.has_pending_review, it.name AS incident_name,
            e.employee_code AS code, e.full_name, e.area, b.name AS branch_name
       FROM attendance.daily_results dr
       JOIN public.employees e ON e.id = dr.employee_id
       LEFT JOIN public.helpdesk_asset_units b ON b.id = COALESCE(dr.branch_id, e.branch_id)
       LEFT JOIN attendance.incidents i ON i.id = dr.incident_id
       LEFT JOIN attendance.incident_types it ON it.id = i.incident_type_id
      WHERE dr.work_date BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR dr.day_result = $3)
        AND ($4::bigint IS NULL OR COALESCE(dr.branch_id, e.branch_id) = $4)
        AND ($5::bigint IS NULL OR dr.employee_id = $5)
        AND (NOT $8::boolean OR dr.overtime_hours > 0)
      ORDER BY dr.work_date, e.full_name
      LIMIT $6`,
    [from, to, opts.result ?? null, opts.branchId ?? null, opts.employeeId ?? null, limit, settings.timezone, opts.onlyOvertime === true],
  );
  return rows.map((row) => ({
    workDate: row.work_date, dayResult: row.day_result, expectedStart: row.expected_start, expectedEnd: row.expected_end,
    clockInAt: row.clock_in_at, clockOutAt: row.clock_out_at, lateMinutes: row.late_minutes,
    earlyDepartureMinutes: row.early_departure_minutes,
    workedHours: row.worked_hours === null ? null : Number(row.worked_hours),
    overtimeHours: Number(row.overtime_hours), isLateAccumulationAbsence: row.is_late_accumulation_absence,
    hasPendingReview: row.has_pending_review, incidentName: row.incident_name, code: row.code,
    fullName: row.full_name, area: row.area, branchName: row.branch_name,
  }));
};

const withEmployee = (row: DayExportRow): Record<string, unknown> => ({
  ...dayRow(row), code: row.code, name: row.fullName, area: row.area, branch: row.branchName,
});

export const buildDaysWorkbook = async (filters: {
  from: DateString; to: DateString; result?: DayResult | undefined; branchId?: number | undefined; employeeId?: number | undefined;
}): Promise<ExcelExport> => {
  const rows = await queryDays(filters.from, filters.to, filters, MAX_DAYS_EXPORT_ROWS + 1);
  if (rows.length > MAX_DAYS_EXPORT_ROWS) {
    invalid(`La exportación excede ${MAX_DAYS_EXPORT_ROWS} filas. Acota el rango o aplica filtros.`);
  }
  const workbook = newWorkbook('Días de asistencia');
  addTable(workbook, 'Días', daysColumns(true), rows.map(withEmployee));
  return { workbook, fileName: `dias-asistencia_${filters.from}_${filters.to}.xlsx` };
};

export const buildOvertimeWorkbook = async (filters: {
  from: DateString; to: DateString; branchId?: number | undefined;
}): Promise<ExcelExport> => {
  const rows = await queryDays(filters.from, filters.to, { branchId: filters.branchId, onlyOvertime: true }, 100_000);
  const perEmployee = new Map<string, { code: string; name: string; branch: string | null; days: number; hours: number }>();
  for (const row of rows) {
    const entry = perEmployee.get(row.code) ?? { code: row.code, name: row.fullName, branch: row.branchName, days: 0, hours: 0 };
    entry.days += 1;
    entry.hours += row.overtimeHours;
    perEmployee.set(row.code, entry);
  }
  const summary = [...perEmployee.values()]
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'es'))
    .map((entry) => ({ ...entry, hours: Math.round(entry.hours * 100) / 100 }));
  const total = Math.round(summary.reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100;

  const workbook = newWorkbook('Horas extra');
  const sheet = addTable(
    workbook, 'Resumen',
    [
      { header: 'Número', key: 'code', width: 12 },
      { header: 'Colaborador', key: 'name', width: 34 },
      { header: 'Sucursal', key: 'branch', width: 22 },
      { header: 'Días con horas extra', key: 'days', width: 16, align: 'center' },
      { header: 'Horas extra', key: 'hours', width: 12, format: '0.00', align: 'center' },
    ],
    summary,
    [`Horas extra ${filters.from} a ${filters.to}`],
  );
  const totalRow = sheet.addRow(['', 'TOTAL', '', summary.reduce((sum, entry) => sum + entry.days, 0), total]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
  });
  totalRow.getCell(5).numFmt = '0.00';
  totalRow.getCell(4).alignment = { horizontal: 'center' };
  totalRow.getCell(5).alignment = { horizontal: 'center' };

  addTable(workbook, 'Detalle', daysColumns(true), rows.map(withEmployee));
  return { workbook, fileName: `horas-extra_${filters.from}_${filters.to}.xlsx` };
};

export const workbookToBuffer = async (workbook: ExcelJS.Workbook): Promise<Buffer> =>
  Buffer.from(await workbook.xlsx.writeBuffer());
