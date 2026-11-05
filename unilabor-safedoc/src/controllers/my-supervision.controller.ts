import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { renderSupervisionChecklistPdf } from '../services/rh-supervision-checklist-close.service';
import { getSupervisionChecklist, listSupervisionChecklists, saveSupervisionResults } from '../services/rh-supervision-checklist.service';
import { sendChecklistToSignature } from '../services/rh-supervision-signature.service';
import { resolveEmployeeIdForUser } from '../services/rh-supervision-signers.service';
import type { MySupervisionSendBody, SaveSupervisionResultsBody } from '../schemas/rh-supervision-checklist.schema';
import { audit, fail, parseId } from './rh-supervision-checklist.controller';

/**
 * "Mis supervisiones" (ANA-REG-060, Fase 6): el supervisor asignado CALIFICA
 * sus listas y las envia a firma. Aqui no se firma: la firma de los tres roles
 * (incluida la del propio supervisor) ocurre en el Buzon de firmas. Solo
 * requiere sesion: el acceso se decide por ser el supervisor de la lista.
 * Montado en /api/my/supervisions.
 */

const codedError = (code: string, publicMessage: string) => Object.assign(new Error(code), { code, publicMessage });

export const myEmployeeId = async (req: AuthRequest): Promise<number> => {
  const employeeId = req.user?.id ? await resolveEmployeeIdForUser(req.user.id) : null;
  if (!employeeId) throw codedError('RH_SUPERVISION_NO_EMPLOYEE', 'Tu usuario no esta vinculado a un expediente de colaborador.');
  return employeeId;
};

/** Carga la lista y exige que el usuario sea su supervisor asignado. */
const loadMine = async (req: AuthRequest, id: number) => {
  const employeeId = await myEmployeeId(req);
  const record = await getSupervisionChecklist(id);
  if (record.supervisor_employee_id !== employeeId) {
    throw codedError('RH_SUPERVISION_NOT_YOURS', 'Esta lista no esta asignada a ti.');
  }
  return record;
};

/** GET /my/supervisions */
export const listMySupervisionsController = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = await myEmployeeId(req);
    const [toSupervise, inSignature] = await Promise.all([
      listSupervisionChecklists({ status: 'DRAFT', supervisorEmployeeId: employeeId, page: 1, limit: 100 }),
      listSupervisionChecklists({ status: 'PENDING_SIGNATURES', supervisorEmployeeId: employeeId, page: 1, limit: 100 }),
    ]);
    return res.json({ to_supervise: toSupervise.rows, in_signature: inSignature.rows });
  } catch (error) {
    return fail(res, error, 'Error listando mis supervisiones', 'No se pudieron cargar tus supervisiones.');
  }
};

/** GET /my/supervisions/:id */
export const getMySupervisionController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    return res.json({ checklist: await loadMine(req, id) });
  } catch (error) {
    return fail(res, error, 'Error abriendo mi supervision', 'No se pudo abrir la lista.');
  }
};

/** GET /my/supervisions/:id/pdf */
export const getMySupervisionPdfController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    await loadMine(req, id);
    const { record, pdf } = await renderSupervisionChecklistPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${record.folio}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, 'Error generando PDF de mi supervision', 'No se pudo generar el PDF.');
  }
};

/** PUT /my/supervisions/:id/results  (solo en borrador) */
export const saveMySupervisionResultsController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    await loadMine(req, id);
    const checklist = await saveSupervisionResults(
      id,
      (req.body as SaveSupervisionResultsBody).results.map((entry) => ({ item_id: entry.item_id, result: entry.result, observations: entry.observations ?? null })),
    );
    return res.json({ checklist });
  } catch (error) {
    return fail(res, error, 'Error guardando mi supervision', 'No se pudieron guardar las calificaciones.');
  }
};

/**
 * POST /my/supervisions/:id/send-to-signature
 * El supervisor termino de calificar y envia su lista a firma (equivale al
 * "Cerrar y firmar" de RH). Si la lista es de la Fase 6 se envia como la lista
 * final del puesto; una supervision intermedia la envia RH desmarcando esa opcion.
 */
export const sendMySupervisionToSignatureController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const body = req.body as MySupervisionSendBody;
  try {
    await loadMine(req, id);
    const checklist = await sendChecklistToSignature({
      id,
      header: {
        sgcFollowUpRequired: body.sgc_follow_up_required,
        sgcReference: body.sgc_reference,
        supervisorComments: body.supervisor_comments,
      },
      userId: req.user!.id,
    });
    await audit(req, `RH_SUPERVISION_SENT_TO_SIGNATURE:${id}`, id, checklist.employee_id, {
      is_final: checklist.is_final,
      enrollment_id: checklist.enrollment_id,
      compliance_pct: checklist.summary.compliance_pct,
      signers: checklist.signers.map((signer) => ({ role: signer.role, employee_id: signer.employee_id })),
      sent_by: 'supervisor',
    });
    return res.json({ checklist, message: `Lista ${checklist.folio} enviada a firma. Tu firma como supervisor te espera en el Buzon de firmas.` });
  } catch (error) {
    return fail(res, error, 'Error enviando mi supervision a firma', 'No se pudo enviar la lista a firma.');
  }
};
