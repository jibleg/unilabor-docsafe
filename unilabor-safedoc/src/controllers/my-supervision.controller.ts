import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { closeSupervisionChecklist, renderSupervisionChecklistPdf, signSupervisionAsSupervisor } from '../services/rh-supervision-checklist-close.service';
import {
  getSupervisionChecklist,
  listSupervisionChecklists,
  saveSupervisionResults,
  type SupervisionChecklistRecord,
} from '../services/rh-supervision-checklist.service';
import { resolveEmployeeIdForUser } from '../services/rh-supervision-signers.service';
import type { MySupervisionEndorseBody, MySupervisionSignBody, SaveSupervisionResultsBody } from '../schemas/rh-supervision-checklist.schema';
import { audit, fail, parseId } from './rh-supervision-checklist.controller';

/**
 * "Mis supervisiones" (ANA-REG-060, Fase 6): cada quien firma con su propia
 * cuenta. El supervisor asignado califica y firma sus listas; el responsable
 * del area avala las ya firmadas. Solo requiere sesion: el acceso se decide
 * por ser el supervisor o el responsable de la lista. Montado en /api/my/supervisions.
 */

type Role = 'supervisor' | 'responsible';

const codedError = (code: string, publicMessage: string) => Object.assign(new Error(code), { code, publicMessage });

const myEmployeeId = async (req: AuthRequest): Promise<number> => {
  const employeeId = req.user?.id ? await resolveEmployeeIdForUser(req.user.id) : null;
  if (!employeeId) throw codedError('RH_SUPERVISION_NO_EMPLOYEE', 'Tu usuario no esta vinculado a un expediente de colaborador.');
  return employeeId;
};

const rolesFor = (record: SupervisionChecklistRecord, employeeId: number): Role[] => {
  const roles: Role[] = [];
  if (record.supervisor_employee_id === employeeId) roles.push('supervisor');
  if (record.area_responsible_employee_id === employeeId) roles.push('responsible');
  return roles;
};

/** Carga la lista y exige que el usuario tenga el rol pedido (o cualquiera si no se indica). */
const loadMine = async (req: AuthRequest, id: number, role?: Role) => {
  const employeeId = await myEmployeeId(req);
  const record = await getSupervisionChecklist(id);
  const roles = rolesFor(record, employeeId);
  if (roles.length === 0 || (role && !roles.includes(role))) {
    throw codedError('RH_SUPERVISION_NOT_YOURS', 'Esta lista no esta asignada a ti.');
  }
  return { record, roles };
};

/** GET /my/supervisions */
export const listMySupervisionsController = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = await myEmployeeId(req);
    const [toSupervise, toEndorse, waiting] = await Promise.all([
      listSupervisionChecklists({ status: 'DRAFT', supervisorEmployeeId: employeeId, page: 1, limit: 100 }),
      listSupervisionChecklists({ status: 'SUPERVISOR_SIGNED', page: 1, limit: 100 }),
      listSupervisionChecklists({ status: 'SUPERVISOR_SIGNED', supervisorEmployeeId: employeeId, page: 1, limit: 100 }),
    ]);
    return res.json({
      to_supervise: toSupervise.rows,
      to_endorse: toEndorse.rows.filter((row) => row.area_responsible_employee_id === employeeId),
      waiting_endorsement: waiting.rows,
    });
  } catch (error) {
    return fail(res, error, 'Error listando mis supervisiones', 'No se pudieron cargar tus supervisiones.');
  }
};

/** GET /my/supervisions/:id */
export const getMySupervisionController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    const { record, roles } = await loadMine(req, id);
    return res.json({ checklist: record, roles });
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

/** PUT /my/supervisions/:id/results  (solo el supervisor, en borrador) */
export const saveMySupervisionResultsController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    await loadMine(req, id, 'supervisor');
    const checklist = await saveSupervisionResults(
      id,
      (req.body as SaveSupervisionResultsBody).results.map((entry) => ({ item_id: entry.item_id, result: entry.result, observations: entry.observations ?? null })),
    );
    return res.json({ checklist });
  } catch (error) {
    return fail(res, error, 'Error guardando mi supervision', 'No se pudieron guardar las calificaciones.');
  }
};

/** POST /my/supervisions/:id/sign  (paso 1: el supervisor firma) */
export const signMySupervisionController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const body = req.body as MySupervisionSignBody;
  try {
    await loadMine(req, id, 'supervisor');
    const checklist = await signSupervisionAsSupervisor({
      id,
      signature: body.signature,
      header: {
        sgcFollowUpRequired: body.sgc_follow_up_required,
        sgcReference: body.sgc_reference,
        supervisorComments: body.supervisor_comments,
      },
      userId: req.user!.id,
    });
    await audit(req, `RH_SUPERVISION_SUPERVISOR_SIGNED:${id}`, id, checklist.employee_id, { compliance_pct: checklist.summary.compliance_pct });
    return res.json({ checklist, message: `Firmaste la lista ${checklist.folio}; queda en espera del aval de ${checklist.area_responsible_name || 'el responsable del area'}.` });
  } catch (error) {
    return fail(res, error, 'Error firmando como supervisor', 'No se pudo firmar la lista.');
  }
};

/** POST /my/supervisions/:id/endorse  (paso 2: el responsable del area avala y cierra) */
export const endorseMySupervisionController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const body = req.body as MySupervisionEndorseBody;
  try {
    const { record } = await loadMine(req, id, 'responsible');
    if (record.status !== 'SUPERVISOR_SIGNED') {
      return res.status(409).json({ message: 'La lista aun no tiene la firma del supervisor.' });
    }
    const result = await closeSupervisionChecklist({ id, areaResponsibleSignature: body.signature, closedByUserId: req.user!.id, endorsedByOwnAccount: true });
    await audit(req, `RH_SUPERVISION_CLOSED:${id}`, id, result.record.employee_id, {
      compliance_pct: result.record.compliance_pct,
      conclusion: result.record.conclusion,
      is_final: result.record.is_final,
      enrollment_id: result.record.enrollment_id,
      practical: result.practical,
      endorsed_by: 'area_responsible',
    });
    const message = result.practical
      ? `Lista ${result.record.folio} avalada y archivada. ${result.practical.message}`
      : `Lista ${result.record.folio} avalada y archivada en el expediente.`;
    return res.status(201).json({ message, checklist: result.record, practical: result.practical });
  } catch (error) {
    return fail(res, error, 'Error avalando supervision', 'No se pudo avalar la lista.');
  }
};
