/**
 * Reporte de auditoria (Excel) de TODOS los activos del inventario ISO 15189.
 *
 * NO es una ruta HTTP: corre por linea de comandos contra la BD configurada
 * en `.env` (las mismas variables DB_* que el migrate runner / import-inventory).
 * Es de SOLO LECTURA (un SELECT), no modifica datos.
 *
 * Uso:
 *   npm run export:assets-report -- [--out <ruta.xlsx>] [--only-active]
 *
 *   --out <ruta.xlsx>   ruta de salida (por defecto reports/reporte-auditoria-activos-<fecha>.xlsx)
 *   --only-active       excluye activos eliminados (is_active = FALSE); por defecto incluye TODOS
 *                        para trazabilidad completa de auditoria.
 */
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import ExcelJS from 'exceljs';
import pool from '../config/db';
import { buildAssetQuery } from '../services/helpdesk-asset.service';

interface CliArgs {
  out: string;
  onlyActive: boolean;
}

const parseArgs = (): CliArgs => {
  const args = process.argv.slice(2);
  const today = new Date().toISOString().slice(0, 10);
  const defaultOut = resolve(process.cwd(), 'reports', `reporte-auditoria-activos-${today}.xlsx`);

  let out = defaultOut;
  let onlyActive = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out' && args[i + 1]) {
      out = resolve(args[i + 1] as string);
      i += 1;
    } else if (args[i] === '--only-active') {
      onlyActive = true;
    }
  }

  return { out, onlyActive };
};

const formatDate = (value: string | null) => (value ? value : '');
const formatDateTime = (value: string | null | undefined) => (value ? new Date(value) : null);
const yesNo = (value: boolean) => (value ? 'Sí' : 'No');

const COLUMNS: { header: string; key: string; width: number }[] = [
  { header: 'Código', key: 'asset_code', width: 16 },
  { header: 'Nombre', key: 'name', width: 30 },
  { header: 'Unidad', key: 'unit_name', width: 16 },
  { header: 'Área', key: 'area_name', width: 16 },
  { header: 'Responsable técnico', key: 'responsible_employee_name', width: 26 },
  { header: 'Código empleado (responsable)', key: 'responsible_employee_code', width: 16 },
  { header: 'Descripción', key: 'description', width: 30 },
  { header: 'Categoría', key: 'category_name', width: 18 },
  { header: 'Marca', key: 'brand_name', width: 16 },
  { header: 'Modelo', key: 'model', width: 16 },
  { header: 'Número de serie', key: 'serial_number', width: 18 },
  { header: 'Información complementaria', key: 'complementary_info', width: 24 },
  { header: 'Ubicación física', key: 'location_name', width: 18 },
  { header: 'Asignado a', key: 'assigned_employee_name', width: 26 },
  { header: 'Modalidad de compra', key: 'purchase_modality_name', width: 18 },
  { header: 'Condición de compra', key: 'purchase_condition_name', width: 18 },
  { header: 'Criticidad', key: 'criticality_name', width: 14 },
  { header: 'Estado operativo', key: 'operational_status_name', width: 18 },
  { header: 'Proveedor', key: 'supplier_name', width: 20 },
  { header: 'Fecha de adquisición', key: 'acquired_on', width: 16 },
  { header: 'Vigencia de garantía', key: 'warranty_expires_on', width: 16 },
  { header: 'Fecha de recepción', key: 'received_on', width: 16 },
  { header: 'Fecha de puesta en servicio', key: 'placed_in_service_on', width: 18 },
  { header: 'Condición de recepción', key: 'receipt_condition_name', width: 18 },
  { header: 'Fecha de baja', key: 'decommissioned_on', width: 14 },
  { header: 'Motivo de baja', key: 'disposal_reason_name', width: 18 },
  { header: 'Código de inventario legado', key: 'inventory_legacy_code', width: 18 },
  { header: 'Activo padre (código)', key: 'parent_asset_code', width: 16 },
  { header: 'Es componente', key: 'is_component', width: 12 },
  { header: 'Cantidad de componentes', key: 'component_count', width: 14 },
  { header: 'Estado de revisión', key: 'review_status', width: 14 },
  { header: 'Revisado por', key: 'reviewed_by_name', width: 22 },
  { header: 'Revisado el', key: 'reviewed_at', width: 18 },
  { header: 'Activo (no eliminado)', key: 'is_active', width: 12 },
  { header: 'Notas', key: 'notes', width: 26 },
  { header: 'Creado el', key: 'created_at', width: 18 },
  { header: 'Actualizado el', key: 'updated_at', width: 18 },
];

const run = async () => {
  const { out, onlyActive } = parseArgs();

  console.log(`Consultando activos (${onlyActive ? 'solo activos vigentes' : 'todos, incluye eliminados'})...`);
  const whereClause = onlyActive ? 'WHERE a.is_active = TRUE' : '';
  const result = await pool.query(`${buildAssetQuery()} ${whereClause} ORDER BY a.asset_code ASC;`);
  console.log(`Se encontraron ${result.rowCount} activos.`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SafeDoc';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Activos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((col) => ({ header: col.header, key: col.key, width: col.width }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 28;

  for (const row of result.rows) {
    sheet.addRow({
      asset_code: row.asset_code,
      name: row.name,
      description: row.description ?? '',
      category_name: row.category_name ?? '',
      brand_name: row.brand_name ?? '',
      model: row.model ?? '',
      serial_number: row.serial_number ?? '',
      complementary_info: row.complementary_info ?? '',
      unit_name: row.unit_name ?? '',
      area_name: row.area_name ?? '',
      location_name: row.location_name ?? '',
      responsible_employee_name: row.responsible_employee_name ?? '',
      responsible_employee_code: row.responsible_employee_code ?? '',
      assigned_employee_name: row.assigned_employee_name ?? '',
      purchase_modality_name: row.purchase_modality_name ?? '',
      purchase_condition_name: row.purchase_condition_name ?? '',
      criticality_name: row.criticality_name ?? '',
      operational_status_name: row.operational_status_name ?? '',
      supplier_name: row.supplier_name ?? '',
      acquired_on: formatDate(row.acquired_on),
      warranty_expires_on: formatDate(row.warranty_expires_on),
      received_on: formatDate(row.received_on),
      placed_in_service_on: formatDate(row.placed_in_service_on),
      receipt_condition_name: row.receipt_condition_name ?? '',
      decommissioned_on: formatDate(row.decommissioned_on),
      disposal_reason_name: row.disposal_reason_name ?? '',
      inventory_legacy_code: row.inventory_legacy_code ?? '',
      parent_asset_code: row.parent_asset_code ?? '',
      is_component: yesNo(Boolean(row.parent_asset_id)),
      component_count: row.component_count ?? '',
      review_status: row.review_status === 'REVIEWED' ? 'Revisado' : 'Pendiente',
      reviewed_by_name: row.reviewed_by_name ?? '',
      reviewed_at: formatDateTime(row.reviewed_at),
      is_active: yesNo(Boolean(row.is_active)),
      notes: row.notes ?? '',
      created_at: formatDateTime(row.created_at),
      updated_at: formatDateTime(row.updated_at),
    });
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  for (const col of ['reviewed_at', 'created_at', 'updated_at']) {
    const excelCol = sheet.getColumn(col);
    excelCol.numFmt = 'dd/mm/yyyy hh:mm';
  }

  const outDir = dirname(out);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  await workbook.xlsx.writeFile(out);
  console.log(`Reporte generado: ${out}`);
};

run()
  .catch((error) => {
    console.error('Error generando el reporte:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end();
  });
