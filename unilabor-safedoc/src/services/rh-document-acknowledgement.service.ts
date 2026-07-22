import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { safeUnlink, sha256Buffer } from '../utils/file-storage';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { withTransaction, type Queryable } from '../utils/transaction';
import { creditReadingHeartbeat, isValidPage } from './reading/reading-progress.engine';
import { resolveInstitutionalDocumentPath } from './rh-institutional-document.service';
import { buildSignedAcknowledgementPdf } from './rh-acknowledgement-pdf.service';

// -----------------------------------------------------------------------------
// Acuse de lectura y firma autografa de documentos del expediente (RH-ACK).
//
// Un acuse asigna UN documento concreto a UN colaborador. No hay plantillas ni
// reglas por tipo de documento: RH decide, documento por documento, cual requiere acuse.
//
// Dos relojes independientes (ver migracion 20260721_01):
//   * deadline_at          -> plazo para cumplir (default 72h).
//   * min_seconds_per_page -> piso anti-atajo por pagina dentro del visor.
// -----------------------------------------------------------------------------

export const DEFAULT_DEADLINE_HOURS = 72;
export const DEFAULT_MIN_SECONDS_PER_PAGE = 7;

// Cadencia con la que el visor emite latidos. El cliente solo dice "sigo en la
// pagina N"; el servidor decide cuanto tiempo acreditar.
export const HEARTBEAT_INTERVAL_SECONDS = 4;

// Techo de credito por latido. Si entre dos latidos pasa mas que esto (pestania
// en segundo plano, equipo suspendido, red caida), se acredita solo este maximo:
// dejar el documento abierto toda la tarde no acumula tiempo de lectura.
const MAX_HEARTBEAT_CREDIT_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3;

export type AcknowledgementStatus =
  | 'pending'
  | 'in_progress'
  | 'read'
  | 'signed'
  | 'expired'
  | 'cancelled';

export interface AcknowledgementRecord {
  id: number;
  institutional_document_id: number;
  employee_id: number;
  status: AcknowledgementStatus;
  available_at: string | null;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  pages_seen: number[];
  pages_seen_count: number;
  active_seconds: number;
  min_seconds_per_page: number;
  current_page: number | null;
  current_page_seconds: number;
  signed_document_id: number | null;
  source_sha256: string | null;
  signed_sha256: string | null;
  created_at: string | null;
  // Enriquecido por join (listados)
  document_title?: string;
  employee_name?: string;
  employee_code?: string | null;
}

export interface AssignAcknowledgementPayload {
  employee_ids: number[];
  deadline_hours?: number;
  min_seconds_per_page?: number;
}

const fail = (code: string, message?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (message) {
    (error as any).publicMessage = message;
  }
  throw error;
};

const tableExists = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.rh_document_acknowledgements') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertTable = async (): Promise<void> => {
  if (!(await tableExists())) {
    fail('RH_ACK_TABLE_NOT_AVAILABLE', 'El modulo de acuses no esta disponible.');
  }
};

const mapRow = (row: any): AcknowledgementRecord => {
  const pagesSeen: number[] = Array.isArray(row.pages_seen) ? row.pages_seen.map(Number) : [];
  return {
    id: Number(row.id),
    institutional_document_id: Number(row.institutional_document_id),
    employee_id: Number(row.employee_id),
    status: String(row.status) as AcknowledgementStatus,
    available_at: row.available_at ? toIsoDateTime(row.available_at) : null,
    deadline_at: row.deadline_at ? toIsoDateTime(row.deadline_at) : null,
    started_at: row.started_at ? toIsoDateTime(row.started_at) : null,
    read_completed_at: row.read_completed_at ? toIsoDateTime(row.read_completed_at) : null,
    signed_at: row.signed_at ? toIsoDateTime(row.signed_at) : null,
    pages_total: Number(row.pages_total),
    pages_seen: pagesSeen,
    pages_seen_count: pagesSeen.length,
    active_seconds: Number(row.active_seconds),
    min_seconds_per_page: Number(row.min_seconds_per_page),
    current_page: row.current_page === null ? null : Number(row.current_page),
    current_page_seconds: Number(row.current_page_seconds),
    signed_document_id: row.signed_document_id === null ? null : Number(row.signed_document_id),
    source_sha256: row.source_sha256 ?? null,
    signed_sha256: row.signed_sha256 ?? null,
    created_at: row.created_at ? toIsoDateTime(row.created_at) : null,
    ...(row.document_title !== undefined ? { document_title: String(row.document_title) } : {}),
    ...(row.employee_name !== undefined ? { employee_name: String(row.employee_name) } : {}),
    ...(row.employee_code !== undefined ? { employee_code: row.employee_code ?? null } : {}),
  };
};

/**
 * El documento institucional ya trae huella y paginas selladas desde la carga:
 * aqui solo se valida que exista, este activo y su archivo siga en disco.
 */
const inspectSourceDocument = async (
  documentId: number,
): Promise<{ pagesTotal: number; sha256: string }> => {
  const { document } = await resolveInstitutionalDocumentPath(documentId);
  if (!document.is_active) {
    return fail(
      'RH_INSTITUTIONAL_INACTIVE',
      'El documento institucional esta inactivo y no admite nuevos acuses.',
    );
  }
  return { pagesTotal: document.pages_total, sha256: document.sha256 };
};

const hasActiveAcknowledgement = async (
  client: Queryable,
  documentId: number,
  employeeId: number,
): Promise<boolean> => {
  const result = await client.query(
    `SELECT 1
       FROM public.rh_document_acknowledgements
      WHERE institutional_document_id = $1
        AND employee_id = $2
        AND status IN ('pending', 'in_progress', 'read')
      LIMIT 1;`,
    [documentId, employeeId],
  );
  return result.rows.length > 0;
};

/**
 * Solicita el acuse de un documento a uno o varios colaboradores. Idempotente:
 * los colaboradores que ya tienen un acuse vigente del mismo documento se
 * omiten (se reportan en `skipped_employee_ids`) en lugar de fallar el lote.
 */
export const assignAcknowledgements = async (
  documentId: number,
  payload: AssignAcknowledgementPayload,
  createdByUserId: string,
): Promise<{ created: AcknowledgementRecord[]; skipped_employee_ids: number[] }> => {
  await assertTable();

  const employeeIds = [...new Set(payload.employee_ids)];
  if (employeeIds.length === 0) {
    return fail('RH_ACK_NO_EMPLOYEES', 'Debes seleccionar al menos un colaborador.');
  }

  const deadlineHours = payload.deadline_hours ?? DEFAULT_DEADLINE_HOURS;
  const minSecondsPerPage = payload.min_seconds_per_page ?? DEFAULT_MIN_SECONDS_PER_PAGE;
  const { pagesTotal, sha256 } = await inspectSourceDocument(documentId);

  return withTransaction(async (client) => {
    const created: AcknowledgementRecord[] = [];
    const skipped: number[] = [];

    for (const employeeId of employeeIds) {
      if (await hasActiveAcknowledgement(client, documentId, employeeId)) {
        skipped.push(employeeId);
        continue;
      }

      const inserted = await client.query(
        `INSERT INTO public.rh_document_acknowledgements
           (institutional_document_id, employee_id, deadline_at, pages_total,
            min_seconds_per_page, source_sha256, created_by_user_id)
         VALUES ($1, $2, NOW() + make_interval(hours => $3), $4, $5, $6, $7)
         RETURNING *;`,
        [documentId, employeeId, deadlineHours, pagesTotal, minSecondsPerPage, sha256, createdByUserId],
      );
      created.push(mapRow(inserted.rows[0]));
    }

    return { created, skipped_employee_ids: skipped };
  });
};

/**
 * Registra un latido del visor: "el colaborador sigue viendo la pagina N".
 *
 * Toda la contabilidad la hace el servidor con su propio reloj. El cliente NO
 * reporta segundos; si lo hiciera, bastaria un POST con un numero grande para
 * saltarse el gate. El credito de cada latido es la diferencia real contra
 * `last_progress_at`, acotada por MAX_HEARTBEAT_CREDIT_SECONDS.
 *
 * Una pagina entra en `pages_seen` solo cuando acumulo `min_seconds_per_page`.
 * Cuando `pages_seen` cubre las `pages_total`, el acuse pasa a 'read' y se
 * habilita la firma. El gate del frontend es UX; este es el control real.
 */
export const registerReadingProgress = async (
  acknowledgementId: number,
  employeeId: number,
  page: number,
): Promise<AcknowledgementRecord> => {
  await assertTable();

  return withTransaction(async (client) => {
    // FOR UPDATE: latidos concurrentes (dos pestanias) no se pisan al acumular.
    const current = await client.query(
      `SELECT * FROM public.rh_document_acknowledgements WHERE id = $1 FOR UPDATE;`,
      [acknowledgementId],
    );
    if (current.rows.length === 0) {
      return fail('RH_ACK_NOT_FOUND', 'El acuse no existe.');
    }

    const row = current.rows[0];
    if (Number(row.employee_id) !== employeeId) {
      return fail('RH_ACK_FORBIDDEN', 'No tienes acceso a este acuse.');
    }
    if (!['pending', 'in_progress'].includes(String(row.status))) {
      return fail(
        'RH_ACK_NOT_TRACKABLE',
        'Este acuse ya no admite avance de lectura.',
      );
    }
    if (new Date(row.deadline_at).getTime() < Date.now()) {
      return fail('RH_ACK_EXPIRED', 'El plazo para este acuse ya vencio.');
    }

    const pagesTotal = Number(row.pages_total);
    if (!isValidPage(page, pagesTotal)) {
      return fail('RH_ACK_INVALID_PAGE', 'La pagina reportada no existe en el documento.');
    }

    // La contabilidad vive en el motor compartido (reading-progress.engine),
    // que es puro y esta cubierto por pruebas propias.
    const progress = creditReadingHeartbeat(
      {
        pages_total: pagesTotal,
        min_seconds_per_page: Number(row.min_seconds_per_page),
        current_page: row.current_page === null ? null : Number(row.current_page),
        current_page_seconds: Number(row.current_page_seconds),
        active_seconds: Number(row.active_seconds),
        pages_seen: Array.isArray(row.pages_seen) ? row.pages_seen.map(Number) : [],
        last_progress_at: row.last_progress_at ?? null,
      },
      page,
      { maxCreditSeconds: MAX_HEARTBEAT_CREDIT_SECONDS },
    );

    const { current_page_seconds: currentPageSeconds, active_seconds: activeSeconds } = progress;
    const pagesSeen = progress.pages_seen;
    const completed = progress.completed;
    const nextStatus = progress.status;

    const updated = await client.query(
      `UPDATE public.rh_document_acknowledgements
          SET status = $2,
              started_at = COALESCE(started_at, NOW()),
              current_page = $3,
              current_page_seconds = $4,
              active_seconds = $5,
              pages_seen = $6::INTEGER[],
              last_progress_at = NOW(),
              read_completed_at = CASE
                WHEN $7::BOOLEAN AND read_completed_at IS NULL THEN NOW()
                ELSE read_completed_at
              END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *;`,
      [
        acknowledgementId,
        nextStatus,
        page,
        currentPageSeconds,
        activeSeconds,
        pagesSeen,
        completed,
      ],
    );

    return mapRow(updated.rows[0]);
  });
};

export interface SignAcknowledgementPayload {
  signature: string;
  /** Usuario autenticado que firma; queda como cargador de la copia generada. */
  user_id: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

/**
 * Firma el acuse: genera el PDF con la hoja anexa y lo deja como version vigente
 * del documento en el expediente (el original queda accesible en el historial).
 *
 * Exige `status = 'read'` en el SERVIDOR: el gate del visor es UX, este es el
 * control real. Todo ocurre en una transaccion y los archivos escritos se
 * limpian si algo falla, para no dejar huerfanos en disco.
 */
export const signAcknowledgement = async (
  acknowledgementId: number,
  employeeId: number,
  payload: SignAcknowledgementPayload,
): Promise<AcknowledgementRecord> => {
  await assertTable();

  const signatureBuffer = decodeSignaturePng(payload.signature);
  if (!signatureBuffer) {
    return fail('RH_ACK_INVALID_SIGNATURE', 'La firma autografa es invalida o esta vacia.');
  }

  let signaturePath: string | null = null;
  let signedPdfPath: string | null = null;

  try {
    return await withTransaction(async (client) => {
      const current = await client.query(
        `SELECT a.*, d.title, d.description, d.target_document_type_id, d.is_active AS doc_is_active,
                e.full_name AS employee_name, e.employee_code AS employee_code, e.user_id AS employee_user_id
           FROM public.rh_document_acknowledgements a
           INNER JOIN public.rh_institutional_documents d ON d.id = a.institutional_document_id
           INNER JOIN public.employees e ON e.id = a.employee_id
          WHERE a.id = $1
          FOR UPDATE OF a;`,
        [acknowledgementId],
      );
      if (current.rows.length === 0) {
        return fail('RH_ACK_NOT_FOUND', 'El acuse no existe.');
      }

      const row = current.rows[0];
      if (Number(row.employee_id) !== employeeId) {
        return fail('RH_ACK_FORBIDDEN', 'No tienes acceso a este acuse.');
      }
      if (String(row.status) === 'signed') {
        return fail('RH_ACK_ALREADY_SIGNED', 'Este acuse ya fue firmado.');
      }
      // El control real de la lectura completa: no basta con que el front lo crea.
      if (String(row.status) !== 'read') {
        return fail(
          'RH_ACK_NOT_READ',
          'Debes recorrer el documento completo antes de firmarlo.',
        );
      }
      if (new Date(row.deadline_at).getTime() < Date.now()) {
        return fail('RH_ACK_EXPIRED', 'El plazo para este acuse ya vencio.');
      }

      const sourceDocumentId = Number(row.institutional_document_id);
      const { absolutePath } = await resolveInstitutionalDocumentPath(sourceDocumentId);
      const sourcePdf = fs.readFileSync(absolutePath);

      // Si el archivo cambio desde que se solicito el acuse, la evidencia ya no
      // corresponde a lo que se leyo: mejor abortar que firmar algo distinto.
      if (row.source_sha256 && sha256Buffer(sourcePdf) !== String(row.source_sha256)) {
        return fail(
          'RH_ACK_SOURCE_CHANGED',
          'El documento cambio desde que se solicito el acuse. Solicita uno nuevo.',
        );
      }

      const signedAt = new Date();
      signaturePath = writeSignaturePng(signatureBuffer, 'SIGN-ACK');

      const signedPdf = await buildSignedAcknowledgementPdf({
        sourcePdf,
        signaturePng: signatureBuffer,
        documentTitle: String(row.title),
        documentId: sourceDocumentId,
        sourceSha256: String(row.source_sha256 ?? ''),
        employeeName: String(row.employee_name),
        employeeCode: row.employee_code ? String(row.employee_code) : null,
        pagesTotal: Number(row.pages_total),
        pagesSeenCount: Array.isArray(row.pages_seen) ? row.pages_seen.length : 0,
        activeSeconds: Number(row.active_seconds),
        minSecondsPerPage: Number(row.min_seconds_per_page),
        startedAt: row.started_at ? new Date(row.started_at) : null,
        readCompletedAt: row.read_completed_at ? new Date(row.read_completed_at) : null,
        signedAt,
        ipAddress: payload.ip_address ?? null,
        userAgent: payload.user_agent ?? null,
      });

      const uploadDir = process.env.DIRECTORY_UPLOAD || 'uploads/documents';
      fs.mkdirSync(uploadDir, { recursive: true });
      signedPdfPath = path.join(
        uploadDir,
        `ACUSE-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`,
      );
      fs.writeFileSync(signedPdfPath, signedPdf);

      // El documento institucional NO se toca: es la fuente compartida que leen
      // todos. La copia firmada nace en el expediente del propio firmante, con
      // reference_key propio para poder convivir con otros documentos vigentes
      // del mismo tipo (mismo mecanismo que las constancias por curso).
      const inserted = await client.query(
        `INSERT INTO public.employee_documents
           (employee_id, document_type_id, title, description, file_path, file_size,
            mime_type, uploaded_by_user_id, status, version, is_current, reference_key)
         VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', $7, 'active', 1, TRUE, $8)
         RETURNING id;`,
        [
          Number(row.employee_id),
          Number(row.target_document_type_id),
          `${String(row.title)} (firmado)`,
          row.description ?? null,
          signedPdfPath,
          signedPdf.length,
          row.employee_user_id ?? payload.user_id,
          `acknowledgement:${acknowledgementId}`,
        ],
      );
      const signedDocumentId = Number(inserted.rows[0].id);

      const updated = await client.query(
        `UPDATE public.rh_document_acknowledgements
            SET status = 'signed',
                signed_at = $2,
                signature_path = $3,
                signed_document_id = $4,
                signed_sha256 = $5,
                ip_address = $6,
                user_agent = $7,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *;`,
        [
          acknowledgementId,
          signedAt,
          signaturePath,
          signedDocumentId,
          sha256Buffer(signedPdf),
          payload.ip_address ?? null,
          payload.user_agent ?? null,
        ],
      );

      return mapRow(updated.rows[0]);
    });
  } catch (error) {
    // La transaccion ya revirtio; falta limpiar lo que se escribio en disco.
    safeUnlink(signaturePath);
    safeUnlink(signedPdfPath);
    throw error;
  }
};

const LIST_SELECT = `
  SELECT a.*,
         d.title AS document_title,
         e.full_name AS employee_name,
         e.employee_code AS employee_code
    FROM public.rh_document_acknowledgements a
    INNER JOIN public.rh_institutional_documents d ON d.id = a.institutional_document_id
    INNER JOIN public.employees e ON e.id = a.employee_id
`;

export interface AcknowledgementFilters {
  status?: AcknowledgementStatus;
  employee_id?: number;
  institutional_document_id?: number;
}

/** Tablero de seguimiento de RH. */
export const listAcknowledgements = async (
  filters: AcknowledgementFilters = {},
): Promise<AcknowledgementRecord[]> => {
  await assertTable();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`a.status = $${params.length}`);
  }
  if (filters.employee_id) {
    params.push(filters.employee_id);
    conditions.push(`a.employee_id = $${params.length}`);
  }
  if (filters.institutional_document_id) {
    params.push(filters.institutional_document_id);
    conditions.push(`a.institutional_document_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `${LIST_SELECT} ${where} ORDER BY a.deadline_at ASC, a.id DESC;`,
    params,
  );
  return result.rows.map(mapRow);
};

/** Pendientes del colaborador autenticado (autoservicio). */
export const listAcknowledgementsForEmployee = async (
  employeeId: number,
): Promise<AcknowledgementRecord[]> => {
  await assertTable();
  const result = await pool.query(
    `${LIST_SELECT}
      WHERE a.employee_id = $1
        AND a.status <> 'cancelled'
      ORDER BY a.deadline_at ASC, a.id DESC;`,
    [employeeId],
  );
  return result.rows.map(mapRow);
};

export const getAcknowledgementById = async (
  acknowledgementId: number,
): Promise<AcknowledgementRecord | null> => {
  await assertTable();
  const result = await pool.query(`${LIST_SELECT} WHERE a.id = $1 LIMIT 1;`, [acknowledgementId]);
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
};

/**
 * Cancela un acuse aun no firmado. Un acuse firmado es evidencia: no se borra
 * ni se cancela nunca.
 */
export const cancelAcknowledgement = async (acknowledgementId: number): Promise<boolean> => {
  await assertTable();
  const result = await pool.query(
    `UPDATE public.rh_document_acknowledgements
        SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
        AND status IN ('pending', 'in_progress', 'read', 'expired')
      RETURNING id;`,
    [acknowledgementId],
  );

  if (result.rows.length > 0) {
    return true;
  }

  const current = await pool.query(
    `SELECT status FROM public.rh_document_acknowledgements WHERE id = $1 LIMIT 1;`,
    [acknowledgementId],
  );
  if (current.rows.length === 0) {
    return false;
  }
  return fail('RH_ACK_ALREADY_SIGNED', 'Un acuse ya firmado no se puede cancelar.');
};

/**
 * Marca como vencidos los acuses cuyo plazo expiro sin firma. Idempotente;
 * pensado para el scheduler.
 */
export const expireOverdueAcknowledgements = async (): Promise<number> => {
  if (!(await tableExists())) {
    return 0;
  }
  const result = await pool.query(
    `UPDATE public.rh_document_acknowledgements
        SET status = 'expired', updated_at = NOW()
      WHERE status IN ('pending', 'in_progress', 'read')
        AND deadline_at < NOW()
      RETURNING id;`,
  );
  return result.rowCount ?? 0;
};
