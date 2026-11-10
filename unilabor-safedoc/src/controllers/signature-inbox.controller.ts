import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import { closeFullySignedLetter, renderAssignmentLetterPdf } from '../services/rh-assignment-letter-signature.service';
import { tryIssueCompetencyCertificate } from '../services/rh-competency-certificate.service';
import { closeFullySignedEvaluation, renderCompetencyEvaluationPdf } from '../services/rh-competency-signature.service';
import { DOCUMENT_FORM_CODES, describeDocumentRoles, type SignedDocumentKind } from '../services/rh-document-signature.rules';
import { placeDocumentSignature } from '../services/rh-document-signature.service';
import { renderSupervisionChecklistPdf } from '../services/rh-supervision-checklist-close.service';
import { describeRoles } from '../services/rh-supervision-signature.rules';
import { getSignatureInboxDetail, signFromInbox } from '../services/rh-supervision-signature.service';
import {
  countUnifiedInboxPending,
  getDocumentInboxDetail,
  isInboxKind,
  listUnifiedInbox,
  type InboxKind,
} from '../services/signature-inbox.service';
import { decodeSignaturePng } from '../utils/signature-image';
import type { SignatureInboxBatchSignBody, SignatureInboxSignBody } from '../schemas/rh-supervision-checklist.schema';
import { myEmployeeId } from './my-supervision.controller';
import { audit as auditSupervision, closedAuditMetadata, closedMessage, fail as failSupervision, parseId } from './rh-supervision-checklist.controller';

/**
 * Buzon de firmas: cada firmante coloca su firma desde su propia sesion en el
 * ANA-REG-060 (Fase 6), el REH-REG-003 y el REH-REG-008 (Fase 7). Solo requiere
 * sesion; cada endpoint comprueba que el colaborador de la sesion sea firmante
 * de ESE registro. Nadie firma por otro: el rol no viaja en la peticion, se
 * deduce de la sesion. Montado en /api/my/signature-inbox.
 */

const ERROR_STATUS: Record<string, number> = {
  RH_DOC_SIGNATURE_NOT_FOUND: 404,
  RH_DOC_SIGNATURE_NOT_YOURS: 403,
  RH_DOC_SIGNATURE_CLOSED: 409,
  RH_DOC_SIGNATURE_NOT_IN_SIGNATURE: 409,
  RH_DOC_SIGNATURE_ALREADY_SIGNED: 409,
  RH_DOC_SIGNATURE_INVALID: 400,
  RH_COMP_EVAL_NOT_FOUND: 404,
  RH_COMP_EVAL_NOT_IN_SIGNATURE: 409,
  RH_COMP_EVAL_SIGNATURE_FILE_MISSING: 409,
  RH_COMP_EVAL_INCOMPLETE: 409,
  RH_ASSIGNMENT_LETTER_NOT_FOUND: 404,
  RH_ASSIGNMENT_SIGNATURE_FILE_MISSING: 409,
  ARCHIVE_DOCUMENT_TYPE_NOT_FOUND: 409,
};

const fail = (res: Response, error: any, logLabel: string, fallback: string): Response => {
  const status = ERROR_STATUS[error?.code];
  if (status) return res.status(status).json({ message: error?.publicMessage || fallback });
  return failSupervision(res, error, logLabel, fallback);
};

const coded = (code: string, publicMessage: string) => Object.assign(new Error(code), { code, publicMessage });

/** Mensaje publico de un error ya clasificado (para el resumen de la firma en lote). */
const publicMessageOf = (error: any, fallback: string): string => (error?.publicMessage ? String(error.publicMessage) : fallback);

const ENTITY_TYPES: Record<SignedDocumentKind, string> = {
  COMPETENCY_EVALUATION: 'competency_evaluation',
  ASSIGNMENT_LETTER: 'assignment_letter',
};

const auditDocument = async (req: AuthRequest, kind: SignedDocumentKind, action: string, id: number, employeeId: number | null, metadata?: Record<string, unknown>) => {
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

const parseTarget = (req: AuthRequest): { kind: InboxKind; id: number } | null => {
  const kind = String(req.params.kind ?? '').toUpperCase();
  const id = parseId(req.params.id);
  return isInboxKind(kind) && id ? { kind, id } : null;
};

/** GET /my/signature-inbox */
export const listSignatureInboxController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json(await listUnifiedInbox(await myEmployeeId(req)));
  } catch (error) {
    return fail(res, error, 'Error listando el buzon de firmas', 'No se pudo cargar tu buzon de firmas.');
  }
};

/** GET /my/signature-inbox/count  (badge del menu; sin expediente vinculado no hay nada que firmar) */
export const countSignatureInboxController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ count: await countUnifiedInboxPending(await myEmployeeId(req)) });
  } catch (error: any) {
    if (error?.code === 'RH_SUPERVISION_NO_EMPLOYEE') return res.json({ count: 0 });
    return fail(res, error, 'Error contando el buzon de firmas', 'No se pudo consultar tu buzon de firmas.');
  }
};

/** GET /my/signature-inbox/:kind/:id */
export const getSignatureInboxDetailController = async (req: AuthRequest, res: Response) => {
  const target = parseTarget(req);
  if (!target) return res.status(400).json({ message: 'Registro invalido.' });
  try {
    const employeeId = await myEmployeeId(req);
    if (target.kind === 'SUPERVISION') {
      return res.json({ kind: target.kind, supervision: await getSignatureInboxDetail(target.id, employeeId) });
    }
    return res.json(await getDocumentInboxDetail(target.kind, target.id, employeeId));
  } catch (error) {
    return fail(res, error, 'Error abriendo registro del buzon de firmas', 'No se pudo abrir el registro.');
  }
};

/** GET /my/signature-inbox/:kind/:id/pdf  (en firma con marca de agua; cerrado con sus firmas) */
export const getSignatureInboxPdfController = async (req: AuthRequest, res: Response) => {
  const target = parseTarget(req);
  if (!target) return res.status(400).json({ message: 'Registro invalido.' });
  try {
    const employeeId = await myEmployeeId(req);
    let folio: string;
    let pdf: Buffer;
    if (target.kind === 'SUPERVISION') {
      await getSignatureInboxDetail(target.id, employeeId);
      const rendered = await renderSupervisionChecklistPdf(target.id);
      folio = rendered.record.folio;
      pdf = rendered.pdf;
    } else {
      await getDocumentInboxDetail(target.kind, target.id, employeeId);
      if (target.kind === 'COMPETENCY_EVALUATION') {
        pdf = (await renderCompetencyEvaluationPdf(target.id)).pdf;
        folio = `REH-REG-003-${String(target.id).padStart(5, '0')}`;
      } else {
        const rendered = await renderAssignmentLetterPdf(target.id);
        folio = rendered.letter.folio;
        pdf = rendered.pdf;
      }
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${folio}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, 'Error generando PDF del buzon de firmas', 'No se pudo generar el PDF.');
  }
};

// --- Firma -----------------------------------------------------------------------

export interface InboxSignOutcome {
  kind: InboxKind;
  id: number;
  folio: string;
  employee_name: string;
  closed: boolean;
  /** La firma quedo pero el cierre automatico (o lo que sigue) no se completo: RH debe revisarlo. */
  warning: boolean;
  message: string;
}

const signSupervision = async (req: AuthRequest, id: number, employeeId: number, signature: string, batch: boolean): Promise<InboxSignOutcome> => {
  const result = await signFromInbox({ id, userId: req.user!.id, employeeId, signature });
  const { checklist } = result;
  await auditSupervision(req, `RH_SUPERVISION_SIGNED:${id}`, id, checklist.employee_id, {
    roles: result.signed_roles,
    pending_roles: result.pending_roles,
    enrollment_id: checklist.enrollment_id,
    batch,
  });
  const signedAs = describeRoles(result.signed_roles);
  let message: string;
  let warning = false;
  if (result.closed) {
    const closed = { record: checklist, practical: result.practical };
    // Entre firmas simultaneas solo una peticion sella el cierre: esa es la que lo audita.
    if (result.closed_by_this_request) {
      await auditSupervision(req, `RH_SUPERVISION_CLOSED:${id}`, id, checklist.employee_id, { ...closedAuditMetadata(closed), closed_via: 'last_signature' });
    }
    warning = result.practical !== null && !result.practical.captured;
    message = `Firmaste como ${signedAs}. Con las tres firmas reunidas: ${closedMessage(closed)}`;
  } else if (result.close_error) {
    await auditSupervision(req, `RH_SUPERVISION_AUTO_CLOSE_FAILED:${id}`, id, checklist.employee_id, { reason: result.close_error });
    warning = true;
    message = `Firmaste como ${signedAs}. Ya estan las tres firmas, pero la lista no pudo cerrarse sola: ${result.close_error} Recursos Humanos debe reintentar el cierre.`;
  } else {
    message = `Firmaste como ${signedAs} la lista ${checklist.folio}. Falta la firma de ${describeRoles(result.pending_roles)}.`;
  }
  return { kind: 'SUPERVISION', id, folio: checklist.folio, employee_name: checklist.employee_name, closed: result.closed, warning, message };
};

/** Cierre automatico tras la ultima firma; nunca lanza (la firma ya es firme). */
const tryCloseDocument = async (
  req: AuthRequest,
  kind: SignedDocumentKind,
  id: number,
): Promise<{ closed: boolean; folio: string | null; employeeId: number | null; note: string; error: string | null }> => {
  const userId = req.user!.id;
  try {
    if (kind === 'COMPETENCY_EVALUATION') {
      const evaluation = await closeFullySignedEvaluation(id, userId);
      if (!evaluation) return { closed: false, folio: null, employeeId: null, note: '', error: null };
      await auditDocument(req, kind, `RH_COMP_EVAL_CLOSE:${id}:${evaluation.results.dictamen}`, id, evaluation.employee_id, { closed_via: 'last_signature' });
      // Constancia: best-effort (en la practica nace al autorizar).
      const certificateId = await tryIssueCompetencyCertificate(id, userId);
      if (certificateId) await auditDocument(req, kind, `RH_COMP_EVAL_CERTIFICATE_ISSUED:${id}:${certificateId}`, id, evaluation.employee_id);
      const note =
        evaluation.results.authorization_result === 'PENDIENTE'
          ? 'La evaluacion quedo cerrada y archivada en el expediente; falta que RH o Direccion General la autorice.'
          : 'La evaluacion quedo cerrada y archivada en el expediente.';
      return { closed: true, folio: null, employeeId: evaluation.employee_id, note, error: null };
    }
    const letter = await closeFullySignedLetter(id, userId);
    if (!letter) return { closed: false, folio: null, employeeId: null, note: '', error: null };
    await auditDocument(req, kind, `RH_ASSIGNMENT_LETTER_CLOSED:${id}`, id, letter.employee_id, { closed_via: 'last_signature' });
    return { closed: true, folio: letter.folio, employeeId: letter.employee_id, note: `Carta ${letter.folio} cerrada y archivada en el expediente.`, error: null };
  } catch (error: any) {
    console.error(`${DOCUMENT_FORM_CODES[kind]} ${id}: las firmas estan completas pero el cierre automatico fallo:`, error);
    const reason = error?.publicMessage || 'No se pudo cerrar el registro automaticamente.';
    await auditDocument(req, kind, `RH_DOC_AUTO_CLOSE_FAILED:${kind}:${id}`, id, null, { reason });
    return { closed: false, folio: null, employeeId: null, note: '', error: reason };
  }
};

const signDocument = async (req: AuthRequest, kind: SignedDocumentKind, id: number, employeeId: number, png: Buffer, batch: boolean): Promise<InboxSignOutcome> => {
  const detail = await getDocumentInboxDetail(kind, id, employeeId);
  const record = detail.evaluation ?? detail.letter!;
  const folio = detail.letter?.folio ?? `${DOCUMENT_FORM_CODES[kind]}-${String(id).padStart(5, '0')}`;
  const placed = await placeDocumentSignature({ kind, id, employeeId, userId: req.user!.id, png });
  await auditDocument(req, kind, `RH_DOC_SIGNED:${kind}:${id}`, id, record.employee_id, {
    roles: placed.signed_roles,
    pending_roles: placed.pending_roles,
    batch,
  });
  const signedAs = describeDocumentRoles(placed.signed_roles);
  if (placed.pending_roles.length > 0) {
    return {
      kind,
      id,
      folio,
      employee_name: record.employee_name,
      closed: false,
      warning: false,
      message: `Firmaste como ${signedAs} el ${folio}. Falta la firma de ${describeDocumentRoles(placed.pending_roles)}.`,
    };
  }
  const closing = await tryCloseDocument(req, kind, id);
  return {
    kind,
    id,
    folio,
    employee_name: record.employee_name,
    closed: closing.closed,
    warning: Boolean(closing.error),
    message: closing.error
      ? `Firmaste como ${signedAs}. Ya estan todas las firmas, pero el ${DOCUMENT_FORM_CODES[kind]} no pudo cerrarse solo: ${closing.error} Recursos Humanos debe revisarlo.`
      : `Firmaste como ${signedAs}. Con todas las firmas reunidas: ${closing.note || 'el registro quedo cerrado.'}`,
  };
};

const signOne = async (req: AuthRequest, kind: InboxKind, id: number, employeeId: number, signature: string, png: Buffer, batch: boolean) =>
  kind === 'SUPERVISION' ? signSupervision(req, id, employeeId, signature, batch) : signDocument(req, kind, id, employeeId, png, batch);

/** POST /my/signature-inbox/:kind/:id/sign {signature} */
export const signFromInboxController = async (req: AuthRequest, res: Response) => {
  const target = parseTarget(req);
  if (!target) return res.status(400).json({ message: 'Registro invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const { signature } = req.body as SignatureInboxSignBody;
  try {
    const png = decodeSignaturePng(signature);
    if (!png) throw coded('RH_DOC_SIGNATURE_INVALID', 'Traza tu firma para firmar.');
    const outcome = await signOne(req, target.kind, target.id, await myEmployeeId(req), signature, png, false);
    return res.status(201).json(outcome);
  } catch (error) {
    return fail(res, error, 'Error firmando desde el buzon de firmas', 'No se pudo registrar tu firma.');
  }
};

/**
 * POST /my/signature-inbox/batch-sign {items: [{kind, id}], signature}
 *
 * Firma en lote: el mismo trazo se aplica a cada registro elegido, uno por uno y
 * cada uno en su propia transaccion (si uno falla, los demas quedan firmados). Cada
 * firma se audita por separado con batch = true. Devuelve el resultado de cada uno.
 */
export const batchSignFromInboxController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const body = req.body as SignatureInboxBatchSignBody;
  try {
    const png = decodeSignaturePng(body.signature);
    if (!png) throw coded('RH_DOC_SIGNATURE_INVALID', 'Traza tu firma para firmar.');
    const employeeId = await myEmployeeId(req);
    const seen = new Set<string>();
    const results: Array<InboxSignOutcome & { ok: boolean }> = [];
    for (const item of body.items) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        results.push({ ...(await signOne(req, item.kind, item.id, employeeId, body.signature, png, true)), ok: true });
      } catch (error: any) {
        if (!error?.publicMessage) console.error(`Firma en lote ${key}:`, error);
        results.push({
          kind: item.kind,
          id: item.id,
          folio: `${DOCUMENT_FORM_CODES[item.kind as SignedDocumentKind] ?? 'ANA-REG-060'} #${item.id}`,
          employee_name: '',
          closed: false,
          warning: true,
          ok: false,
          message: publicMessageOf(error, 'No se pudo registrar la firma.'),
        });
      }
    }
    const signed = results.filter((result) => result.ok).length;
    const closed = results.filter((result) => result.closed).length;
    const failed = results.length - signed;
    const message =
      `Firmaste ${signed} de ${results.length} registro(s)` +
      (closed > 0 ? `; ${closed} quedaron cerrados con todas sus firmas` : '') +
      (failed > 0 ? `. ${failed} no se pudieron firmar: revisa el detalle.` : '.');
    return res.status(201).json({ results, signed, closed, failed, message });
  } catch (error) {
    return fail(res, error, 'Error en la firma en lote del buzon', 'No se pudo registrar la firma en lote.');
  }
};
