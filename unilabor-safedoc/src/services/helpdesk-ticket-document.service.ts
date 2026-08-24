import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { resolveStoredDocumentPath } from './document.service';
import { recordTicketHistory, resolveTicketSignaturePath, type HelpdeskTicketRecord } from './helpdesk-ticket.shared';
import { uploadAssetDocument } from './helpdesk-asset-document.service';
import { createLifecycleEvent, setLifecycleEventGeneratedDocument } from './helpdesk-lifecycle.service';
import { renderTicketConstanciaPdf } from './helpdesk-ticket-constancia.service';

export interface HelpdeskTicketDocumentPayload {
  title: string;
  document_kind?: string | null;
}

export interface HelpdeskTicketDocumentRecord {
  id: number;
  ticket_id: number;
  title: string;
  document_kind: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string | null;
  created_at?: string | undefined;
}

export interface UploadedTicketFile {
  path: string;
  size: number;
  mimetype: string;
}

const mapDocumentRow = (row: any): HelpdeskTicketDocumentRecord => ({
  id: Number(row.id),
  ticket_id: Number(row.ticket_id),
  title: String(row.title),
  document_kind: row.document_kind ? String(row.document_kind) : null,
  file_path: String(row.file_path),
  file_size: Number(row.file_size ?? 0),
  mime_type: String(row.mime_type ?? 'application/octet-stream'),
  uploaded_by_user_id: row.uploaded_by_user_id ? String(row.uploaded_by_user_id) : null,
  uploaded_by_name: row.uploaded_by_name ? String(row.uploaded_by_name) : null,
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
});

const buildDocumentQuery = () => `
  SELECT d.*, u.full_name AS uploaded_by_name
  FROM public.helpdesk_ticket_documents d
  LEFT JOIN public.users u ON u.id = d.uploaded_by_user_id
`;

export const getTicketDocumentById = async (documentId: number): Promise<HelpdeskTicketDocumentRecord | null> => {
  const result = await pool.query(`${buildDocumentQuery()} WHERE d.id = $1 LIMIT 1;`, [documentId]);
  return result.rows[0] ? mapDocumentRow(result.rows[0]) : null;
};

export const listTicketDocuments = async (ticketId: number): Promise<HelpdeskTicketDocumentRecord[]> => {
  const result = await pool.query(
    `${buildDocumentQuery()} WHERE d.ticket_id = $1 ORDER BY d.created_at DESC, d.id DESC;`,
    [ticketId],
  );
  return result.rows.map(mapDocumentRow);
};

// Evidencia de intervencion: append-only a proposito (sin endpoint de borrado),
// mismo criterio que helpdesk_ticket_history — es el registro probatorio que
// exige el cierre del ticket (ver TCK-01, ticketHasClosureEvidence).
export const uploadTicketDocument = async (
  ticketId: number,
  file: UploadedTicketFile,
  payload: HelpdeskTicketDocumentPayload,
  userId?: string | null,
): Promise<HelpdeskTicketDocumentRecord> => {
  const ticketResult = await pool.query(`SELECT id FROM public.helpdesk_tickets WHERE id = $1 LIMIT 1;`, [ticketId]);
  if (ticketResult.rows.length === 0) {
    const error = new Error('HELPDESK_TICKET_NOT_FOUND');
    (error as any).code = 'HELPDESK_TICKET_NOT_FOUND';
    throw error;
  }

  const result = await pool.query(
    `
      INSERT INTO public.helpdesk_ticket_documents (
        ticket_id, title, document_kind, file_path, file_size, mime_type, uploaded_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `,
    [
      ticketId,
      payload.title.trim(),
      payload.document_kind?.trim() || null,
      file.path,
      file.size ?? 0,
      file.mimetype ?? 'application/octet-stream',
      userId ?? null,
    ],
  );

  const documentId = Number(result.rows[0]?.id);
  await recordTicketHistory(
    ticketId,
    'EVIDENCE_UPLOAD',
    `Evidencia documental agregada: ${payload.title.trim()}.`,
    userId,
    null,
    { document_id: documentId, title: payload.title.trim(), mime_type: file.mimetype },
  );

  const created = await getTicketDocumentById(documentId);
  if (!created) {
    const error = new Error('HELPDESK_TICKET_DOCUMENT_CREATION_FAILED');
    (error as any).code = 'HELPDESK_TICKET_DOCUMENT_CREATION_FAILED';
    throw error;
  }
  return created;
};

const SUPPORT_CHANNEL_LABELS: Record<string, string> = {
  ON_SITE: 'Atención en sitio',
  REMOTE_PHONE: 'Asistencia telefónica del proveedor',
  REMOTE_OTHER: 'Remota (otro medio)',
};

const getDocumentKindIdByCode = async (code: string): Promise<number | null> => {
  const result = await pool.query(
    `SELECT id FROM public.helpdesk_document_kinds WHERE UPPER(code) = UPPER($1) LIMIT 1;`,
    [code],
  );
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

const getLifecycleEventTypeIdByCode = async (code: string): Promise<number | null> => {
  const result = await pool.query(
    `SELECT id FROM public.helpdesk_lifecycle_event_types WHERE UPPER(code) = UPPER($1) LIMIT 1;`,
    [code],
  );
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

const getUserFullName = async (userId: string | null | undefined): Promise<string | null> => {
  if (!userId) {
    return null;
  }
  const result = await pool.query(`SELECT full_name FROM public.users WHERE id = $1 LIMIT 1;`, [userId]);
  return result.rows[0]?.full_name ? String(result.rows[0].full_name) : null;
};

// Genera la constancia PDF de atencion y la archiva: siempre como
// helpdesk_ticket_document (para que el ticket tenga su propio historial
// descargable), y ademas en el expediente del activo si el ticket tiene
// asset_id. Best-effort: un fallo aqui NO invalida el cierre ya confirmado
// (mismo criterio que archiveHandoverPerAsset en Entrega-Recepcion).
export const archiveTicketConstancia = async (
  ticket: HelpdeskTicketRecord,
  userId?: string | null,
): Promise<void> => {
  try {
    if (!ticket.closed_at) {
      return;
    }

    const [requesterSignature, closerSignature, evidence, closerName] = await Promise.all([
      resolveTicketSignaturePath(ticket.id, 'requester'),
      resolveTicketSignaturePath(ticket.id, 'closer'),
      listTicketDocuments(ticket.id),
      getUserFullName(ticket.closed_by_user_id),
    ]);

    const pdfBuffer = await renderTicketConstanciaPdf({
      ticket_code: ticket.ticket_code,
      title: ticket.title,
      status_name: ticket.status?.name ?? 'Cerrado',
      priority_name: ticket.priority?.name ?? 'N/E',
      request_type_name: ticket.request_type?.name ?? 'N/E',
      asset_label: ticket.asset ? `${ticket.asset.asset_code} - ${ticket.asset.name}` : null,
      requester_name: ticket.requester_employee?.full_name ?? 'N/E',
      assigned_name: ticket.assigned_employee?.full_name ?? 'N/E',
      closer_name: closerName ?? ticket.assigned_employee?.full_name ?? 'N/E',
      reported_at: new Date(ticket.reported_at),
      solved_at: ticket.solved_at ? new Date(ticket.solved_at) : null,
      validated_at: ticket.validated_at ? new Date(ticket.validated_at) : null,
      closed_at: new Date(ticket.closed_at),
      solution_summary: ticket.solution_summary ?? null,
      support_channel_label: ticket.support_channel ? SUPPORT_CHANNEL_LABELS[ticket.support_channel] ?? ticket.support_channel : null,
      provider_name: ticket.provider_name ?? null,
      provider_contact: ticket.provider_contact ?? null,
      onsite_responsible_name: ticket.onsite_responsible_employee?.full_name ?? null,
      call_at: ticket.call_at ? new Date(ticket.call_at) : null,
      closure_notes: ticket.closure_notes ?? '',
      evidence_titles: evidence.map((item) => item.title),
      requester_signature_path: requesterSignature,
      closer_signature_path: closerSignature,
    });

    const uploadDir = process.env.DIRECTORY_UPLOAD_TICKET_DOCUMENTS || 'uploads/ticket-documents';
    fs.mkdirSync(uploadDir, { recursive: true });
    const pdfPath = path.join(uploadDir, `CONSTANCIA-${ticket.ticket_code}-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    const title = `Constancia de atención ${ticket.ticket_code}`;
    await uploadTicketDocument(
      ticket.id,
      { path: pdfPath, size: pdfBuffer.length, mimetype: 'application/pdf' },
      { title, document_kind: 'CONSTANCIA' },
      userId,
    );

    if (ticket.asset_id) {
      const documentKindId = await getDocumentKindIdByCode('TICKET_CONSTANCIA');
      const incidentEventTypeId = await getLifecycleEventTypeIdByCode('INCIDENT');

      // Evento en la linea de tiempo del expediente del equipo (visible en
      // HelpdeskAssetExpedientPage), con enlace al ticket via ticket_id y a
      // la constancia via generated_act_document_id (mismo mecanismo que
      // archiveHandoverPerAsset en Entrega-Recepcion).
      const event = incidentEventTypeId
        ? await createLifecycleEvent(
            ticket.asset_id,
            {
              event_type_id: incidentEventTypeId,
              event_date: ticket.closed_at.slice(0, 10),
              title: `Solicitud de soporte atendida — ${ticket.ticket_code}`,
              description: ticket.title,
              ticket_id: ticket.id,
              notes: ticket.closure_notes ?? null,
            },
            userId,
          )
        : null;

      const document = await uploadAssetDocument(
        ticket.asset_id,
        { path: pdfPath, size: pdfBuffer.length, mimetype: 'application/pdf' },
        {
          title,
          document_kind_id: documentKindId,
          lifecycle_event_id: event?.id ?? null,
          reference_key: `TICKET:${ticket.ticket_code}`,
          issued_on: ticket.closed_at.slice(0, 10),
        },
        userId,
      );

      if (event) {
        await setLifecycleEventGeneratedDocument(pool, event.id, document.id);
      }
    }
  } catch (error) {
    console.error(`No se pudo generar/archivar la constancia del ticket ${ticket.ticket_code}:`, error);
  }
};

export const resolveTicketDocumentPath = async (
  documentId: number,
): Promise<{ document: HelpdeskTicketDocumentRecord; absolutePath: string }> => {
  const document = await getTicketDocumentById(documentId);
  if (!document) {
    const error = new Error('HELPDESK_TICKET_DOCUMENT_NOT_FOUND');
    (error as any).code = 'HELPDESK_TICKET_DOCUMENT_NOT_FOUND';
    throw error;
  }
  const absolutePath = resolveStoredDocumentPath(document.file_path);
  return { document, absolutePath };
};
