import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  deleteAssignmentLetterDraft,
  generatePendingLetters,
  getAssignmentLetter,
  getPositionAuthorizations,
  listAssignmentLetters,
  listAuthorizationItems,
  setPositionAuthorizations,
  updateAssignmentLetter,
} from '../services/rh-assignment-letter.service';
import {
  assignmentLetterListQuerySchema,
  type SetPositionAuthorizationsBody,
  type UpdateAssignmentLetterBody,
} from '../schemas/rh-assignment-letter.schema';

/** Carta de asignacion de puesto REH-REG-008. Montado en /api/rh/assignment-letters. */

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_ASSIGNMENT_LETTER_NOT_FOUND: 404,
  RH_ASSIGNMENT_POSITION_NOT_FOUND: 404,
  RH_ASSIGNMENT_EVALUATION_NOT_FOUND: 404,
  RH_ASSIGNMENT_EVALUATION_NOT_AUTHORIZED: 409,
  RH_ASSIGNMENT_LETTER_CLOSED: 409,
  RH_ASSIGNMENT_SIGNERS_REQUIRED: 409,
  RH_ASSIGNMENT_SELF_SIGNATURE: 409,
  RH_ASSIGNMENT_LETTER_IN_SIGNATURE: 409,
  RH_ASSIGNMENT_SIGNER_NOT_FOUND: 404,
  RH_DOC_SIGNATURE_HAS_SIGNATURES: 409,
  ARCHIVE_DOCUMENT_TYPE_NOT_FOUND: 409,
};

const fail = (res: Response, error: any, logLabel: string, fallback: string): Response => {
  const status = ERROR_STATUS[error?.code];
  if (status) return res.status(status).json({ message: error?.publicMessage || fallback });
  console.error(`${logLabel}:`, error);
  return res.status(500).json({ message: fallback });
};

const audit = async (req: AuthRequest, action: string, letterId: number, employeeId: number | null) => {
  if (!req.user?.id) return;
  await registerAuditEvent({
    user_id: req.user.id,
    action,
    ip_address: req.ip ?? null,
    module_code: 'RH',
    entity_type: 'assignment_letter',
    entity_id: letterId,
    employee_id: employeeId,
    metadata: null,
  }).catch((error) => console.error('Auditoria REH-REG-008:', error));
};

export const listAuthorizationItemsController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ items: await listAuthorizationItems() });
  } catch (error) {
    return fail(res, error, 'Error listando autorizaciones REH-REG-008', 'No se pudo cargar el catalogo de autorizaciones.');
  }
};

export const getPositionAuthorizationsController = async (req: AuthRequest, res: Response) => {
  const positionId = parseId(req.params.positionId);
  if (!positionId) return res.status(400).json({ message: 'ID de puesto invalido.' });
  try {
    return res.json({ item_ids: await getPositionAuthorizations(positionId) });
  } catch (error) {
    return fail(res, error, 'Error cargando autorizaciones del puesto', 'No se pudieron cargar las autorizaciones del puesto.');
  }
};

export const setPositionAuthorizationsController = async (req: AuthRequest, res: Response) => {
  const positionId = parseId(req.params.positionId);
  if (!positionId) return res.status(400).json({ message: 'ID de puesto invalido.' });
  try {
    const itemIds = await setPositionAuthorizations(positionId, (req.body as SetPositionAuthorizationsBody).item_ids, req.user?.id ?? null);
    return res.json({ message: 'Autorizaciones del puesto guardadas.', item_ids: itemIds });
  } catch (error) {
    return fail(res, error, 'Error guardando autorizaciones del puesto', 'No se pudieron guardar las autorizaciones del puesto.');
  }
};

export const listAssignmentLettersController = async (req: AuthRequest, res: Response) => {
  const parsed = assignmentLetterListQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Filtros invalidos' });
  try {
    return res.json({ rows: await listAssignmentLetters({ status: parsed.data.status, search: parsed.data.q }) });
  } catch (error) {
    return fail(res, error, 'Error listando cartas de asignacion', 'No se pudieron cargar las cartas de asignacion.');
  }
};

export const generatePendingLettersController = async (req: AuthRequest, res: Response) => {
  try {
    const created = await generatePendingLetters(req.user?.id ?? null);
    return res.json({ created, message: created > 0 ? `${created} carta(s) de asignacion abiertas.` : 'No hay cartas pendientes por abrir.' });
  } catch (error) {
    return fail(res, error, 'Error generando cartas de asignacion', 'No se pudieron generar las cartas.');
  }
};

export const getAssignmentLetterController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    return res.json({ letter: await getAssignmentLetter(id) });
  } catch (error) {
    return fail(res, error, 'Error abriendo carta de asignacion', 'No se pudo abrir la carta.');
  }
};

export const updateAssignmentLetterController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const body = req.body as UpdateAssignmentLetterBody;
  try {
    const letter = await updateAssignmentLetter(id, {
      letterDate: body.letter_date,
      otherAuthorizations: body.other_authorizations,
      areaSignatoryEmployeeId: body.area_signatory_employee_id,
      directorSignatoryEmployeeId: body.director_signatory_employee_id,
      items: body.items,
    });
    return res.json({ message: 'Carta guardada.', letter });
  } catch (error) {
    return fail(res, error, 'Error guardando carta de asignacion', 'No se pudo guardar la carta.');
  }
};

export const deleteAssignmentLetterController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    await deleteAssignmentLetterDraft(id);
    await audit(req, `RH_ASSIGNMENT_LETTER_DRAFT_DELETED:${id}`, id, null);
    return res.json({ message: 'Borrador eliminado.' });
  } catch (error) {
    return fail(res, error, 'Error eliminando borrador de carta', 'No se pudo eliminar el borrador.');
  }
};
