import pool from '../config/db';
import type { CertificateSignatureRecord, CertificateTemplateRecord } from '../types';
import type { CertificateRenderInput } from './certificate-render.service';

/**
 * CRUD de la plantilla de constancia por capacitacion y armado de los datos para
 * el render (preliminar con datos de muestra; la generacion real va en Sprint 36).
 */

const DEFAULT_TITLE = 'Constancia de capacitacion';
const DEFAULT_BODY =
  'Se otorga la presente constancia a {{nombre}} por acreditar la capacitacion "{{capacitacion}}" con una calificacion de {{calificacion}} el {{fecha}}.';

const throwCoded = (code: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  throw error;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

interface CourseRow {
  id: number;
  title: string;
  certificate_validity_months: number;
}

const loadCourse = async (courseId: number): Promise<CourseRow> => {
  const result = await pool.query(
    `SELECT id, title, certificate_validity_months FROM public.training_courses WHERE id = $1 LIMIT 1;`,
    [courseId],
  );
  if (result.rows.length === 0) {
    throwCoded('TRAINING_COURSE_NOT_FOUND');
  }
  const row = result.rows[0];
  return {
    id: Number(row.id),
    title: String(row.title),
    certificate_validity_months: Number(row.certificate_validity_months),
  };
};

const loadSignatures = async (templateId: number): Promise<CertificateSignatureRecord[]> => {
  const result = await pool.query(
    `SELECT id, signatory_name, role, signature_image_path, sort_order
       FROM public.certificate_template_signatures
      WHERE certificate_template_id = $1
      ORDER BY sort_order ASC, id ASC;`,
    [templateId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    signatory_name: String(row.signatory_name),
    role: row.role ? String(row.role) : null,
    signature_image_path: row.signature_image_path ? String(row.signature_image_path) : null,
    sort_order: Number(row.sort_order),
  }));
};

/** Devuelve la plantilla existente o una por defecto (no persistida) para el curso. */
export const getCertificateTemplate = async (courseId: number): Promise<CertificateTemplateRecord> => {
  await loadCourse(courseId);
  const result = await pool.query(
    `SELECT id, training_course_id, title_text, body_text, logo_path, orientation
       FROM public.certificate_templates WHERE training_course_id = $1 LIMIT 1;`,
    [courseId],
  );
  if (result.rows.length === 0) {
    return {
      id: null,
      training_course_id: courseId,
      title_text: DEFAULT_TITLE,
      body_text: DEFAULT_BODY,
      logo_path: null,
      orientation: 'landscape',
      signatures: [],
    };
  }
  const row = result.rows[0];
  return {
    id: Number(row.id),
    training_course_id: Number(row.training_course_id),
    title_text: String(row.title_text),
    body_text: String(row.body_text),
    logo_path: row.logo_path ? String(row.logo_path) : null,
    orientation: String(row.orientation) as 'landscape' | 'portrait',
    signatures: await loadSignatures(Number(row.id)),
  };
};

export interface CertificateTemplatePayload {
  title_text?: string;
  body_text?: string;
  logo_path?: string | null;
  orientation?: 'landscape' | 'portrait';
  signatures?: Array<{ signatory_name: string; role?: string | null; signature_image_path?: string | null }>;
}

export const upsertCertificateTemplate = async (
  courseId: number,
  payload: CertificateTemplatePayload,
): Promise<CertificateTemplateRecord> => {
  await loadCourse(courseId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const upsertResult = await client.query(
      `INSERT INTO public.certificate_templates
         (training_course_id, title_text, body_text, logo_path, orientation)
       VALUES ($1, COALESCE($2, $5), COALESCE($3, $6), $4, COALESCE($7, 'landscape'))
       ON CONFLICT (training_course_id) DO UPDATE
         SET title_text = COALESCE($2, public.certificate_templates.title_text),
             body_text = COALESCE($3, public.certificate_templates.body_text),
             logo_path = $4,
             orientation = COALESCE($7, public.certificate_templates.orientation),
             updated_at = NOW()
       RETURNING id;`,
      [
        courseId,
        normalizeOptionalText(payload.title_text),
        normalizeOptionalText(payload.body_text),
        normalizeOptionalText(payload.logo_path),
        DEFAULT_TITLE,
        DEFAULT_BODY,
        payload.orientation ?? null,
      ],
    );
    const templateId = Number(upsertResult.rows[0]?.id);

    if (payload.signatures) {
      await client.query(
        `DELETE FROM public.certificate_template_signatures WHERE certificate_template_id = $1;`,
        [templateId],
      );
      for (const [index, signature] of payload.signatures.entries()) {
        await client.query(
          `INSERT INTO public.certificate_template_signatures
             (certificate_template_id, signatory_name, role, signature_image_path, sort_order)
           VALUES ($1, $2, $3, $4, $5);`,
          [
            templateId,
            signature.signatory_name.trim(),
            normalizeOptionalText(signature.role),
            normalizeOptionalText(signature.signature_image_path),
            index,
          ],
        );
      }
    }

    await client.query('COMMIT');
    return getCertificateTemplate(courseId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const formatValidity = (months: number): string =>
  months > 0 ? `${months} meses a partir de la emision` : 'Sin vencimiento';

/** Arma los datos de muestra para el preliminar (mismo motor que la real). */
export const buildPreviewRenderInput = async (courseId: number): Promise<CertificateRenderInput> => {
  const course = await loadCourse(courseId);
  const template = await getCertificateTemplate(courseId);
  const sampleDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  return {
    recipientName: 'Juan Perez Ramirez',
    courseTitle: course.title,
    date: sampleDate,
    scoreText: '95%',
    validityText: formatValidity(course.certificate_validity_months),
    titleText: template.title_text,
    bodyText: template.body_text,
    logoPath: template.logo_path,
    orientation: template.orientation,
    signatures: template.signatures.map((signature) => ({
      name: signature.signatory_name,
      role: signature.role,
      imagePath: signature.signature_image_path,
    })),
  };
};
