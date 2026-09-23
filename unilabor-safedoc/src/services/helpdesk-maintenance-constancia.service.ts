import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import pool from '../config/db';
import { SERVICE_KIND_LABELS } from './helpdesk-maintenance-recurrence';
import { createLifecycleEvent, setLifecycleEventGeneratedDocument } from './helpdesk-lifecycle.service';
import { listAssetDocuments, uploadAssetDocument } from './helpdesk-asset-document.service';
import type { HelpdeskMaintenanceOrderRecord } from './helpdesk-maintenance.service';

/**
 * Constancia PDF de ejecucion de una orden de mantenimiento (ISO 15189:2022
 * 6.4.7: registro de mantenimiento con actividades, resultado, ejecutor y
 * firmas) y su archivo en el expediente del activo como evento MAINTENANCE.
 * Best-effort: un fallo aqui no revierte el cierre ya confirmado.
 */

const BRAND = '#00416a';
const INK = '#1f2933';
const MUTED = '#52606d';
const PAGE_RIGHT = 539;

const CHECK_LABELS: Record<string, string> = {
  OK: 'Conforme',
  NOT_OK: 'No conforme',
  NA: 'No aplica',
  PENDING: 'Sin registrar',
};

const EXECUTOR_LABELS: Record<string, string> = {
  INTERNAL_OPERATOR: 'Operador del equipo',
  INTERNAL_TECH: 'Tecnico de Help Desk',
  EXTERNAL_PROVIDER: 'Proveedor externo',
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return 'N/E';
  }
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return 'N/E';
  }
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const field = (doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string) => {
  doc.font('Helvetica-Bold').fillColor(MUTED).fontSize(8).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica').fillColor(INK).fontSize(10).text(value || 'N/E', x, y + 10, { width });
};

const ensureSpace = (doc: PDFKit.PDFDocument, needed: number) => {
  if (doc.y + needed > 760) {
    doc.addPage();
  }
};

export interface MaintenanceConstanciaInput {
  order: HelpdeskMaintenanceOrderRecord;
  closerName: string | null;
  validatorName: string | null;
  evidenceTitles: string[];
  technicianSignaturePath: string | null;
  responsibleSignaturePath: string | null;
}

export const renderMaintenanceConstanciaPdf = (input: MaintenanceConstanciaInput): Promise<Buffer> => {
  const { order } = input;
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fillColor(BRAND).fontSize(20).font('Helvetica-Bold').text('UNILABOR', 56, 56);
  doc.fillColor(INK).fontSize(10).font('Helvetica').text('Programa de Mantenimiento de Activos - ISO 15189:2022 (6.4.5, 6.4.7)');
  doc.moveDown(0.4);
  doc.moveTo(56, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor(BRAND).lineWidth(2).stroke();
  doc.moveDown(0.8);
  doc.fillColor(BRAND).fontSize(15).font('Helvetica-Bold').text('CONSTANCIA DE EJECUCION DE MANTENIMIENTO', { align: 'left' });
  doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(`Orden ${order.order_code} · ${SERVICE_KIND_LABELS[order.service_kind] ?? order.service_kind}`);
  doc.moveDown(1);

  let y = doc.y;
  field(doc, 56, y, 240, 'Activo', `${order.asset?.asset_code ?? ''} - ${order.asset?.name ?? ''}`);
  field(doc, 310, y, 230, 'Criticidad', order.asset?.criticality_name ?? 'Sin definir');
  y += 34;
  field(doc, 56, y, 240, 'Unidad / Area', `${order.asset?.unit_name ?? 'N/E'} / ${order.asset?.area_name ?? 'N/E'}`);
  field(doc, 310, y, 230, 'Responsable del activo', order.asset?.responsible_employee_name ?? 'N/E');
  y += 34;
  field(doc, 56, y, 240, 'Rutina', order.plan ? `${order.plan.plan_code} - ${order.plan.title}` : order.ticket_code ? `Verificacion post-reparacion (ticket ${order.ticket_code})` : 'N/E');
  field(doc, 310, y, 230, 'Version del programa', order.program_version ? `v${order.program_version}` : 'N/E');
  y += 34;
  field(doc, 56, y, 160, 'Fecha programada', formatDate(order.scheduled_for));
  field(doc, 226, y, 160, 'Ventana', `${formatDate(order.window_starts_on)} a ${formatDate(order.window_ends_on)}`);
  field(doc, 396, y, 144, 'Ejecutada el', formatDateTime(order.completed_at));
  y += 34;
  field(doc, 56, y, 160, 'Ejecutor', EXECUTOR_LABELS[order.executor_kind] ?? order.executor_kind);
  field(doc, 226, y, 160, 'Realizado por', order.executed_by_employee_name ?? order.supplier_name ?? order.provider_name ?? input.closerName ?? 'N/E');
  field(doc, 396, y, 144, 'Tiempo fuera de servicio', order.downtime_minutes !== null ? `${order.downtime_minutes} min` : 'N/E');
  y += 34;
  field(doc, 56, y, 240, 'Resultado', order.result ?? 'N/E');
  field(doc, 310, y, 230, 'Estado', order.status === 'CLOSED' ? 'Cerrada y validada' : order.status);
  doc.y = y + 40;

  doc.fillColor(BRAND).fontSize(11).font('Helvetica-Bold').text('Actividades realizadas');
  doc.fillColor(INK).fontSize(10).font('Helvetica').text(order.performed_activities ?? 'N/E', { width: PAGE_RIGHT - 56 });
  doc.moveDown(0.6);

  if (order.checklist.length > 0) {
    ensureSpace(doc, 40);
    doc.fillColor(BRAND).fontSize(11).font('Helvetica-Bold').text('Checklist');
    doc.moveDown(0.2);
    for (const item of order.checklist) {
      ensureSpace(doc, 16);
      const label = CHECK_LABELS[item.result] ?? item.result;
      doc.fillColor(INK).fontSize(9.5).font('Helvetica').text(`[${label}] ${item.task_text}${item.notes ? ` — ${item.notes}` : ''}`, { width: PAGE_RIGHT - 56 });
    }
    doc.moveDown(0.6);
  }

  ensureSpace(doc, 50);
  doc.fillColor(BRAND).fontSize(11).font('Helvetica-Bold').text('Hallazgos');
  doc.fillColor(INK).fontSize(10).font('Helvetica').text(order.findings ?? 'Sin hallazgos.', { width: PAGE_RIGHT - 56 });
  if (order.derived_ticket_code) {
    doc.fillColor(MUTED).fontSize(9).text(`Se abrio la solicitud correctiva ${order.derived_ticket_code} a partir de estos hallazgos.`);
  }
  doc.moveDown(0.6);

  ensureSpace(doc, 40);
  doc.fillColor(BRAND).fontSize(11).font('Helvetica-Bold').text('Evidencia');
  if (input.evidenceTitles.length === 0) {
    doc.fillColor(INK).fontSize(10).font('Helvetica').text(order.evidence_notes ?? 'Sin documentos adjuntos.');
  } else {
    input.evidenceTitles.forEach((title) => doc.fillColor(INK).fontSize(10).font('Helvetica').text(`• ${title}`));
    if (order.evidence_notes) {
      doc.fillColor(MUTED).fontSize(9).text(order.evidence_notes);
    }
  }
  doc.moveDown(1.2);

  ensureSpace(doc, 120);
  const sigY = doc.y;
  const drawSignature = (x: number, label: string, name: string | null, signaturePath: string | null) => {
    if (signaturePath && fs.existsSync(signaturePath)) {
      try {
        doc.image(signaturePath, x + 20, sigY, { fit: [160, 60] });
      } catch {
        // firma ilegible: se deja la linea
      }
    }
    doc.moveTo(x, sigY + 66).lineTo(x + 200, sigY + 66).strokeColor(INK).lineWidth(0.8).stroke();
    doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(name ?? 'N/E', x, sigY + 70, { width: 200, align: 'center' });
    doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(label, x, sigY + 82, { width: 200, align: 'center' });
  };
  drawSignature(70, 'Ejecuto el servicio', order.executed_by_employee_name ?? input.closerName, input.technicianSignaturePath);
  drawSignature(320, 'Responsable del activo (valida)', input.validatorName ?? order.asset?.responsible_employee_name ?? null, input.responsibleSignaturePath);
  doc.y = sigY + 100;

  doc.moveDown(1);
  doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(
    `Documento generado por SafeDoc el ${formatDateTime(new Date().toISOString())}. Registro de mantenimiento conforme a ISO 15189:2022 6.4.7.`,
    56,
    doc.y,
    { width: PAGE_RIGHT - 56 },
  );

  doc.end();
  return done;
};

const getCodeId = async (table: string, code: string): Promise<number | null> => {
  const result = await pool.query(`SELECT id FROM public.${table} WHERE UPPER(code) = UPPER($1) LIMIT 1;`, [code]);
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

const getUserFullName = async (userId: string | null | undefined): Promise<string | null> => {
  if (!userId) {
    return null;
  }
  const result = await pool.query(`SELECT full_name FROM public.users WHERE id = $1 LIMIT 1;`, [userId]);
  return result.rows[0]?.full_name ? String(result.rows[0].full_name) : null;
};

/** Genera la constancia, la archiva en el expediente y crea el evento MAINTENANCE. Devuelve el id del documento. */
export const archiveMaintenanceConstancia = async (
  order: HelpdeskMaintenanceOrderRecord,
  userId?: string | null,
): Promise<number | null> => {
  try {
    if (order.status !== 'CLOSED' || !order.asset) {
      return null;
    }
    const signatures = await pool.query(
      `SELECT technician_signature_path, responsible_signature_path FROM public.helpdesk_maintenance_orders WHERE id = $1;`,
      [order.id],
    );
    const evidence = await listAssetDocuments(order.asset_id, { maintenanceOrderId: order.id });
    const [closerName, validatorName] = await Promise.all([
      getUserFullName(order.completed_by_user_id),
      getUserFullName(order.validated_by_user_id),
    ]);

    const pdfBuffer = await renderMaintenanceConstanciaPdf({
      order,
      closerName,
      validatorName,
      evidenceTitles: evidence.filter((d) => d.document_kind_code !== 'MAINTENANCE_CONSTANCIA').map((d) => d.title),
      technicianSignaturePath: signatures.rows[0]?.technician_signature_path ? String(signatures.rows[0].technician_signature_path) : null,
      responsibleSignaturePath: signatures.rows[0]?.responsible_signature_path ? String(signatures.rows[0].responsible_signature_path) : null,
    });

    const uploadDir = process.env.DIRECTORY_UPLOAD_MAINTENANCE_DOCUMENTS || 'uploads/maintenance-documents';
    fs.mkdirSync(uploadDir, { recursive: true });
    const pdfPath = path.join(uploadDir, `CONSTANCIA-${order.order_code}-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    const documentKindId = await getCodeId('helpdesk_document_kinds', 'MAINTENANCE_CONSTANCIA');
    const eventTypeId = await getCodeId('helpdesk_lifecycle_event_types', 'MAINTENANCE');
    const eventDate = (order.completed_at ?? new Date().toISOString()).slice(0, 10);

    const event = eventTypeId
      ? await createLifecycleEvent(
          order.asset_id,
          {
            event_type_id: eventTypeId,
            event_date: eventDate,
            title: `${SERVICE_KIND_LABELS[order.service_kind] ?? 'Mantenimiento'} — ${order.order_code}`,
            description: order.plan ? `${order.plan.plan_code} · ${order.plan.title}` : order.performed_activities,
            maintenance_order_id: order.id,
            ticket_id: order.ticket_id,
            supplier_id: order.supplier_id,
            performed_by_employee_id: order.executed_by_employee_id,
            performed_by_provider: order.supplier_name ?? order.provider_name,
            notes: order.findings,
          },
          userId,
        )
      : null;

    const document = await uploadAssetDocument(
      order.asset_id,
      { path: pdfPath, size: pdfBuffer.length, mimetype: 'application/pdf' },
      {
        title: `Constancia de mantenimiento ${order.order_code}`,
        document_kind_id: documentKindId,
        lifecycle_event_id: event?.id ?? null,
        maintenance_order_id: order.id,
        reference_key: `MAINT:${order.order_code}`,
        issued_on: eventDate,
      },
      userId,
    );
    if (event) {
      await setLifecycleEventGeneratedDocument(pool, event.id, document.id);
    }
    await pool.query(
      `UPDATE public.helpdesk_maintenance_orders SET lifecycle_event_id = $2, constancia_document_id = $3, updated_at = NOW() WHERE id = $1;`,
      [order.id, event?.id ?? null, document.id],
    );
    return document.id;
  } catch (error) {
    console.error(`No se pudo generar/archivar la constancia de la orden ${order.order_code}:`, error);
    return null;
  }
};
