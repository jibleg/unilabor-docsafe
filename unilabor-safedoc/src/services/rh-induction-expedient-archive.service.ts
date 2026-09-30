import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { withTransaction } from '../utils/transaction';

/**
 * Copia firmada de las lecturas de Induccion al expediente del colaborador.
 *
 * Cada documento de una fase puede mapearse (RH lo configura, nada fijo en
 * codigo) a un tipo documental del expediente via
 * rh_induction_phase_documents.expedient_document_type_id. Al firmar el acuse,
 * la copia firmada (documento + hoja de acuse) se archiva como nueva version
 * de ese tipo: cualquier version vigente previa del mismo tipo (manual o
 * generada) queda 'superseded' y se conserva en el historial. Nunca se borra
 * evidencia. Idempotente por acuse (reference_key = induction_reading:<id>).
 */

export type InductionArchiveOutcome =
  | 'archived'
  | 'already_archived'
  | 'not_mapped'
  | 'not_signed'
  | 'file_missing'
  | 'not_induction';

export interface InductionArchiveResult {
  acknowledgementId: number;
  outcome: InductionArchiveOutcome;
  employeeDocumentId: number | null;
}

interface ArchiveCandidateRow {
  acknowledgement_id: string;
  status: string;
  signed_at: Date | null;
  signed_file_path: string | null;
  signer_user_id: string;
  employee_id: string;
  phase_number: number;
  document_title: string;
  document_code: string | null;
  document_type_id: string | null;
  document_type_active: boolean | null;
}

const referenceKeyFor = (acknowledgementId: number): string => `induction_reading:${acknowledgementId}`;

const loadCandidate = async (acknowledgementId: number): Promise<ArchiveCandidateRow | null> => {
  const result = await pool.query(
    `SELECT a.id AS acknowledgement_id, a.status, a.signed_at, a.signed_file_path, a.user_id AS signer_user_id,
            e.employee_id, ph.phase_number, d.title AS document_title, d.code AS document_code,
            pd.expedient_document_type_id AS document_type_id, dt.is_active AS document_type_active
       FROM public.quality_reading_acknowledgements a
       INNER JOIN public.rh_induction_reading_items ri ON ri.acknowledgement_id = a.id
       INNER JOIN public.rh_induction_enrollments e ON e.id = ri.enrollment_id
       INNER JOIN public.rh_induction_phases ph ON ph.id = e.phase_id
       INNER JOIN public.documents d ON d.id = ri.document_id
       LEFT JOIN public.rh_induction_phase_documents pd
              ON pd.phase_id = e.phase_id AND pd.document_id = ri.document_id
       LEFT JOIN public.document_types dt ON dt.id = pd.expedient_document_type_id
      WHERE a.id = $1
      ORDER BY ri.id ASC
      LIMIT 1;`,
    [acknowledgementId],
  );
  return (result.rows[0] as ArchiveCandidateRow | undefined) ?? null;
};

const resolveSignedFile = (storedPath: string): string | null => {
  const absolute = path.isAbsolute(storedPath) ? storedPath : path.resolve(process.cwd(), storedPath);
  return fs.existsSync(absolute) ? absolute : null;
};

/**
 * Archiva en el expediente la copia firmada del acuse indicado si su documento
 * de fase tiene tipo de expediente configurado. Seguro de reintentar.
 */
export const archiveInductionAcknowledgementToExpedient = async (
  acknowledgementId: number,
): Promise<InductionArchiveResult> => {
  const base: InductionArchiveResult = { acknowledgementId, outcome: 'not_induction', employeeDocumentId: null };
  const row = await loadCandidate(acknowledgementId);
  if (!row) return base;
  if (!row.document_type_id || row.document_type_active === false) return { ...base, outcome: 'not_mapped' };
  if (row.status !== 'signed' || !row.signed_file_path) return { ...base, outcome: 'not_signed' };

  const referenceKey = referenceKeyFor(acknowledgementId);
  const existing = await pool.query(`SELECT id FROM public.employee_documents WHERE reference_key = $1 LIMIT 1;`, [referenceKey]);
  if (existing.rows.length > 0) {
    return { ...base, outcome: 'already_archived', employeeDocumentId: Number(existing.rows[0].id) };
  }

  const sourcePath = resolveSignedFile(row.signed_file_path);
  if (!sourcePath) return { ...base, outcome: 'file_missing' };

  // Copia propia: la evidencia de Calidad y el expediente viven en almacenes distintos.
  const uploadDir = process.env.DIRECTORY_UPLOAD || 'uploads/documents';
  fs.mkdirSync(uploadDir, { recursive: true });
  const targetPath = path.join(uploadDir, `INDUCCION-ACUSE-${acknowledgementId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`);
  fs.copyFileSync(sourcePath, targetPath);
  const fileSize = fs.statSync(targetPath).size;

  const signedAt = row.signed_at ? new Date(row.signed_at) : new Date();
  const issueDate = signedAt.toISOString().slice(0, 10);
  const signedLabel = signedAt.toLocaleDateString('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' });
  // El titulo del SGC suele traer ya el codigo ("REH-REG-009 Carta..."): no duplicarlo.
  const alreadyCoded = row.document_code ? row.document_title.toUpperCase().includes(row.document_code.toUpperCase()) : true;
  const codePrefix = alreadyCoded ? '' : `${row.document_code} `;
  const title = `${codePrefix}${row.document_title} (firmado)`.slice(0, 250);
  const description = `Fase ${row.phase_number} de Induccion: acuse de lectura firmado el ${signedLabel}.`;

  try {
    const employeeDocumentId = await withTransaction(async (client) => {
      // Reemplazo con historico: cualquier version vigente del mismo tipo (cargada
      // a mano o archivada por el sistema) queda superseded y encadenada.
      const current = await client.query(
        `SELECT id, version FROM public.employee_documents
          WHERE employee_id = $1 AND document_type_id = $2 AND is_current = TRUE
          ORDER BY version DESC
          LIMIT 1 FOR UPDATE;`,
        [Number(row.employee_id), Number(row.document_type_id)],
      );
      const previous = current.rows[0] ?? null;
      const nextVersion = previous ? Number(previous.version) + 1 : 1;
      if (previous) {
        await client.query(
          `UPDATE public.employee_documents SET status = 'superseded', is_current = FALSE, updated_at = NOW() WHERE id = $1;`,
          [previous.id],
        );
      }
      const inserted = await client.query(
        `INSERT INTO public.employee_documents
           (employee_id, document_type_id, title, description, file_path, file_size, mime_type,
            uploaded_by_user_id, issue_date, expiry_date, status, version, is_current, replaces_document_id, reference_key)
         VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', $7, $8, NULL, 'active', $9, TRUE, $10, $11)
         RETURNING id;`,
        [
          Number(row.employee_id),
          Number(row.document_type_id),
          title,
          description,
          targetPath,
          fileSize,
          row.signer_user_id,
          issueDate,
          nextVersion,
          previous ? Number(previous.id) : null,
          referenceKey,
        ],
      );
      return Number(inserted.rows[0].id);
    });
    return { ...base, outcome: 'archived', employeeDocumentId };
  } catch (error) {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    throw error;
  }
};

/** Gancho best-effort tras la firma en Sala de Lectura: nunca rompe la firma. */
export const tryArchiveInductionAcknowledgement = (acknowledgementId: number): void => {
  archiveInductionAcknowledgementToExpedient(acknowledgementId).catch((error) => {
    console.error(`No se pudo archivar en el expediente el acuse de induccion ${acknowledgementId}:`, error);
  });
};

export interface InductionArchiveBatchSummary {
  total: number;
  archived: number;
  already_archived: number;
  file_missing: number;
  not_signed: number;
  failed: number;
}

/**
 * Archiva las firmas YA existentes de un documento de fase (historico). Recorre
 * todos los acuses ligados a ese documento en esa fase; los ya archivados o sin
 * firma se omiten. Un error en un acuse no detiene el resto.
 */
export const archiveSignedReadingsForPhaseDocument = async (phaseDocumentId: number): Promise<InductionArchiveBatchSummary> => {
  const acks = await pool.query(
    `SELECT DISTINCT ri.acknowledgement_id
       FROM public.rh_induction_phase_documents pd
       INNER JOIN public.rh_induction_enrollments e ON e.phase_id = pd.phase_id
       INNER JOIN public.rh_induction_reading_items ri ON ri.enrollment_id = e.id AND ri.document_id = pd.document_id
      WHERE pd.id = $1 AND ri.acknowledgement_id IS NOT NULL
      ORDER BY ri.acknowledgement_id ASC;`,
    [phaseDocumentId],
  );
  const summary: InductionArchiveBatchSummary = { total: acks.rows.length, archived: 0, already_archived: 0, file_missing: 0, not_signed: 0, failed: 0 };
  for (const ack of acks.rows) {
    try {
      const result = await archiveInductionAcknowledgementToExpedient(Number(ack.acknowledgement_id));
      if (result.outcome === 'archived') summary.archived += 1;
      else if (result.outcome === 'already_archived') summary.already_archived += 1;
      else if (result.outcome === 'file_missing') summary.file_missing += 1;
      else if (result.outcome === 'not_signed') summary.not_signed += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(`Fallo al archivar el acuse ${ack.acknowledgement_id} del documento de fase ${phaseDocumentId}:`, error);
    }
  }
  return summary;
};
