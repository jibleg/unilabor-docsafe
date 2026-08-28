import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { renderCertificatePdf } from './certificate-render.service';

/**
 * Generacion REAL de la constancia al acreditar una evaluacion (>= passing_score)
 * y auto-archivo en el expediente del colaborador (employee_documents, tipo
 * COURSE_CERTIFICATE) con vigencia. Idempotente: si la asignacion ya tiene
 * `certificate_document_id`, no regenera. Best-effort: el llamador la invoca
 * fuera de la transaccion critica y captura errores sin romper el flujo.
 */

const CERTIFICATE_TYPE_CODE = 'COURSE_CERTIFICATE';

interface IssuanceContext {
  assignmentId: number;
  employeeId: number;
  employeeName: string;
  courseId: number;
  courseTitle: string;
  validityMonths: number;
  percentage: number;
  issuerUserId: string;
}

const formatDate = (date: Date): string =>
  date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

const addMonths = (date: Date, months: number): Date => {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
};

/** Genera y archiva la constancia. Devuelve el id del documento o null si no aplica. */
export const issueCertificateForAssignment = async (assignmentId: number): Promise<number | null> => {
  const contextResult = await pool.query(
    `SELECT a.id, a.employee_id, a.status, a.percentage, a.certificate_document_id,
            a.created_by_user_id,
            e.full_name AS employee_name,
            c.id AS course_id, c.title AS course_title, c.certificate_validity_months
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.training_courses c ON c.id = t.training_course_id
       JOIN public.employees e ON e.id = a.employee_id
      WHERE a.id = $1 LIMIT 1;`,
    [assignmentId],
  );
  if (contextResult.rows.length === 0) {
    return null;
  }
  const row = contextResult.rows[0];

  // Solo se emite para evaluaciones acreditadas; idempotente.
  if (String(row.status) !== 'passed') {
    return null;
  }
  if (row.certificate_document_id) {
    return Number(row.certificate_document_id);
  }

  // Tipo documental COURSE_CERTIFICATE (catalogo base RH).
  const typeResult = await pool.query(
    `SELECT id FROM public.document_types WHERE code = $1 AND is_active = TRUE LIMIT 1;`,
    [CERTIFICATE_TYPE_CODE],
  );
  if (typeResult.rows.length === 0) {
    throw new Error('CERTIFICATE_DOCUMENT_TYPE_NOT_FOUND');
  }
  const documentTypeId = Number(typeResult.rows[0].id);

  // Usuario emisor: quien asigno; si no, un admin activo (FK NOT NULL).
  const issuerUserId = await resolveIssuerUserId(row.created_by_user_id ? String(row.created_by_user_id) : null);
  if (!issuerUserId) {
    throw new Error('CERTIFICATE_ISSUER_USER_NOT_FOUND');
  }

  const validityMonths = Number(row.certificate_validity_months);
  const context: IssuanceContext = {
    assignmentId,
    employeeId: Number(row.employee_id),
    employeeName: String(row.employee_name),
    courseId: Number(row.course_id),
    courseTitle: String(row.course_title),
    validityMonths,
    percentage: row.percentage !== null ? Number(row.percentage) : 0,
    issuerUserId,
  };

  return persistCertificate(context, documentTypeId);
};

const resolveIssuerUserId = async (preferredUserId: string | null): Promise<string | null> => {
  if (preferredUserId) {
    return preferredUserId;
  }
  const admin = await pool.query(
    `SELECT id FROM public.users WHERE is_active = TRUE ORDER BY (role = 'ADMIN') DESC, created_at ASC LIMIT 1;`,
  );
  return admin.rows.length > 0 ? String(admin.rows[0].id) : null;
};

const persistCertificate = async (context: IssuanceContext, documentTypeId: number): Promise<number> => {
  const issueDate = new Date();
  const expiryDate = context.validityMonths > 0 ? addMonths(issueDate, context.validityMonths) : null;
  const validityText = expiryDate ? `Valida hasta el ${formatDate(expiryDate)}` : 'Sin vencimiento';

  // Plantilla de constancia del curso (o defaults si no fue disenada).
  const template = await loadCertificateTemplate(context.assignmentId);

  const pdf = await renderCertificatePdf({
    recipientName: context.employeeName,
    courseTitle: context.courseTitle,
    date: formatDate(issueDate),
    scoreText: `${context.percentage}%`,
    validityText,
    titleText: template.title_text,
    bodyText: template.body_text,
    logoPath: template.logo_path,
    orientation: template.orientation,
    styleSeed: context.courseId,
    referenceCode: template.show_folio
      ? `CP-${issueDate.getFullYear()}-${String(context.assignmentId).padStart(4, '0')}`
      : undefined,
    signatures: template.signatures,
  });

  // Guardar el PDF en el directorio de documentos (mismo patron que las subidas).
  const uploadDir = process.env.DIRECTORY_UPLOAD || 'uploads/documents';
  fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `SAFEDOC-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, pdf);

  const isoIssue = issueDate.toISOString().slice(0, 10);
  const isoExpiry = expiryDate ? expiryDate.toISOString().slice(0, 10) : null;
  const title = `Constancia - ${context.courseTitle}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotencia bajo bloqueo: si otra ejecucion ya emitio, reutiliza.
    const lockResult = await client.query(
      `SELECT certificate_document_id FROM public.evaluation_assignments WHERE id = $1 FOR UPDATE;`,
      [context.assignmentId],
    );
    const existing = lockResult.rows[0]?.certificate_document_id;
    if (existing) {
      await client.query('COMMIT');
      return Number(existing);
    }

    // Versionado POR CAPACITACION: cada curso mantiene su propia constancia
    // vigente (discriminada por reference_key). Solo se supersede la constancia
    // previa del MISMO curso, no las de otras capacitaciones.
    const referenceKey = `training_course:${context.courseId}`;
    const currentResult = await client.query(
      `SELECT id, version FROM public.employee_documents
        WHERE employee_id = $1 AND document_type_id = $2 AND is_current = TRUE AND reference_key = $3
        ORDER BY version DESC
        LIMIT 1 FOR UPDATE;`,
      [context.employeeId, documentTypeId, referenceKey],
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
        context.employeeId,
        documentTypeId,
        title,
        `Generada automaticamente al acreditar la evaluacion (${context.percentage}%).`,
        filePath,
        pdf.length,
        context.issuerUserId,
        isoIssue,
        isoExpiry,
        nextVersion,
        currentDocument ? Number(currentDocument.id) : null,
        referenceKey,
      ],
    );
    const documentId = Number(insertResult.rows[0]?.id);

    await client.query(
      `UPDATE public.evaluation_assignments SET certificate_document_id = $2, updated_at = NOW() WHERE id = $1;`,
      [context.assignmentId, documentId],
    );

    await client.query('COMMIT');
    return documentId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Limpia el PDF huerfano si la transaccion fallo.
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    throw error;
  } finally {
    client.release();
  }
};

interface LoadedTemplate {
  title_text: string;
  body_text: string;
  logo_path: string | null;
  orientation: 'landscape' | 'portrait';
  show_folio: boolean;
  signatures: Array<{ name: string; role: string | null; imagePath: string | null }>;
}

const loadCertificateTemplate = async (assignmentId: number): Promise<LoadedTemplate> => {
  const result = await pool.query(
    `SELECT ct.id, ct.title_text, ct.body_text, ct.logo_path, ct.orientation, ct.show_folio
       FROM public.certificate_templates ct
       JOIN public.evaluation_templates t ON t.training_course_id = ct.training_course_id
       JOIN public.evaluation_assignments a ON a.template_id = t.id
      WHERE a.id = $1 LIMIT 1;`,
    [assignmentId],
  );
  if (result.rows.length === 0) {
    return {
      title_text: 'Constancia de capacitacion',
      body_text:
        'Se otorga la presente constancia a {{nombre}} por acreditar la capacitacion "{{capacitacion}}" con una calificacion de {{calificacion}} el {{fecha}}.',
      logo_path: null,
      orientation: 'landscape',
      show_folio: true,
      signatures: [],
    };
  }
  const row = result.rows[0];
  const signaturesResult = await pool.query(
    `SELECT signatory_name, role, signature_image_path
       FROM public.certificate_template_signatures
      WHERE certificate_template_id = $1 ORDER BY sort_order ASC, id ASC;`,
    [Number(row.id)],
  );
  return {
    title_text: String(row.title_text),
    body_text: String(row.body_text),
    logo_path: row.logo_path ? String(row.logo_path) : null,
    orientation: String(row.orientation) as 'landscape' | 'portrait',
    show_folio: Boolean(row.show_folio),
    signatures: signaturesResult.rows.map((s) => ({
      name: String(s.signatory_name),
      role: s.role ? String(s.role) : null,
      imagePath: s.signature_image_path ? String(s.signature_image_path) : null,
    })),
  };
};
