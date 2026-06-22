import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import pool from '../config/db';
import type { HelpdeskAssetRecord } from './helpdesk-asset.service';
import type { HelpdeskLifecycleEventRecord } from './helpdesk-lifecycle.service';
import { setLifecycleEventGeneratedDocument } from './helpdesk-lifecycle.service';
import {
  uploadAssetDocument,
  type HelpdeskAssetDocumentRecord,
} from './helpdesk-asset-document.service';

const BRAND = '#00416a';
const INK = '#1f2933';

interface ActaInput {
  documentTitle: string;
  heading: string;
  asset: HelpdeskAssetRecord;
  event: HelpdeskLifecycleEventRecord;
  extraRows: Array<[string, string]>;
}

const line = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return 'N/E';
  }
  return String(value);
};

const renderActaPdf = (input: ActaInput): Promise<Buffer> => {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const { asset, event } = input;

  // Encabezado
  doc.fillColor(BRAND).fontSize(20).font('Helvetica-Bold').text('UNILABOR', { align: 'left' });
  doc.fillColor(INK).fontSize(10).font('Helvetica').text('Sistema de Gestion de Calidad - ISO 15189:2022', { align: 'left' });
  doc.moveDown(0.5);
  doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor(BRAND).lineWidth(2).stroke();
  doc.moveDown(1);

  doc.fillColor(BRAND).fontSize(16).font('Helvetica-Bold').text(input.heading, { align: 'center' });
  doc.moveDown(0.3);
  doc.fillColor(INK).fontSize(10).font('Helvetica').text(`Folio del evento: ${line(event.event_code)}`, { align: 'center' });
  doc.moveDown(1.2);

  // Tabla de datos
  const rows: Array<[string, string]> = [
    ['Codigo de inventario (ISO 19186)', line(asset.asset_code)],
    ['Equipo / Descripcion', line(asset.name)],
    ['Marca', line(asset.brand?.name)],
    ['Modelo', line(asset.model)],
    ['No. de serie', line(asset.serial_number)],
    ['Unidad', line(asset.unit?.name)],
    ['Area', line(asset.area?.name)],
    ['Fecha del evento', line(event.event_date)],
    ...input.extraRows,
  ];

  doc.fontSize(11);
  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fillColor(INK).text(`${label}:`, 56, y, { width: 200 });
    doc.font('Helvetica').fillColor(INK).text(value, 260, y, { width: 279 });
    doc.moveDown(0.6);
  });

  if (event.notes) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Observaciones:', 56, doc.y);
    doc.font('Helvetica').text(line(event.notes), 56, doc.y, { width: 483 });
  }

  // Firmas
  doc.moveDown(4);
  const signY = doc.y;
  doc.moveTo(80, signY).lineTo(250, signY).strokeColor(INK).lineWidth(1).stroke();
  doc.moveTo(330, signY).lineTo(500, signY).stroke();
  doc.fontSize(9).fillColor(INK);
  doc.text('Responsable del equipo', 80, signY + 6, { width: 170, align: 'center' });
  doc.text('Coordinacion de Calidad', 330, signY + 6, { width: 170, align: 'center' });

  doc.end();
  return done;
};

// Genera el PDF, lo archiva como evidencia ligada al evento y enlaza el documento al evento.
export const generateLifecycleActa = async (
  asset: HelpdeskAssetRecord,
  event: HelpdeskLifecycleEventRecord,
  userId?: string | null,
): Promise<HelpdeskAssetDocumentRecord | null> => {
  const isDecommission = event.event_type?.code === 'DECOMMISSION';
  const isMaintenance = event.event_type?.code === 'MAINTENANCE';
  if (!isDecommission && !isMaintenance) {
    return null;
  }

  const heading = isDecommission ? 'ACTA DE BAJA DE EQUIPO' : 'REPORTE DE MANTENIMIENTO';
  const documentKindCode = isDecommission ? 'DECOMMISSION_ACT' : 'MAINTENANCE_REPORT';
  const extraRows: Array<[string, string]> = isDecommission
    ? [['Motivo de baja', line(event.disposal_reason?.name)]]
    : [
        ['Proveedor', line(event.supplier?.name ?? event.performed_by_provider)],
        ['Costo', event.cost !== null ? `${event.cost} ${event.currency ?? 'MXN'}` : 'N/E'],
      ];

  const buffer = await renderActaPdf({
    documentTitle: heading,
    heading,
    asset,
    event,
    extraRows,
  });

  const uploadDir = process.env.DIRECTORY_UPLOAD || 'uploads/documents';
  fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `SAFEDOC-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, buffer);

  const kindResult = await pool.query(
    `SELECT id FROM public.helpdesk_document_kinds WHERE UPPER(code) = $1 LIMIT 1;`,
    [documentKindCode],
  );
  const documentKindId = kindResult.rows[0]?.id ? Number(kindResult.rows[0].id) : null;

  const document = await uploadAssetDocument(
    asset.id,
    { path: filePath, size: buffer.length, mimetype: 'application/pdf' },
    {
      title: `${heading} - ${event.event_code}`,
      document_kind_id: documentKindId,
      lifecycle_event_id: event.id,
      issued_on: event.event_date,
    },
    userId,
  );

  await setLifecycleEventGeneratedDocument(pool, event.id, document.id);
  return document;
};
