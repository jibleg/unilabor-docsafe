import pool from '../config/db';
import { renderCertificatePdf } from './certificate-render.service';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import {
  AUTHORIZATION_LABELS,
  DICTAMEN_LABELS,
  getEvaluationById,
  type CompetencyEvaluationRecord,
} from './rh-competency-evaluation.service';

/**
 * Constancia de competencia (REH-REG-003): documento que acredita el dictamen
 * y la autorizacion del colaborador para el puesto. Se emite al cerrar la
 * evaluacion (dictamen distinto de NO COMPETENTE) y se archiva en el expediente
 * en Competencias laborales, tipo COMPETENCY_CERTIFICATE, con expiry_date =
 * vigencia de la autorizacion. Reutiliza el motor de constancias (pdfkit) con
 * las firmas capturadas en el cierre (evaluador, area, RH y direccion).
 * Idempotente: si ya existe, devuelve la vigente; `force` la reemplaza como
 * nueva version (la anterior queda superseded, nunca se borra).
 */

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

const EVALUATION_TYPE_TEXT: Record<string, string> = {
  INICIAL: 'evaluación inicial',
  PERIODICA: 'evaluación periódica',
  REEVALUACION: 'reevaluación',
  CAMBIO_PUESTO: 'evaluación por cambio de puesto',
  POST_CAPACITACION: 'evaluación posterior a capacitación',
};

const formatDateOnly = (value: string | null): string => {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(match[3])} de ${months[Number(match[2]) - 1]} de ${match[1]}`;
};

interface SignatureRow {
  evaluator_signature_path: string | null;
  area_signature_path: string | null;
  rh_signature_path: string | null;
  director_signature_path: string | null;
  created_by_user_id: string | null;
}

const loadSignatureRow = async (evaluationId: number): Promise<SignatureRow> => {
  const result = await pool.query(
    `SELECT evaluator_signature_path, area_signature_path, rh_signature_path, director_signature_path, created_by_user_id
       FROM public.rh_competency_evaluations WHERE id = $1 LIMIT 1;`,
    [evaluationId],
  );
  const row = result.rows[0] ?? {};
  return {
    evaluator_signature_path: row.evaluator_signature_path ? String(row.evaluator_signature_path) : null,
    area_signature_path: row.area_signature_path ? String(row.area_signature_path) : null,
    rh_signature_path: row.rh_signature_path ? String(row.rh_signature_path) : null,
    director_signature_path: row.director_signature_path ? String(row.director_signature_path) : null,
    created_by_user_id: row.created_by_user_id ? String(row.created_by_user_id) : null,
  };
};

export const isCertificateEligible = (record: CompetencyEvaluationRecord): boolean =>
  record.status === 'CLOSED' && record.results.dictamen !== null && record.results.dictamen !== 'NO_COMPETENTE';

export interface IssueCompetencyCertificateInput {
  evaluationId: number;
  actorUserId: string | null;
  /** true = emitir de nuevo aunque ya exista (nueva version en el expediente). */
  force?: boolean;
}

export const issueCompetencyCertificate = async (
  input: IssueCompetencyCertificateInput,
): Promise<CompetencyEvaluationRecord> => {
  const record = await getEvaluationById(input.evaluationId);
  if (!record) {
    return throwCoded('RH_COMP_EVAL_NOT_FOUND', 'La evaluacion indicada no existe.');
  }
  if (record.status !== 'CLOSED') {
    return throwCoded('RH_COMP_EVAL_NOT_CLOSED', 'La constancia se emite al cerrar la evaluacion.');
  }
  if (!isCertificateEligible(record)) {
    return throwCoded(
      'RH_COMP_EVAL_CERT_NOT_ELIGIBLE',
      'Con dictamen NO COMPETENTE no se emite constancia de competencia.',
    );
  }
  if (record.certificate_document_id && !input.force) {
    return record;
  }

  const signatures = await loadSignatureRow(record.id);
  const dictamen = DICTAMEN_LABELS[record.results.dictamen!];
  const authorization = record.results.authorization_result
    ? AUTHORIZATION_LABELS[record.results.authorization_result] ?? record.results.authorization_result
    : dictamen;
  const validityText = record.valid_until
    ? `Vigente hasta el ${formatDateOnly(record.valid_until)}.`
    : 'Sin vigencia definida.';

  const pdf = await renderCertificatePdf({
    recipientName: record.employee_name,
    courseTitle: `Puesto: ${record.position_name}`,
    date: formatDateOnly(record.authorized_at ?? record.evaluation_date),
    scoreText: record.results.final_pct !== null ? `${record.results.final_pct}%` : '—',
    validityText,
    titleText: 'Constancia de competencia',
    bodyText:
      `Se hace constar que {{nombre}} fue evaluado(a) conforme al registro REH-REG-003 ` +
      `(${EVALUATION_TYPE_TEXT[record.evaluation_type] ?? 'evaluación de competencia'}) para el {{capacitacion}}, ` +
      `obteniendo el dictamen ${dictamen} con un resultado global de {{calificacion}} ` +
      `(competencia ${record.results.competency_pct ?? '—'}%, desempeño ${record.results.performance_pct ?? '—'}%, ` +
      `conocimiento ${record.results.knowledge_pct ?? '—'}%), por lo que queda ${authorization} ` +
      `para desempeñar las actividades del puesto a partir del {{fecha}}. {{vigencia}}`,
    orientation: 'landscape',
    styleSeed: record.position_id,
    referenceCode: `REH-REG-003-${record.id}`,
    signatures: [
      { name: record.evaluator_name, role: 'Evaluador técnico', imagePath: signatures.evaluator_signature_path },
      { name: record.area_signatory_name ?? 'Coordinación del área', role: 'Coordinador del área', imagePath: signatures.area_signature_path },
      { name: record.rh_signatory_name ?? 'Recursos Humanos', role: 'Coordinador de RH', imagePath: signatures.rh_signature_path },
      { name: record.director_signatory_name ?? 'Dirección General', role: 'Director General', imagePath: signatures.director_signature_path },
    ],
  });

  const uploadedByUserId =
    input.actorUserId ??
    signatures.created_by_user_id ??
    (await pool
      .query(`SELECT id FROM public.users WHERE is_active = TRUE ORDER BY (role = 'ADMIN') DESC, created_at ASC LIMIT 1;`)
      .then((r) => (r.rows.length > 0 ? String(r.rows[0].id) : null)));
  if (!uploadedByUserId) {
    return throwCoded('RH_COMP_EVAL_USER_NOT_FOUND', 'No hay un usuario emisor disponible.');
  }

  const documentId = await archiveGeneratedPdfToExpedient({
    employeeId: record.employee_id,
    documentTypeCode: 'COMPETENCY_CERTIFICATE',
    referenceKey: `competency_certificate:${record.id}`,
    title: `Constancia de competencia - ${record.position_name} - ${dictamen}`,
    description: `Emitida al cerrar la evaluacion de competencia REH-REG-003 #${record.id} (${formatDateOnly(record.evaluation_date)}).`,
    pdf,
    uploadedByUserId,
    expiryDate: record.valid_until,
  });

  await pool.query(
    `UPDATE public.rh_competency_evaluations SET certificate_document_id = $2, updated_at = NOW() WHERE id = $1;`,
    [record.id, documentId],
  );

  return (await getEvaluationById(record.id)) as CompetencyEvaluationRecord;
};

/** Emision best-effort tras el cierre: nunca bloquea el cierre de la evaluacion. */
export const tryIssueCompetencyCertificate = async (
  evaluationId: number,
  actorUserId: string | null,
): Promise<number | null> => {
  try {
    const record = await issueCompetencyCertificate({ evaluationId, actorUserId });
    return record.certificate_document_id;
  } catch (error: any) {
    if (error?.code === 'RH_COMP_EVAL_CERT_NOT_ELIGIBLE') {
      return null;
    }
    console.error('No se pudo emitir la constancia de competencia:', error);
    return null;
  }
};
