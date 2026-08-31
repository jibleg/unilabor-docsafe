import fs from 'fs';
import path from 'path';
import pool from '../config/db';

/**
 * Archivo de PDFs GENERADOS por el sistema en el expediente del colaborador
 * (employee_documents), con el mismo versionado por reference_key que usa
 * persistCertificate (certificate-issuance.service.ts): la version vigente
 * previa del mismo (employee, tipo, reference_key) queda superseded y la
 * nueva entra como is_current. Nunca borra evidencia.
 */

const throwCoded = (code: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  throw error;
};

export interface ArchiveGeneratedPdfInput {
  employeeId: number;
  /** Codigo del tipo documental destino (ej. FORMA_INDUCC). */
  documentTypeCode: string;
  /** Discrimina la cadena de versiones dentro del mismo tipo (ej. induction_record:84). */
  referenceKey: string;
  title: string;
  description?: string | null;
  pdf: Buffer;
  uploadedByUserId: string;
  /** Vigencia (YYYY-MM-DD): con has_expiry en el tipo, las alertas de expediente la reclaman al vencer. */
  expiryDate?: string | null;
}

/** Archiva el PDF y devuelve el id del employee_document creado. */
export const archiveGeneratedPdfToExpedient = async (input: ArchiveGeneratedPdfInput): Promise<number> => {
  const typeResult = await pool.query(
    `SELECT id FROM public.document_types WHERE UPPER(code) = UPPER($1) AND is_active = TRUE LIMIT 1;`,
    [input.documentTypeCode],
  );
  if (typeResult.rows.length === 0) {
    throwCoded('ARCHIVE_DOCUMENT_TYPE_NOT_FOUND');
  }
  const documentTypeId = Number(typeResult.rows[0].id);

  const uploadDir = process.env.DIRECTORY_UPLOAD || 'uploads/documents';
  fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `SAFEDOC-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, input.pdf);

  const isoIssue = new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT id, version FROM public.employee_documents
        WHERE employee_id = $1 AND document_type_id = $2 AND is_current = TRUE AND reference_key = $3
        ORDER BY version DESC
        LIMIT 1 FOR UPDATE;`,
      [input.employeeId, documentTypeId, input.referenceKey],
    );
    const currentDocument = currentResult.rows[0] ?? null;
    const nextVersion = currentDocument ? Number(currentDocument.version) + 1 : 1;
    if (currentDocument) {
      await client.query(
        `UPDATE public.employee_documents SET status = 'superseded', is_current = FALSE, updated_at = NOW() WHERE id = $1;`,
        [currentDocument.id],
      );
    }

    const insertResult = await client.query(
      `INSERT INTO public.employee_documents
         (employee_id, document_type_id, title, description, file_path, file_size, mime_type,
          uploaded_by_user_id, issue_date, expiry_date, status, version, is_current, replaces_document_id, reference_key)
       VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', $7, $8, $9, 'active', $10, TRUE, $11, $12)
       RETURNING id;`,
      [
        input.employeeId,
        documentTypeId,
        input.title,
        input.description ?? null,
        filePath,
        input.pdf.length,
        input.uploadedByUserId,
        isoIssue,
        input.expiryDate ?? null,
        nextVersion,
        currentDocument ? Number(currentDocument.id) : null,
        input.referenceKey,
      ],
    );

    await client.query('COMMIT');
    return Number(insertResult.rows[0]?.id);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    throw error;
  } finally {
    client.release();
  }
};
