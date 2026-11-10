import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import { renderAssignmentLetterPdf, sendLetterToSignature } from '../services/rh-assignment-letter-signature.service';
import { getAssignmentLetter } from '../services/rh-assignment-letter.service';
import { getEvaluationById } from '../services/rh-competency-evaluation.service';
import { renderCompetencyEvaluationPdf, sendEvaluationToSignature } from '../services/rh-competency-signature.service';
import { DOCUMENT_FORM_CODES, describeDocumentRoles, type SignedDocumentKind } from '../services/rh-document-signature.rules';
import { cancelDocumentSignature, loadDocumentSigners } from '../services/rh-document-signature.service';
import type { SendCompetencyToSignatureBody } from '../schemas/rh-competency-evaluation.schema';

/**
 * RH envia al Buzon de firmas los registros de la Fase 7 (REH-REG-003 y
 * REH-REG-008), cancela el envio para corregirlos y consulta quien ha firmado.
 * La firma en si la coloca cada firmante en /api/my/signature-inbox.
 */

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_COMP_EVAL_NOT_FOUND: 404,
  RH_COMP_EVAL_ALREADY_CLOSED: 409,
  RH_COMP_EVAL_IN_SIGNATURE: 409,
  RH_COMP_EVAL_NOT_IN_SIGNATURE: 409,
  RH_COMP_EVAL_EVALUATOR_REQUIRED: 409,
  RH_COMP_EVAL_EVALUATOR_NOT_EMPLOYEE: 409,
  RH_COMP_EVAL_EVALUATOR_NOT_FOUND: 409,
  RH_COMP_EVAL_EVALUATOR_IS_PHASE6_SUPERVISOR: 409,
  RH_COMP_EVAL_KNOWLEDGE_PENDING: 409,
  RH_COMP_EVAL_INCOMPLETE: 409,
  RH_COMP_EVAL_UNSCORED_ITEMS: 409,
  RH_COMP_EVAL_ACTIONS_REQUIRED: 409,
  RH_COMP_EVAL_SIGNERS_NOT_READY: 409,
  RH_COMP_EVAL_SIGNATURE_FILE_MISSING: 409,
  RH_ASSIGNMENT_LETTER_NOT_FOUND: 404,
  RH_ASSIGNMENT_LETTER_CLOSED: 409,
  RH_ASSIGNMENT_LETTER_IN_SIGNATURE: 409,
  RH_ASSIGNMENT_SIGNERS_NOT_READY: 409,
  RH_DOC_SIGNATURE_NOT_FOUND: 404,
  RH_DOC_SIGNATURE_CLOSED: 409,
  RH_DOC_SIGNATURE_NOT_IN_SIGNATURE: 409,
};

const fail = (res: Response, error: any, logLabel: string, fallback: string): Response => {
  // El codigo de la regla del evaluador lo define rh-competency-evaluator.rules (cualquier RH_COMP_EVAL_* con mensaje publico es de negocio).
  const status = ERROR_STATUS[error?.code] ?? (String(error?.code ?? '').startsWith('RH_COMP_EVAL_') && error?.publicMessage ? 409 : undefined);
  if (status) return res.status(status).json({ message: error?.publicMessage || fallback });
  console.error(`${logLabel}:`, error);
  return res.status(500).json({ message: fallback });
};

const ENTITY_TYPES: Record<SignedDocumentKind, string> = {
  COMPETENCY_EVALUATION: 'competency_evaluation',
  ASSIGNMENT_LETTER: 'assignment_letter',
};

const audit = async (req: AuthRequest, kind: SignedDocumentKind, action: string, id: number, employeeId: number, metadata?: Record<string, unknown>) => {
  if (!req.user?.id) return;
  await registerAuditEvent({
    user_id: req.user.id,
    action,
    ip_address: req.ip ?? null,
    module_code: 'RH',
    entity_type: ENTITY_TYPES[kind],
    entity_id: id,
    employee_id: employeeId,
    metadata: metadata ?? null,
  }).catch((error) => console.error(`Auditoria ${DOCUMENT_FORM_CODES[kind]}:`, error));
};

const cancelledMessage = (form: string, invalidated: Array<{ role: Parameters<typeof describeDocumentRoles>[0][number] }>): string =>
  invalidated.length > 0
    ? `Envio cancelado: el ${form} volvio a borrador. Se invalidaron las firmas de ${describeDocumentRoles(invalidated.map((item) => item.role))}; al reenviarlo vuelven a firmar.`
    : `Envio cancelado: el ${form} volvio a borrador.`;

// --- REH-REG-003 ---------------------------------------------------------------------

/** POST /rh/competency-evaluations/:id/send-to-signature {area_employee_id, rh_employee_id, director_employee_id} */
export const sendCompetencyToSignatureController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida.' });
  const body = req.body as SendCompetencyToSignatureBody;
  try {
    const evaluation = await sendEvaluationToSignature({
      evaluationId: id,
      areaEmployeeId: body.area_employee_id,
      rhEmployeeId: body.rh_employee_id,
      directorEmployeeId: body.director_employee_id,
      userId: req.user.id,
    });
    await audit(req, 'COMPETENCY_EVALUATION', `RH_COMP_EVAL_SENT_TO_SIGNATURE:${id}`, id, evaluation.employee_id, {
      area_employee_id: body.area_employee_id,
      rh_employee_id: body.rh_employee_id,
      director_employee_id: body.director_employee_id,
    });
    return res.json({ message: 'Evaluacion enviada a firma: cada firmante la vera en su Buzon de firmas.', evaluation });
  } catch (error) {
    return fail(res, error, 'Error enviando REH-REG-003 a firma', 'No se pudo enviar la evaluacion a firma.');
  }
};

/** DELETE /rh/competency-evaluations/:id/signature-request */
export const cancelCompetencySignatureController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida.' });
  try {
    const invalidated = await cancelDocumentSignature('COMPETENCY_EVALUATION', id, req.user.id);
    const evaluation = await getEvaluationById(id);
    await audit(req, 'COMPETENCY_EVALUATION', `RH_COMP_EVAL_SIGNATURE_CANCELLED:${id}`, id, evaluation?.employee_id ?? 0, { invalidated });
    return res.json({ message: cancelledMessage('REH-REG-003', invalidated), evaluation, invalidated });
  } catch (error) {
    return fail(res, error, 'Error cancelando envio a firma de REH-REG-003', 'No se pudo cancelar el envio a firma.');
  }
};

/** GET /rh/competency-evaluations/:id/signers */
export const getCompetencySignersController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  try {
    return res.json({ signers: await loadDocumentSigners('COMPETENCY_EVALUATION', id) });
  } catch (error) {
    return fail(res, error, 'Error cargando firmantes de REH-REG-003', 'No se pudieron cargar los firmantes.');
  }
};

/** GET /rh/competency-evaluations/:id/pdf  (en firma: vista previa con las firmas recabadas) */
export const getCompetencyPdfController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  try {
    const { pdf } = await renderCompetencyEvaluationPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="REH-REG-003-${String(id).padStart(5, '0')}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, 'Error generando PDF de REH-REG-003', 'No se pudo generar el PDF.');
  }
};

// --- REH-REG-008 ---------------------------------------------------------------------

/** POST /rh/assignment-letters/:id/send-to-signature */
export const sendLetterToSignatureController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida.' });
  try {
    const letter = await sendLetterToSignature(id, req.user.id);
    await audit(req, 'ASSIGNMENT_LETTER', `RH_ASSIGNMENT_LETTER_SENT_TO_SIGNATURE:${id}`, id, letter.employee_id);
    return res.json({ message: `Carta ${letter.folio} enviada a firma: cada firmante la vera en su Buzon de firmas.`, letter });
  } catch (error) {
    return fail(res, error, 'Error enviando REH-REG-008 a firma', 'No se pudo enviar la carta a firma.');
  }
};

/** DELETE /rh/assignment-letters/:id/signature-request */
export const cancelLetterSignatureController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida.' });
  try {
    const invalidated = await cancelDocumentSignature('ASSIGNMENT_LETTER', id, req.user.id);
    const letter = await getAssignmentLetter(id);
    await audit(req, 'ASSIGNMENT_LETTER', `RH_ASSIGNMENT_LETTER_SIGNATURE_CANCELLED:${id}`, id, letter.employee_id, { invalidated });
    return res.json({ message: cancelledMessage('REH-REG-008', invalidated), letter, invalidated });
  } catch (error) {
    return fail(res, error, 'Error cancelando envio a firma de REH-REG-008', 'No se pudo cancelar el envio a firma.');
  }
};

/** GET /rh/assignment-letters/:id/signers */
export const getLetterSignersController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    return res.json({ signers: await loadDocumentSigners('ASSIGNMENT_LETTER', id) });
  } catch (error) {
    return fail(res, error, 'Error cargando firmantes de REH-REG-008', 'No se pudieron cargar los firmantes.');
  }
};

/** GET /rh/assignment-letters/:id/pdf  (firmada, en firma o borrador con marca de agua) */
export const getLetterPdfController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    const { letter, pdf } = await renderAssignmentLetterPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${letter.folio}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, 'Error generando PDF REH-REG-008', 'No se pudo generar el PDF.');
  }
};
