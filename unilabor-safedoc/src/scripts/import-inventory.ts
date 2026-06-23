/**
 * Importador de un solo uso del inventario de equipos (ISO 15189) desde la
 * plantilla `Inventario-UNILABOR.xlsx`.
 *
 * NO es una ruta HTTP ni se integra a la UI: corre por linea de comandos contra
 * la BD configurada en `.env` (las mismas variables DB_* que el migrate runner).
 * No apuntar a produccion sin haber validado antes el dry-run.
 *
 * Uso:
 *   npm run import:inventory -- --file <ruta.xlsx>             # DRY-RUN (no escribe)
 *   npm run import:inventory -- --file <ruta.xlsx> --commit    # escribe en la BD
 *   opciones: --sheet "<nombre>" (def. INVENTARIO.UNILABOR), --report <ruta.txt>,
 *             --limit <n> (procesa solo las primeras n filas, util para probar)
 *
 * Decisiones (confirmadas con el usuario):
 *  - Reusa `createHelpdeskAsset` por fila => mismo comportamiento que la app
 *    (override de codigo preservado, ensureBrand, historial CREATE, status por defecto).
 *  - Catalogos faltantes (ubicacion, marca) se AUTO-CREAN y se reportan.
 *  - Inserta siempre (asume BD limpia); el dry-run es la red de seguridad.
 *  - Responsable = FK estricto: sin match unico => NULL + reporte.
 */
import { readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import ExcelJS from 'exceljs';
import pool from '../config/db';
import { createHelpdeskAsset, HelpdeskAssetPayload } from '../services/helpdesk-asset.service';

// --- Columnas de la hoja INVENTARIO.UNILABOR (1-based) ---
const COL = {
  unitCode: 1,
  areaCode: 3,
  categoryCode: 5,
  modality: 7,
  condition: 8,
  consecutive: 9,
  componentConsecutive: 10,
  assetCode: 11,
  description: 12,
  brand: 13,
  model: 14,
  complementaryInfo: 15,
  serial: 16,
  location: 17,
  observation: 18,
  responsible: 19,
} as const;

const DEFAULT_SHEET = 'INVENTARIO.UNILABOR';

// --- Mapas de normalizacion de datos sucios (clave normalizada -> valor canonico) ---
// Clasificacion: la plantilla resuelve por CLAVE; corregimos alias hacia las claves sembradas.
const CATEGORY_CODE_ALIASES: Record<string, string> = {
  MOB: 'MBL', // mobiliario escrito de dos formas
  EQA: 'EQL', // typo de equipo de laboratorio
  'N/A': 'EQL',
};
// Modalidad y condicion: la plantilla trae el NOMBRE; lo mapeamos al CODE del catalogo.
const MODALITY_NAME_TO_CODE: Record<string, string> = {
  'ACTIVO FIJO': 'ACTIVO_FIJO',
  'ACTIVO GIJO': 'ACTIVO_FIJO', // typo
  COMODATO: 'COMODATO',
};
const CONDITION_NAME_TO_CODE: Record<string, string> = {
  NUEVO: 'NEW',
  NUNEVO: 'NEW', // typo
  USADO: 'USED',
  DONADO: 'DONATED',
};
// Ubicacion: typos evidentes hacia un nombre canonico; el resto se auto-crea tal cual.
const LOCATION_NAME_ALIASES: Record<string, string> = {
  'PLANT BAJA': 'PLANTA BAJA',
};
// Valores que significan "sin dato" en cualquier columna de texto.
const NULL_TOKENS = new Set(['', 'N/E', 'N/A', 'N\\A', 'NE', 'NA', 'NINGUNO', '∅', '-', '.']);
// Prefijos de titulo en la columna RESPONSABLE (se retiran antes de matchear).
const RESPONSIBLE_TITLE = /^(Q|ING|LIC|IMG|MTRO|MTRA|DR|DRA|C|TEC|TECO)\s*[.,]\s*/i;

interface ParsedArgs {
  file: string;
  commit: boolean;
  sheet: string;
  reportPath: string | null;
  limit: number | null;
}

interface RowReport {
  excelRow: number;
  assetCode: string;
  name: string;
  warnings: string[];
}

interface ImportReport {
  totalRows: number;
  skippedNoCode: number;
  processed: number;
  created: number;
  failed: number;
  rowsWithWarnings: RowReport[];
  unresolvedResponsibles: Map<string, number>;
  createdLocations: Set<string>;
  unmatchedCatalog: Map<string, Set<string>>; // catalogo -> valores sin resolver
}

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

/** Texto plano de una celda de ExcelJS (maneja richText, formula, fecha, numero). */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('').trim();
    }
    if (typeof v.text === 'string') return v.text.trim();
    if (v.result != null) return String(v.result).trim();
  }
  return String(value).trim();
}

/** Mayusculas + sin acentos + espacios colapsados, para comparar/normalizar. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devuelve null si el texto es vacio o un token de "sin dato". */
function orNull(value: string): string | null {
  const folded = fold(value);
  if (NULL_TOKENS.has(folded)) return null;
  return value.trim().length > 0 ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Resolucion de catalogos (cargados una vez en memoria)
// ---------------------------------------------------------------------------

interface CatalogIndex {
  byCode: Map<string, number>; // fold(code) -> id
}

interface EmployeeRow {
  id: number;
  tokens: Set<string>; // fold de cada token del nombre completo
}

async function loadCatalogByCode(table: string): Promise<CatalogIndex> {
  const { rows } = await pool.query(`SELECT id, code FROM public.${table} WHERE is_active = TRUE;`);
  const byCode = new Map<string, number>();
  for (const row of rows) {
    if (row.code != null) byCode.set(fold(String(row.code)), Number(row.id));
  }
  return { byCode };
}

async function loadLocationsByName(): Promise<Map<string, number>> {
  const { rows } = await pool.query(`SELECT id, name FROM public.helpdesk_locations WHERE is_active = TRUE;`);
  const byName = new Map<string, number>();
  for (const row of rows) byName.set(fold(String(row.name)), Number(row.id));
  return byName;
}

async function loadEmployees(): Promise<EmployeeRow[]> {
  const { rows } = await pool.query(`SELECT id, full_name FROM public.employees WHERE is_active = TRUE;`);
  return rows.map((row) => ({
    id: Number(row.id),
    tokens: new Set(fold(String(row.full_name)).split(' ').filter(Boolean)),
  }));
}

/**
 * Empareja el texto libre de RESPONSABLE contra un empleado. Estrategia estricta:
 * tras quitar el titulo, TODOS los tokens del texto deben existir como token del
 * nombre del empleado. Solo se acepta si hay EXACTAMENTE un empleado candidato.
 * Devuelve el id, o null (sin match o ambiguo) con la razon.
 */
function matchEmployee(
  raw: string,
  employees: EmployeeRow[],
): { id: number | null; reason: 'matched' | 'no-match' | 'ambiguous' } {
  const cleaned = fold(raw.replace(RESPONSIBLE_TITLE, ''));
  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens.length === 0) return { id: null, reason: 'no-match' };

  const candidates = employees.filter((emp) => tokens.every((tok) => emp.tokens.has(tok)));
  if (candidates.length === 1) return { id: candidates[0]!.id, reason: 'matched' };
  if (candidates.length === 0) return { id: null, reason: 'no-match' };
  return { id: null, reason: 'ambiguous' };
}

/** Get-or-create de ubicacion por nombre. En dry-run solo registra que se crearia. */
async function resolveLocation(
  rawName: string,
  cache: Map<string, number>,
  report: ImportReport,
  commit: boolean,
): Promise<number | null> {
  const aliased = LOCATION_NAME_ALIASES[fold(rawName)] ?? rawName.trim();
  const key = fold(aliased);
  const existing = cache.get(key);
  if (existing) return existing;

  report.createdLocations.add(aliased);
  if (!commit) return null; // dry-run: no insertamos

  // Codigo derivado del nombre (slug corto, unico por sufijo si colisiona).
  const baseCode = fold(aliased).replace(/[^A-Z0-9]+/g, '_').slice(0, 24) || 'LOC';
  const inserted = await pool.query(
    `INSERT INTO public.helpdesk_locations (code, name)
     VALUES ($1, $2)
     ON CONFLICT (code) DO UPDATE SET is_active = TRUE
     RETURNING id;`,
    [baseCode, aliased],
  );
  const id = Number(inserted.rows[0].id);
  cache.set(key, id);
  return id;
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { file: '', commit: false, sheet: DEFAULT_SHEET, reportPath: null, limit: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--commit') args.commit = true;
    else if (arg === '--file' || arg === '-f') args.file = argv[(i += 1)] ?? '';
    else if (arg === '--sheet') args.sheet = argv[(i += 1)] ?? DEFAULT_SHEET;
    else if (arg === '--report') args.reportPath = argv[(i += 1)] ?? null;
    else if (arg === '--limit') args.limit = Number(argv[(i += 1)]);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Falta --file <ruta.xlsx>. Ej: npm run import:inventory -- --file ./Inventario-UNILABOR.xlsx');
    process.exitCode = 1;
    return;
  }

  readFileSync(args.file); // falla temprano si la ruta no existe
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(args.file);
  const sheet = workbook.getWorksheet(args.sheet);
  if (!sheet) {
    console.error(`No existe la hoja "${args.sheet}" en el archivo.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${args.commit ? '>>> MODO COMMIT (escribe en BD)' : '--- MODO DRY-RUN (no escribe) ---'}`);
  console.log(`Archivo: ${args.file}  |  Hoja: ${args.sheet}\n`);

  // Carga de catalogos a memoria.
  const [units, areas, categories, modalities, conditions, locations, employees] = await Promise.all([
    loadCatalogByCode('helpdesk_asset_units'),
    loadCatalogByCode('helpdesk_asset_areas'),
    loadCatalogByCode('helpdesk_asset_categories'),
    loadCatalogByCode('helpdesk_purchase_modalities'),
    loadCatalogByCode('helpdesk_purchase_conditions'),
    loadLocationsByName(),
    loadEmployees(),
  ]);

  const report: ImportReport = {
    totalRows: 0,
    skippedNoCode: 0,
    processed: 0,
    created: 0,
    failed: 0,
    rowsWithWarnings: [],
    unresolvedResponsibles: new Map(),
    createdLocations: new Set(),
    unmatchedCatalog: new Map(),
  };

  const noteUnmatched = (catalog: string, value: string) => {
    if (!report.unmatchedCatalog.has(catalog)) report.unmatchedCatalog.set(catalog, new Set());
    report.unmatchedCatalog.get(catalog)!.add(value);
  };

  const lastRow = args.limit ? Math.min(sheet.rowCount, args.limit + 1) : sheet.rowCount;
  for (let r = 2; r <= lastRow; r += 1) {
    const row = sheet.getRow(r);
    report.totalRows += 1;

    const assetCode = cellText(row.getCell(COL.assetCode).value);
    if (!assetCode) {
      report.skippedNoCode += 1;
      continue;
    }
    const name = cellText(row.getCell(COL.description).value) || 'SIN DESCRIPCION';
    const warnings: string[] = [];

    // --- Resolucion de catalogos por clave ---
    const unitCode = fold(cellText(row.getCell(COL.unitCode).value));
    const unitId = units.byCode.get(unitCode) ?? null;
    if (unitCode && !unitId) {
      warnings.push(`unidad desconocida "${unitCode}"`);
      noteUnmatched('unidad', unitCode);
    }

    const areaCode = fold(cellText(row.getCell(COL.areaCode).value));
    const areaId = areas.byCode.get(areaCode) ?? null;
    if (areaCode && !areaId) {
      warnings.push(`area desconocida "${areaCode}"`);
      noteUnmatched('area', areaCode);
    }

    const rawCatCode = fold(cellText(row.getCell(COL.categoryCode).value));
    const catCode = CATEGORY_CODE_ALIASES[rawCatCode] ?? rawCatCode;
    const categoryId = catCode ? categories.byCode.get(catCode) ?? null : null;
    if (catCode && !categoryId) {
      warnings.push(`clasificacion desconocida "${rawCatCode}"`);
      noteUnmatched('clasificacion', rawCatCode);
    }

    const rawModality = fold(cellText(row.getCell(COL.modality).value));
    const modalityCode = MODALITY_NAME_TO_CODE[rawModality] ?? null;
    const modalityId = modalityCode ? modalities.byCode.get(fold(modalityCode)) ?? null : null;
    if (rawModality && !modalityId) {
      warnings.push(`modalidad desconocida "${rawModality}"`);
      noteUnmatched('modalidad', rawModality);
    }

    const rawCondition = fold(cellText(row.getCell(COL.condition).value));
    const conditionCode = CONDITION_NAME_TO_CODE[rawCondition] ?? null;
    const conditionId = conditionCode ? conditions.byCode.get(fold(conditionCode)) ?? null : null;
    if (rawCondition && !conditionId) {
      warnings.push(`condicion desconocida "${rawCondition}"`);
      noteUnmatched('condicion', rawCondition);
    }

    // --- Ubicacion (get-or-create) ---
    const rawLocation = orNull(cellText(row.getCell(COL.location).value));
    let locationId: number | null = null;
    if (rawLocation) {
      locationId = await resolveLocation(rawLocation, locations, report, args.commit);
    }

    // --- Responsable (match estricto) ---
    const rawResponsible = orNull(cellText(row.getCell(COL.responsible).value));
    let responsibleId: number | null = null;
    if (rawResponsible) {
      const match = matchEmployee(rawResponsible, employees);
      responsibleId = match.id;
      if (match.reason !== 'matched') {
        warnings.push(`responsable sin resolver (${match.reason}): "${rawResponsible}"`);
        report.unresolvedResponsibles.set(
          rawResponsible,
          (report.unresolvedResponsibles.get(rawResponsible) ?? 0) + 1,
        );
      }
    }

    const payload: HelpdeskAssetPayload = {
      asset_code: assetCode, // preservado => override (no autogenera)
      name,
      description: null,
      category_id: categoryId,
      unit_id: unitId,
      area_id: areaId,
      location_id: locationId,
      brand_name: orNull(cellText(row.getCell(COL.brand).value)),
      model: orNull(cellText(row.getCell(COL.model).value)),
      serial_number: orNull(cellText(row.getCell(COL.serial).value)),
      complementary_info: orNull(cellText(row.getCell(COL.complementaryInfo).value)),
      purchase_modality_id: modalityId,
      purchase_condition_id: conditionId,
      responsible_employee_id: responsibleId,
      inventory_legacy_code: assetCode,
      legacy_consecutive: orNull(cellText(row.getCell(COL.consecutive).value)),
      legacy_component_consecutive: orNull(cellText(row.getCell(COL.componentConsecutive).value)),
      notes: orNull(cellText(row.getCell(COL.observation).value)),
    };

    report.processed += 1;
    if (warnings.length > 0) {
      report.rowsWithWarnings.push({ excelRow: r, assetCode, name, warnings });
    }

    if (args.commit) {
      try {
        await createHelpdeskAsset(payload, null);
        report.created += 1;
      } catch (err) {
        report.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        report.rowsWithWarnings.push({
          excelRow: r,
          assetCode,
          name,
          warnings: [`ERROR AL INSERTAR: ${message}`],
        });
      }
    }
  }

  printAndWriteReport(report, args);
}

function printAndWriteReport(report: ImportReport, args: ParsedArgs): void {
  const lines: string[] = [];
  const out = (text: string) => {
    lines.push(text);
    console.log(text);
  };

  out('==================== REPORTE DE IMPORTACION ====================');
  out(`Modo:               ${args.commit ? 'COMMIT' : 'DRY-RUN'}`);
  out(`Filas totales:      ${report.totalRows}`);
  out(`Saltadas sin codigo:${report.skippedNoCode}`);
  out(`Procesadas:         ${report.processed}`);
  if (args.commit) {
    out(`Creadas en BD:      ${report.created}`);
    out(`Fallidas:           ${report.failed}`);
  } else {
    out(`(dry-run: no se escribio nada en la BD)`);
  }
  out(`Filas con avisos:   ${report.rowsWithWarnings.length}`);

  if (report.unmatchedCatalog.size > 0) {
    out('\n--- Valores de catalogo sin resolver (quedan NULL en el activo) ---');
    for (const [catalog, values] of report.unmatchedCatalog) {
      out(`  ${catalog}: ${[...values].sort().join(', ')}`);
    }
  }

  if (report.createdLocations.size > 0) {
    out(
      `\n--- Ubicaciones nuevas ${args.commit ? 'creadas' : 'que se crearian'} (${report.createdLocations.size}) ---`,
    );
    out('  ' + [...report.createdLocations].sort().join(', '));
  }

  if (report.unresolvedResponsibles.size > 0) {
    out(`\n--- Responsables sin resolver (quedan NULL, resolver a mano) (${report.unresolvedResponsibles.size}) ---`);
    for (const [name, count] of [...report.unresolvedResponsibles.entries()].sort((a, b) => b[1] - a[1])) {
      out(`  "${name}"  (${count} activo/s)`);
    }
  }

  if (report.rowsWithWarnings.length > 0) {
    lines.push('\n--- Detalle por fila con avisos ---');
    for (const row of report.rowsWithWarnings) {
      lines.push(`  Fila ${row.excelRow} [${row.assetCode}] ${row.name}: ${row.warnings.join('; ')}`);
    }
  }
  out('===============================================================');

  const reportPath =
    args.reportPath ?? join(process.cwd(), `import-report-${basename(args.file).replace(/\.[^.]+$/, '')}.txt`);
  writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(`\nReporte detallado escrito en: ${reportPath}`);
}

run()
  .catch((err) => {
    console.error('Error en el importador:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
