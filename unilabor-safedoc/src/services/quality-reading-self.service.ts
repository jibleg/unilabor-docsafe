import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { safeUnlink, sha256Buffer } from '../utils/file-storage';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { withTransaction } from '../utils/transaction';
import { resolveStoredDocumentPath } from './document.service';
import { buildReadingAnnexPdf, extractReadingAnnexPage } from './reading/reading-annex.pdf';
import { refreshInductionForAcknowledgement } from './rh-induction.service';
import {
  creditReadingHeartbeat,
  isValidPage,
  DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
  DEFAULT_MAX_HEARTBEAT_CREDIT_SECONDS,
} from './reading/reading-progress.engine';

// -----------------------------------------------------------------------------
// Sala de Lectura: lado del LECTOR.
//
// El lector recorre el documento del SGC y lo firma. Toda la contabilidad del
// tiempo la hace el servidor (ver reading-progress.engine); el cliente solo
// reporta en que pagina esta. Firmar exige `status = 'read'` verificado aqui:
// el gate del visor es UX, este es el control real.
//
// La copia firmada se queda en el repositorio de evidencias de CALIDAD. No se
// escribe en el expediente del colaborador: es un documento del SGC, no del
// trabajador. Por eso este flujo no depende de que el lector tenga expediente.
// -----------------------------------------------------------------------------

export { DEFAULT_HEARTBEAT_INTERVAL_SECONDS as HEARTBEAT_INTERVAL_SECONDS };

const EVIDENCE_DIR = 'uploads/quality-reading-evidence';

export interface MyReadingRecord {
  id: number;
  publication_id: number;
  document_id: string;
  document_title: string;
  instructions: string | null;
  status: string;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  pages_seen: number[];
  pages_seen_count: number;
  min_seconds_per_page: number;
  active_seconds: number;
  current_page: number | null;
  has_signed_copy: boolean;
}

export interface SignReadingPayload {
  signature: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

const fail = (code: string, message?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (message) {
    (error as any).publicMessage = message;
  }
  throw error;
};

const SELECT_MY_READING = `
  SELECT
    a.*,
    p.document_id,
    p.title_snapshot AS document_title,
    p.instructions
  FROM public.quality_reading_acknowledgements a
  INNER JOIN public.quality_reading_publications p ON p.id = a.publication_id
`;

const mapRow = (row: any): MyReadingRecord => {
  const pagesSeen: number[] = Array.isArray(row.pages_seen) ? row.pages_seen.map(Number) : [];
  return {
    id: Number(row.id),
    publication_id: Number(row.publication_id),
    document_id: String(row.document_id),
    document_title: String(row.document_title),
    instructions: row.instructions ? String(row.instructions) : null,
    status: String(row.status),
    deadline_at: row.deadline_at ? toIsoDateTime(row.deadline_at) : null,
    started_at: row.started_at ? toIsoDateTime(row.started_at) : null,
    read_completed_at: row.read_completed_at ? toIsoDateTime(row.read_completed_at) : null,
    signed_at: row.signed_at ? toIsoDateTime(row.signed_at) : null,
    pages_total: Number(row.pages_total),
    pages_seen: pagesSeen,
    pages_seen_count: pagesSeen.length,
    min_seconds_per_page: Number(row.min_seconds_per_page),
    active_seconds: Number(row.active_seconds),
    current_page: row.current_page === null ? null : Number(row.current_page),
    has_signed_copy: Boolean(row.signed_file_path),
  };
};

/**
 * Lecturas de Induccion que NO se muestran al colaborador: las de una fase que
 * sigue en borrador (RH aun no la publica) y las de una fase que ya aprobo
 * (la evidencia se conserva integra en Calidad/RH y en su expediente; solo
 * deja de estorbar en "Mis lecturas").
 */
const HIDDEN_INDUCTION_READING = `
  EXISTS (
    SELECT 1
      FROM public.rh_induction_reading_items ri
      INNER JOIN public.rh_induction_enrollments e ON e.id = ri.enrollment_id
      INNER JOIN public.rh_induction_phases ph ON ph.id = e.phase_id
      LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
     WHERE ri.acknowledgement_id = a.id
       AND (ph.published_at IS NULL OR ea.status = 'passed')
  )`;

export const listMyReadings = async (userId: string): Promise<MyReadingRecord[]> => {
  const result = await pool.query(
    `${SELECT_MY_READING}
      WHERE a.user_id = $1 AND a.status <> 'cancelled'
        AND NOT ${HIDDEN_INDUCTION_READING}
      ORDER BY a.deadline_at ASC, a.id DESC;`,
    [userId],
  );
  return result.rows.map(mapRow);
};

export const getMyReading = async (
  readingId: number,
  userId: string,
): Promise<MyReadingRecord> => {
  const result = await pool.query(`${SELECT_MY_READING} WHERE a.id = $1 LIMIT 1;`, [readingId]);
  if (result.rows.length === 0) {
    return fail('QUALITY_READING_NOT_FOUND', 'La lectura no existe.');
  }
  if (String(result.rows[0].user_id) !== userId) {
    return fail('QUALITY_READING_FORBIDDEN', 'No tienes acceso a esta lectura.');
  }
  const hidden = await pool.query(
    `SELECT 1 FROM public.quality_reading_acknowledgements a WHERE a.id = $1 AND ${HIDDEN_INDUCTION_READING} LIMIT 1;`,
    [readingId],
  );
  if (hidden.rows.length > 0) {
    return fail(
      'QUALITY_READING_FORBIDDEN',
      'Esta lectura no esta disponible: la fase de induccion aun no se publica o ya fue aprobada.',
    );
  }
  return mapRow(result.rows[0]);
};

/**
 * Resuelve el PDF fuente de una lectura propia. Es lo que permite al lector
 * abrir el documento del SGC sin tener permiso sobre el repositorio documental:
 * lo autoriza el hecho de que la lectura sea suya.
 */
export const resolveMyReadingSource = async (
  readingId: number,
  userId: string,
): Promise<{ absolutePath: string; title: string }> => {
  const result = await pool.query(
    `SELECT a.user_id, p.title_snapshot, d.file_path
       FROM public.quality_reading_acknowledgements a
       INNER JOIN public.quality_reading_publications p ON p.id = a.publication_id
       INNER JOIN public.documents d ON d.id = p.document_id
      WHERE a.id = $1 LIMIT 1;`,
    [readingId],
  );

  if (result.rows.length === 0) {
    return fail('QUALITY_READING_NOT_FOUND', 'La lectura no existe.');
  }
  const row = result.rows[0];
  if (String(row.user_id) !== userId) {
    return fail('QUALITY_READING_FORBIDDEN', 'No tienes acceso a esta lectura.');
  }

  try {
    return {
      absolutePath: resolveStoredDocumentPath(String(row.file_path)),
      title: String(row.title_snapshot),
    };
  } catch {
    return fail(
      'QUALITY_DOCUMENT_FILE_MISSING',
      'No se encontro el archivo del documento en el servidor.',
    );
  }
};

/**
 * Registra un latido del visor: "el lector sigue viendo la pagina N". El
 * credito de tiempo lo calcula el motor compartido con el reloj del servidor.
 */
export const registerReadingProgress = async (
  readingId: number,
  userId: string,
  page: number,
): Promise<MyReadingRecord> =>
  withTransaction(async (client) => {
    // FOR UPDATE: dos pestanias abiertas no se pisan al acumular.
    const current = await client.query(
      `SELECT * FROM public.quality_reading_acknowledgements WHERE id = $1 FOR UPDATE;`,
      [readingId],
    );
    if (current.rows.length === 0) {
      return fail('QUALITY_READING_NOT_FOUND', 'La lectura no existe.');
    }

    const row = current.rows[0];
    if (String(row.user_id) !== userId) {
      return fail('QUALITY_READING_FORBIDDEN', 'No tienes acceso a esta lectura.');
    }
    if (!['pending', 'in_progress'].includes(String(row.status))) {
      return fail('QUALITY_READING_NOT_TRACKABLE', 'Esta lectura ya no admite avance.');
    }
    if (new Date(row.deadline_at).getTime() < Date.now()) {
      return fail('QUALITY_READING_EXPIRED', 'El plazo para esta lectura ya vencio.');
    }

    const pagesTotal = Number(row.pages_total);
    if (!isValidPage(page, pagesTotal)) {
      return fail('QUALITY_READING_INVALID_PAGE', 'La pagina reportada no existe en el documento.');
    }

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
      { maxCreditSeconds: DEFAULT_MAX_HEARTBEAT_CREDIT_SECONDS },
    );

    await client.query(
      `UPDATE public.quality_reading_acknowledgements
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
        WHERE id = $1;`,
      [
        readingId,
        progress.status,
        progress.current_page,
        progress.current_page_seconds,
        progress.active_seconds,
        progress.pages_seen,
        progress.completed,
      ],
    );

    const updated = await client.query(`${SELECT_MY_READING} WHERE a.id = $1;`, [readingId]);
    return mapRow(updated.rows[0]);
  });

/**
 * Firma la lectura: genera el PDF con la hoja anexa y lo deja en el repositorio
 * de evidencias de Calidad. Exige `status = 'read'` en el SERVIDOR. Si algo
 * falla, los archivos escritos se limpian para no dejar huerfanos en disco.
 */
export const signReading = async (
  readingId: number,
  userId: string,
  payload: SignReadingPayload,
): Promise<MyReadingRecord> => {
  const signatureBuffer = decodeSignaturePng(payload.signature);
  if (!signatureBuffer) {
    return fail('QUALITY_READING_INVALID_SIGNATURE', 'La firma autografa es invalida o esta vacia.');
  }

  let signaturePath: string | null = null;
  let signedPdfPath: string | null = null;

  try {
    const result = await withTransaction(async (client) => {
      const current = await client.query(
        `SELECT a.*, p.title_snapshot, p.document_id, d.file_path, u.full_name AS user_name
           FROM public.quality_reading_acknowledgements a
           INNER JOIN public.quality_reading_publications p ON p.id = a.publication_id
           INNER JOIN public.documents d ON d.id = p.document_id
           INNER JOIN public.users u ON u.id = a.user_id
          WHERE a.id = $1
          FOR UPDATE OF a;`,
        [readingId],
      );
      if (current.rows.length === 0) {
        return fail('QUALITY_READING_NOT_FOUND', 'La lectura no existe.');
      }

      const row = current.rows[0];
      if (String(row.user_id) !== userId) {
        return fail('QUALITY_READING_FORBIDDEN', 'No tienes acceso a esta lectura.');
      }
      if (String(row.status) === 'signed') {
        return fail('QUALITY_READING_ALREADY_SIGNED', 'Esta lectura ya fue firmada.');
      }
      // El control real de la lectura completa: no basta con que el front lo crea.
      if (String(row.status) !== 'read') {
        return fail(
          'QUALITY_READING_NOT_READ',
          'Debes recorrer el documento completo antes de firmarlo.',
        );
      }
      if (new Date(row.deadline_at).getTime() < Date.now()) {
        return fail('QUALITY_READING_EXPIRED', 'El plazo para esta lectura ya vencio.');
      }

      let absolutePath: string;
      try {
        absolutePath = resolveStoredDocumentPath(String(row.file_path));
      } catch {
        return fail(
          'QUALITY_DOCUMENT_FILE_MISSING',
          'No se encontro el archivo del documento en el servidor.',
        );
      }
      const sourcePdf = fs.readFileSync(absolutePath);

      // Si el archivo cambio desde que se publico, la evidencia ya no
      // corresponde a lo que se leyo: mejor abortar que firmar algo distinto.
      if (row.source_sha256 && sha256Buffer(sourcePdf) !== String(row.source_sha256)) {
        return fail(
          'QUALITY_READING_SOURCE_CHANGED',
          'El documento cambio desde que se publico a lectura. Pide una publicacion nueva.',
        );
      }

      const signedAt = new Date();
      signaturePath = writeSignaturePng(signatureBuffer, 'SIGN-QREAD');

      const signedPdf = await buildReadingAnnexPdf({
        sourcePdf,
        signaturePng: signatureBuffer,
        documentTitle: String(row.title_snapshot),
        identifierLabel: 'DOCUMENTO DEL SGC',
        identifierValue: `Publicacion #${Number(row.publication_id)}`,
        signerLabel: 'LECTOR',
        signerName: String(row.user_name),
        signerCode: null,
        sourceSha256: String(row.source_sha256 ?? ''),
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

      // La evidencia vive en Calidad, en su propio almacen: el repositorio
      // documental controla documentos vigentes, no archiva copias firmadas.
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
      signedPdfPath = path.join(
        EVIDENCE_DIR,
        `LECTURA-${readingId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`,
      );
      fs.writeFileSync(signedPdfPath, signedPdf);

      await client.query(
        `UPDATE public.quality_reading_acknowledgements
            SET status = 'signed',
                signed_at = $2,
                signature_path = $3,
                signed_file_path = $4,
                signed_sha256 = $5,
                ip_address = $6,
                user_agent = $7,
                updated_at = NOW()
          WHERE id = $1;`,
        [
          readingId,
          signedAt,
          signaturePath,
          signedPdfPath,
          sha256Buffer(signedPdf),
          payload.ip_address ?? null,
          payload.user_agent ?? null,
        ],
      );

      const updated = await client.query(`${SELECT_MY_READING} WHERE a.id = $1;`, [readingId]);
      return mapRow(updated.rows[0]);
    });

    // Best-effort: si este acuse pertenece a una fase de induccion de RH,
    // revisa si con esta firma ya se completo la lectura de la fase (fuera de
    // la transaccion de Calidad, es un modulo distinto).
    void refreshInductionForAcknowledgement(readingId);

    return result;
  } catch (error) {
    // Transaccion revertida: los archivos ya escritos no deben sobrevivir.
    safeUnlink(signaturePath);
    safeUnlink(signedPdfPath);
    throw error;
  }
};

/**
 * Resuelve la copia firmada. La puede pedir el propio lector; el gestor de la
 * sala usa `allowAnyOwner` porque su permiso ya lo autoriza a ver la evidencia.
 */
export const resolveSignedCopy = async (
  readingId: number,
  userId: string,
  options: { allowAnyOwner?: boolean } = {},
): Promise<{ absolutePath: string; fileName: string }> => {
  const result = await pool.query(
    `SELECT a.user_id, a.signed_file_path, p.title_snapshot
       FROM public.quality_reading_acknowledgements a
       INNER JOIN public.quality_reading_publications p ON p.id = a.publication_id
      WHERE a.id = $1 LIMIT 1;`,
    [readingId],
  );

  if (result.rows.length === 0) {
    return fail('QUALITY_READING_NOT_FOUND', 'La lectura no existe.');
  }

  const row = result.rows[0];
  if (!options.allowAnyOwner && String(row.user_id) !== userId) {
    return fail('QUALITY_READING_FORBIDDEN', 'No tienes acceso a esta lectura.');
  }
  if (!row.signed_file_path) {
    return fail('QUALITY_READING_NOT_SIGNED', 'Esta lectura todavia no tiene copia firmada.');
  }

  const absolutePath = path.isAbsolute(String(row.signed_file_path))
    ? String(row.signed_file_path)
    : path.resolve(process.cwd(), String(row.signed_file_path));

  if (!fs.existsSync(absolutePath)) {
    return fail('QUALITY_READING_FILE_MISSING', 'No se encontro la copia firmada en el servidor.');
  }

  return {
    absolutePath,
    fileName: `${String(row.title_snapshot)} (firmado).pdf`,
  };
};

/**
 * Constancia que se entrega al PROPIO lector: unicamente la hoja de acuse, sin
 * las paginas del documento. El documento del SGC es controlado y solo se
 * consulta dentro del visor protegido; la copia firmada completa queda como
 * evidencia en Calidad y la ve el gestor de la sala.
 */
export const loadReaderConstancia = async (
  readingId: number,
  userId: string,
): Promise<{ content: Buffer; fileName: string }> => {
  const { absolutePath, fileName } = await resolveSignedCopy(readingId, userId);
  const content = await extractReadingAnnexPage(fs.readFileSync(absolutePath));
  return {
    content,
    fileName: fileName.replace(/ \(firmado\)\.pdf$/, ' - Constancia de lectura.pdf'),
  };
};
