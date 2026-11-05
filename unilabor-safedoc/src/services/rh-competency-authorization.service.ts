import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import { buildCompetencyEvaluationPdf } from './rh-competency-evaluation.pdf';
import {
  AUTHORIZATION_LABELS,
  DICTAMEN_LABELS,
  getEvaluationById,
  listEvaluationItems,
  type CompetencyEvaluationRecord,
  type CompetencyEvaluationResults,
} from './rh-competency-evaluation.service';

// -----------------------------------------------------------------------------
// Autorizacion del REH-REG-003: paso propio de RH / Direccion General, posterior
// al cierre. Vive aparte del motor de la evaluacion (rh-competency-evaluation.
// service.ts) solo para mantener ese archivo por debajo de las 1000 lineas.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

const addMonths = (date: Date, months: number): Date => {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
};


export type CompetencyAuthorizationDecision = 'AUTORIZADO' | 'AUTORIZADO_CON_SEGUIMIENTO' | 'NO_AUTORIZADO';

export interface AuthorizeEvaluationInput {
  evaluationId: number;
  decision: CompetencyAuthorizationDecision;
  note: string | null;
  decidedByUserId: string;
}

const readSignatureFile = (storedPath: string | null): Buffer => {
  if (!storedPath) return throwCoded('RH_COMP_EVAL_SIGNATURE_FILE_MISSING', 'No se encontro una firma del cierre para regenerar el registro.');
  const absolute = path.isAbsolute(storedPath) ? storedPath : path.resolve(process.cwd(), storedPath);
  if (!fs.existsSync(absolute)) return throwCoded('RH_COMP_EVAL_SIGNATURE_FILE_MISSING', 'No se encontro una firma del cierre para regenerar el registro.');
  return fs.readFileSync(absolute);
};

/**
 * Ejecuta la autorizacion de una evaluacion cerrada con dictamen competente
 * (authorization_result = PENDIENTE). Sella decision, quien y cuando, fija la
 * vigencia de 12 meses (si se autoriza), regenera el PDF oficial como nueva
 * version en el expediente (la version del cierre queda en historial) y deja
 * la evaluacion lista para emitir la constancia.
 */
export const authorizeEvaluation = async (input: AuthorizeEvaluationInput): Promise<CompetencyEvaluationRecord> => {
  const record = await getEvaluationById(input.evaluationId);
  if (!record) return throwCoded('RH_COMP_EVAL_NOT_FOUND', 'La evaluacion indicada no existe.');
  if (record.status !== 'CLOSED') return throwCoded('RH_COMP_EVAL_NOT_CLOSED', 'La autorizacion se ejecuta sobre una evaluacion cerrada.');
  if (record.results.authorization_result !== 'PENDIENTE') {
    return throwCoded('RH_COMP_EVAL_AUTH_NOT_PENDING', 'Esta evaluacion no esta pendiente de autorizacion.');
  }

  const paths = await pool.query(
    `SELECT collaborator_signature_path, evaluator_signature_path, area_signature_path, rh_signature_path, director_signature_path
       FROM public.rh_competency_evaluations WHERE id = $1;`,
    [record.id],
  );
  const row = paths.rows[0] ?? {};
  const decidedAt = new Date();
  const authorized = input.decision !== 'NO_AUTORIZADO';
  const validUntil = authorized ? addMonths(decidedAt, 12) : null;
  const decidedBy = await pool.query(`SELECT full_name FROM public.users WHERE id = $1;`, [input.decidedByUserId]);
  const decidedByName = decidedBy.rows[0]?.full_name ? String(decidedBy.rows[0].full_name) : null;

  const sealedResults: CompetencyEvaluationResults = { ...record.results, authorization_result: input.decision };
  const items = record.items ?? (await listEvaluationItems(record.id));
  const pdf = await buildCompetencyEvaluationPdf({
    record: {
      ...record,
      results: sealedResults,
      authorized_at: decidedAt.toISOString().slice(0, 10),
      valid_until: validUntil ? validUntil.toISOString().slice(0, 10) : null,
      authorized_by_name: decidedByName,
      authorization_note: input.note,
    },
    items,
    actions: record.actions ?? [],
    closedAt: record.closed_at ? new Date(record.closed_at) : decidedAt,
    authorizedAt: decidedAt,
    validUntil,
    signatories: {
      collaboratorName: record.employee_name,
      evaluatorName: record.evaluator_name,
      areaName: record.area_signatory_name ?? '',
      rhName: record.rh_signatory_name ?? '',
      directorName: record.director_signatory_name ?? '',
    },
    signaturePngs: {
      collaborator: readSignatureFile(row.collaborator_signature_path ?? null),
      evaluator: readSignatureFile(row.evaluator_signature_path ?? null),
      area: readSignatureFile(row.area_signature_path ?? null),
      rh: readSignatureFile(row.rh_signature_path ?? null),
      director: readSignatureFile(row.director_signature_path ?? null),
    },
  });

  const documentId = await archiveGeneratedPdfToExpedient({
    employeeId: record.employee_id,
    documentTypeCode: 'COMPETENCY_EVALUATION',
    referenceKey: `competency_evaluation:${record.id}`,
    title: `REH-REG-003 Evaluación de competencia - ${record.results.dictamen ? DICTAMEN_LABELS[record.results.dictamen] : ''} · ${AUTHORIZATION_LABELS[input.decision]}`,
    description: `Puesto: ${record.position_name}. Resultado final: ${record.results.final_pct}%. ${AUTHORIZATION_LABELS[input.decision]} por ${decidedByName ?? 'RH'} el ${decidedAt.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}.${input.note ? ` Nota: ${input.note}` : ''}`,
    pdf,
    uploadedByUserId: input.decidedByUserId,
    expiryDate: validUntil ? validUntil.toISOString().slice(0, 10) : null,
  });

  await pool.query(
    `UPDATE public.rh_competency_evaluations
        SET authorization_result = $2, authorized_at = $3, valid_until = $4,
            authorized_by_user_id = $5, authorization_note = $6, document_id = $7, updated_at = NOW()
      WHERE id = $1 AND status = 'CLOSED' AND authorization_result = 'PENDIENTE';`,
    [record.id, input.decision, decidedAt, validUntil, input.decidedByUserId, input.note, documentId],
  );

  return (await getEvaluationById(record.id)) as CompetencyEvaluationRecord;
};
