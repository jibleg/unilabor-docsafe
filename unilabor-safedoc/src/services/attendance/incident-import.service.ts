import ExcelJS from 'exceljs';
import pool from '../../config/db';
import { withTransaction } from '../../utils/transaction';
import { AttendanceError, invalid } from './attendance-errors';
import { isDateString } from './engine/time';
import {
  applyIncidentEffects,
  createIncidentTx,
  notifyIncidentAuthorized,
} from './incidents.service';

/**
 * Importacion de incidencias desde Excel: plantilla, lectura y validacion fila
 * por fila (simulate) e insercion de las filas validas (import).
 */

export const IMPORT_SHEET = 'Incidencias';
export const IMPORT_MAX_ROWS = 500;

type ColumnKey =
  | 'employee_number' | 'type' | 'start_date' | 'end_date' | 'hours' | 'reason' | 'imss_folio' | 'authorize' | 'notes';

interface ColumnDef {
  key: ColumnKey;
  required: boolean;
  width: number;
  help: string;
  format: string;
  example: string;
  aliases: string[];
}

const COLUMNS: readonly ColumnDef[] = [
  { key: 'employee_number', required: true, width: 18, aliases: ['numero_empleado', 'numero_de_reloj'],
    help: 'Numero de empleado del colaborador o su employee_code. Debe estar habilitado en asistencias.',
    format: 'Texto. Ver hoja Catalogos.', example: '1001' },
  { key: 'type', required: true, width: 26, aliases: ['tipo'],
    help: 'Tipo de incidencia: el nombre o el codigo del catalogo.', format: 'Elige de la lista.', example: 'Vacaciones' },
  { key: 'start_date', required: true, width: 16, aliases: ['fecha_inicio'],
    help: 'Primer dia de la incidencia.', format: 'AAAA-MM-DD, DD/MM/AAAA o fecha de Excel.', example: '2026-10-20' },
  { key: 'end_date', required: false, width: 16, aliases: ['fecha_fin'],
    help: 'Ultimo dia. Vacia = un solo dia (igual a start_date).', format: 'Igual que start_date; no anterior.', example: '2026-10-24' },
  { key: 'hours', required: false, width: 10, aliases: ['horas'],
    help: 'Solo para tipos por horas (horas extra): obligatoria en ellos; en los demas se ignora.', format: 'Numero mayor a 0 y hasta 24.', example: '2' },
  { key: 'reason', required: false, width: 32, aliases: ['motivo'],
    help: 'Descripcion o motivo.', format: 'Texto libre.', example: 'Vacaciones de octubre' },
  { key: 'imss_folio', required: false, width: 16, aliases: ['folio_imss'],
    help: 'Folio de la incapacidad del IMSS, si aplica.', format: 'Texto (max 40).', example: '' },
  { key: 'authorize', required: false, width: 12, aliases: ['autorizar'],
    help: 'SI = se importa ya autorizada. NO o vacio = queda capturada por autorizar.', format: 'SI o NO.', example: 'SI' },
  { key: 'notes', required: false, width: 28, aliases: ['notas'],
    help: 'Notas de la autorizacion (solo si authorize = SI).', format: 'Texto libre.', example: 'Aprobado por RH' },
];

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

// -----------------------------------------------------------------------------
// Catalogos
// -----------------------------------------------------------------------------

interface ImportType {
  id: number; code: string; name: string; requires_attachment: boolean; is_hourly: boolean; is_paid: boolean;
}
interface ImportEmployee {
  id: number; full_name: string; employee_code: string; device_number: string | null;
}

const loadCatalogs = async (): Promise<{ types: ImportType[]; employees: ImportEmployee[] }> => {
  const [types, employees] = await Promise.all([
    pool.query<{ id: string; code: string; name: string; requires_attachment: boolean; is_hourly: boolean; is_paid: boolean }>(
      `SELECT id::text, code, name, requires_attachment, is_hourly, is_paid
         FROM attendance.incident_types WHERE is_active ORDER BY sort_order, name`,
    ),
    pool.query<{ id: string; full_name: string; employee_code: string; device_number: string | null }>(
      `SELECT e.id::text, e.full_name, e.employee_code, p.device_employee_number AS device_number
         FROM public.employees e
         JOIN attendance.employee_profiles p ON p.employee_id = e.id AND p.is_enabled
        WHERE e.is_active ORDER BY e.full_name`,
    ),
  ]);
  return {
    types: types.rows.map((row) => ({ ...row, id: Number(row.id) })),
    employees: employees.rows.map((row) => ({
      id: Number(row.id), full_name: row.full_name, employee_code: row.employee_code, device_number: row.device_number,
    })),
  };
};

const employeeLabel = (employee: ImportEmployee): string => employee.device_number ?? employee.employee_code;

// -----------------------------------------------------------------------------
// Plantilla
// -----------------------------------------------------------------------------

export const buildImportTemplate = async (): Promise<Buffer> => {
  const { types, employees } = await loadCatalogs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DocSafe - Control de Asistencias';

  const headerStyle = (sheet: ExcelJS.Worksheet): void => {
    const row = sheet.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF034898' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const data = workbook.addWorksheet(IMPORT_SHEET);
  data.columns = COLUMNS.map((column) => ({ header: column.key, key: column.key, width: column.width }));
  headerStyle(data);
  const lastType = Math.max(2, types.length + 1);
  for (let r = 2; r <= IMPORT_MAX_ROWS + 1; r += 1) {
    data.getCell(`B${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`Catalogos!$B$2:$B$${lastType}`],
    };
    data.getCell(`H${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"SI,NO"'] };
  }

  const help = workbook.addWorksheet('Instrucciones');
  help.columns = [{ width: 18 }, { width: 13 }, { width: 62 }, { width: 44 }, { width: 20 }];
  help.addRow(['Columna', 'Obligatoria', 'Que captura', 'Formato', 'Ejemplo']);
  headerStyle(help);
  for (const column of COLUMNS) {
    help.addRow([column.key, column.required ? 'SI' : 'No', column.help, column.format, column.example]);
  }
  help.addRow([]);
  help.addRow([
    'Como llenarla', '',
    `1) Una incidencia por fila en la hoja ${IMPORT_SHEET}, debajo de los encabezados (no los cambies). 2) Maximo ${IMPORT_MAX_ROWS} filas. 3) La hoja Catalogos lista los tipos y colaboradores validos. 4) Primero se revisa el archivo (simulacion); solo se importan las filas sin error.`,
  ]);
  help.addRow([
    'Reglas', '',
    'Los dias se cuentan segun la programacion del colaborador y excluyen festivos. Una incidencia igual (mismo colaborador, tipo y fechas) se omite como duplicada. Los tipos que requieren comprobante se importan como capturada aunque pongas SI en authorize: adjunta el archivo desde la incidencia y autorizala ahi.',
  ]);

  const example = workbook.addWorksheet('Ejemplo');
  example.columns = COLUMNS.map((column) => ({ header: column.key, key: column.key, width: column.width }));
  headerStyle(example);
  const sampleEmployee = employees[0] ? employeeLabel(employees[0]) : '1001';
  const normalType = types.find((t) => !t.is_hourly);
  const hourlyType = types.find((t) => t.is_hourly);
  example.addRow([sampleEmployee, normalType?.name ?? 'Vacaciones', '2026-10-20', '2026-10-24', '', 'Vacaciones de octubre', '', 'SI', 'Aprobado por RH']);
  if (hourlyType) {
    example.addRow([sampleEmployee, hourlyType.name, '2026-10-15', '', 2, 'Cierre de mes', '', 'NO', '']);
  }
  example.addRow([sampleEmployee, normalType?.name ?? 'Vacaciones', '2026-11-03', '', '', 'Permiso de un dia', '', 'NO', '']);

  const catalogs = workbook.addWorksheet('Catalogos');
  catalogs.columns = [
    { width: 20 }, { width: 28 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 4 }, { width: 18 }, { width: 38 },
  ];
  catalogs.addRow(['code', 'type (nombre)', 'Requiere comprobante', 'Por horas', 'Con goce', '', 'employee_number', 'colaborador']);
  headerStyle(catalogs);
  const rowsCount = Math.max(types.length, employees.length);
  for (let i = 0; i < rowsCount; i += 1) {
    const type = types[i];
    const employee = employees[i];
    catalogs.addRow([
      type?.code ?? '', type?.name ?? '',
      type ? (type.requires_attachment ? 'SI' : 'No') : '',
      type ? (type.is_hourly ? 'SI' : 'No') : '',
      type ? (type.is_paid ? 'SI' : 'No') : '',
      '', employee ? employeeLabel(employee) : '', employee?.full_name ?? '',
    ]);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
};

// -----------------------------------------------------------------------------
// Lectura del libro
// -----------------------------------------------------------------------------

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

const cellToText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) return cellToText(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
  }
  return '';
};

const sheetToRows = (sheet: ExcelJS.Worksheet): string[][] => {
  const rows: string[][] = [];
  const columnCount = sheet.columnCount;
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= columnCount; c += 1) cells.push(cellToText(row.getCell(c).value));
    rows.push(cells);
  }
  return rows;
};

/** Fecha AAAA-MM-DD, DD/MM/AAAA o serial de Excel -> AAAA-MM-DD (null si no se entiende). */
export const parseImportDate = (raw: string): string | null => {
  const text = raw.trim();
  if (!text) return null;
  let iso: string | null = null;
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    iso = new Date(EXCEL_EPOCH_MS + Math.floor(Number(text)) * 86_400_000).toISOString().slice(0, 10);
  } else if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    const [y, m, d] = text.slice(0, 10).split('-').map(Number) as [number, number, number];
    iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text)) {
    const [d, m, y] = text.split(/[/-]/).map(Number) as [number, number, number];
    iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return iso && isDateString(iso) ? iso : null;
};

const findHeaders = (rows: string[][]): { index: number; columns: Partial<Record<ColumnKey, number>> } | null => {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const columns: Partial<Record<ColumnKey, number>> = {};
    (rows[i] ?? []).forEach((cell, j) => {
      const name = normalize(cell);
      const column = COLUMNS.find((def) => def.key === name || def.aliases.includes(name));
      if (column && columns[column.key] === undefined) columns[column.key] = j;
    });
    if (columns.employee_number !== undefined && columns.type !== undefined && columns.start_date !== undefined) {
      return { index: i, columns };
    }
  }
  return null;
};

// -----------------------------------------------------------------------------
// Validacion
// -----------------------------------------------------------------------------

export interface ImportRowParsed {
  employeeId: number;
  typeId: number;
  startDate: string;
  endDate: string;
  hours: number | undefined;
  reason: string | undefined;
  imssFolio: string | undefined;
  authorize: boolean;
  notes: string | undefined;
  typeRequiresAttachment: boolean;
}

export interface ImportRowResult {
  row: number;
  status: 'ok' | 'duplicate' | 'error';
  errors: string[];
  warnings: string[];
  employee: string;
  type: string;
  start_date: string;
  end_date: string;
  parsed: ImportRowParsed | null;
}

const incidentKey = (employeeId: number, typeId: number, start: string, end: string): string =>
  `${employeeId}|${typeId}|${start}|${end}`;

const validateRows = async (
  rows: string[][],
): Promise<{ results: ImportRowResult[] }> => {
  const headers = findHeaders(rows);
  if (!headers) {
    return invalid(
      `No se encontraron los encabezados (${COLUMNS.filter((c) => c.required).map((c) => c.key).join(', ')}). Usa la plantilla y no cambies los nombres de columna.`,
    );
  }
  const { types, employees } = await loadCatalogs();
  const existing = await pool.query<{ employee_id: string; incident_type_id: string; start_date: string; end_date: string }>(
    `SELECT employee_id::text, incident_type_id::text, start_date::text AS start_date, end_date::text AS end_date
       FROM attendance.incidents WHERE incident_status IN ('captured', 'authorized')`,
  );
  const seen = new Set(
    existing.rows.map((row) => incidentKey(Number(row.employee_id), Number(row.incident_type_id), row.start_date, row.end_date)),
  );

  const byNumber = new Map<string, ImportEmployee>();
  for (const employee of employees) {
    byNumber.set(employee.employee_code.trim().toUpperCase(), employee);
    if (employee.device_number) byNumber.set(employee.device_number.trim().toUpperCase(), employee);
  }
  const byType = new Map<string, ImportType>();
  for (const type of types) {
    byType.set(normalize(type.code), type);
    byType.set(normalize(type.name), type);
  }

  const results: ImportRowResult[] = [];
  const cell = (row: string[], key: ColumnKey): string => {
    const index = headers.columns[key];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  for (let i = headers.index + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (row.every((value) => !value.trim())) continue;
    if (results.length >= IMPORT_MAX_ROWS) {
      invalid(`El archivo tiene mas de ${IMPORT_MAX_ROWS} filas; dividelo en varios.`);
    }
    const errors: string[] = [];
    const warnings: string[] = [];

    const number = cell(row, 'employee_number');
    const employee = number ? byNumber.get(number.toUpperCase()) : undefined;
    if (!number) errors.push('Falta employee_number');
    else if (!employee) errors.push(`El numero "${number}" no corresponde a un colaborador habilitado`);

    const typeText = cell(row, 'type');
    const type = typeText ? byType.get(normalize(typeText)) : undefined;
    if (!typeText) errors.push('Falta el tipo de incidencia');
    else if (!type) errors.push(`El tipo "${typeText}" no esta en el catalogo`);

    const startText = cell(row, 'start_date');
    const startDate = parseImportDate(startText);
    if (!startText) errors.push('Falta start_date');
    else if (!startDate) errors.push(`start_date invalida "${startText}" (usa AAAA-MM-DD)`);
    const endText = cell(row, 'end_date');
    const endDate = endText ? parseImportDate(endText) : startDate;
    if (endText && !endDate) errors.push(`end_date invalida "${endText}" (usa AAAA-MM-DD)`);
    if (startDate && endDate && endDate < startDate) errors.push('end_date es anterior a start_date');

    let hours: number | undefined;
    if (type?.is_hourly) {
      hours = Number(cell(row, 'hours').replace(',', '.'));
      if (!(hours > 0 && hours <= 24)) errors.push('Este tipo se captura en horas: indica hours (mayor a 0 y hasta 24)');
      if (startDate && endDate && endDate !== startDate) errors.push('Este tipo se captura en una sola fecha');
    } else if (cell(row, 'hours')) {
      warnings.push('La columna hours se ignora en este tipo');
    }

    const wantsAuthorize = /^(si|s|1|x|true|yes)$/i.test(normalize(cell(row, 'authorize')).replace(/_/g, ''));
    let authorize = wantsAuthorize;
    if (type?.requires_attachment) {
      if (wantsAuthorize) {
        authorize = false;
        warnings.push('Requiere comprobante: se importa como capturada; adjunta el archivo y autorizala despues');
      } else {
        warnings.push('Requiere comprobante: adjuntalo despues desde la incidencia');
      }
    }

    let status: ImportRowResult['status'] = errors.length ? 'error' : 'ok';
    if (status === 'ok' && employee && type && startDate && endDate) {
      const key = incidentKey(employee.id, type.id, startDate, endDate);
      if (seen.has(key)) {
        status = 'duplicate';
        warnings.push('Ya existe una incidencia igual (o esta repetida en el archivo): se omite');
      } else {
        seen.add(key);
      }
    }

    results.push({
      row: i + 1,
      status,
      errors,
      warnings,
      employee: employee ? `${employee.full_name} (${employeeLabel(employee)})` : number,
      type: type?.name ?? typeText,
      start_date: startDate ?? startText,
      end_date: endDate ?? endText,
      parsed:
        status === 'ok' && employee && type && startDate && endDate
          ? {
              employeeId: employee.id, typeId: type.id, startDate, endDate, hours,
              reason: cell(row, 'reason') || undefined, imssFolio: cell(row, 'imss_folio') || undefined,
              authorize, notes: cell(row, 'notes') || undefined, typeRequiresAttachment: type.requires_attachment,
            }
          : null,
    });
  }
  if (results.length === 0) invalid('El archivo no tiene filas de datos.');
  return { results };
};

const readWorkbookRows = async (buffer: Buffer): Promise<string[][]> => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return invalid('No se pudo leer el archivo: no parece un .xlsx valido.');
  }
  const sheets = [
    ...workbook.worksheets.filter((sheet) => sheet.name === IMPORT_SHEET),
    ...workbook.worksheets.filter((sheet) => sheet.name !== IMPORT_SHEET),
  ];
  for (const sheet of sheets) {
    const rows = sheetToRows(sheet);
    if (findHeaders(rows)) return rows;
  }
  return invalid(
    `No se encontraron los encabezados (${COLUMNS.filter((c) => c.required).map((c) => c.key).join(', ')}). Usa la plantilla y no cambies los nombres de columna.`,
  );
};

const publicRow = ({ parsed: _parsed, ...rest }: ImportRowResult) => rest;

export interface SimulateSummary {
  total: number;
  ok: number;
  duplicate: number;
  error: number;
}

const summarizeRows = (results: readonly ImportRowResult[]): SimulateSummary => ({
  total: results.length,
  ok: results.filter((r) => r.status === 'ok').length,
  duplicate: results.filter((r) => r.status === 'duplicate').length,
  error: results.filter((r) => r.status === 'error').length,
});

/** Valida el archivo sin guardar nada. */
export const simulateIncidentImport = async (buffer: Buffer) => {
  const { results } = await validateRows(await readWorkbookRows(buffer));
  return { summary: summarizeRows(results), rows: results.map(publicRow) };
};

/** Vuelve a validar el mismo archivo e inserta SOLO las filas ok, cada una en su transaccion. */
export const importIncidents = async (buffer: Buffer, userId: string) => {
  const { results } = await validateRows(await readWorkbookRows(buffer));
  const outcome = new Map<number, { imported: boolean; incident_id: number | null; authorized: boolean; failure: string | null }>();

  for (const result of results) {
    const parsed = result.parsed;
    if (result.status !== 'ok' || !parsed) continue;
    try {
      const created = await withTransaction((client) =>
        createIncidentTx(
          client,
          {
            employeeId: parsed.employeeId, incidentTypeId: parsed.typeId, startDate: parsed.startDate,
            endDate: parsed.endDate, hours: parsed.hours, reason: parsed.reason, imssFolio: parsed.imssFolio,
            authorize: parsed.authorize, authorizationNotes: parsed.notes,
          },
          [],
          userId,
          { allowMissingAttachment: true },
        ),
      );
      if (created.authorized) {
        await applyIncidentEffects({
          employeeId: parsed.employeeId, startDate: parsed.startDate, endDate: created.endDate,
          deductsVacation: created.deductsVacation,
        });
        await notifyIncidentAuthorized(created.id);
      }
      outcome.set(result.row, { imported: true, incident_id: created.id, authorized: created.authorized, failure: null });
    } catch (error) {
      const message = error instanceof AttendanceError ? error.publicMessage : 'No se pudo guardar la fila';
      if (!(error instanceof AttendanceError)) console.error('[attendance] importacion, fila', result.row, error);
      outcome.set(result.row, { imported: false, incident_id: null, authorized: false, failure: message });
    }
  }

  const rows = results.map((result) => {
    const done = outcome.get(result.row);
    const base = publicRow(result);
    return {
      ...base,
      status: done?.failure ? ('error' as const) : result.status,
      errors: done?.failure ? [...result.errors, done.failure] : result.errors,
      imported: done?.imported ?? false,
      authorized: done?.authorized ?? false,
      incident_id: done?.incident_id ?? null,
    };
  });
  const imported = rows.filter((r) => r.imported).length;
  const failed = [...outcome.values()].filter((o) => o.failure).length;
  return {
    summary: {
      total: rows.length,
      imported,
      authorized: rows.filter((r) => r.authorized).length,
      skipped: rows.length - imported - failed,
      failed,
    },
    rows,
  };
};
