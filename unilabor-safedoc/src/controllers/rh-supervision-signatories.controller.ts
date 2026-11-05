import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  getSignatoriesOverview,
  previewUnitSignatoryImpact,
  saveAreaSignatories,
  saveUnitSignatories,
  type SignatoryChange,
} from '../services/rh-supervision-signatories.service';
import {
  unitSignatoryImpactQuerySchema,
  type SaveAreaSignatoriesBody,
  type SaveUnitSignatoriesBody,
} from '../schemas/rh-supervision-signatories.schema';
import { fail } from './rh-supervision-checklist.controller';

/**
 * Endpoints de la configuracion "Firmantes por area" del ANA-REG-060
 * (responsable general, suplente y responsables por unidad). Montados en
 * /api/rh/supervision-checklists/signatories, guard RH.SUPERVISION.MANAGE.
 */

/** Un evento por cambio: quien, que responsable, antes y despues, unidad, area y borradores afectados. */
const auditChanges = async (req: AuthRequest, changes: SignatoryChange[]): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) return;
  for (const change of changes) {
    await registerAuditEvent({
      user_id: userId,
      action: change.scope === 'UNIT' ? 'RH_SUPERVISION_UNIT_SIGNATORY_CHANGED' : 'RH_SUPERVISION_AREA_SIGNATORY_CHANGED',
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'supervision_area_signatory',
      entity_id: null,
      employee_id: null,
      metadata: { ...change },
    }).catch((error) => console.error('Auditoria firmantes por area ANA-REG-060:', error));
  }
};

const draftsUpdated = (changes: SignatoryChange[]): number => changes.reduce((total, change) => total + change.drafts_updated, 0);

const savedMessage = (changes: SignatoryChange[], saved: string): string => {
  if (changes.length === 0) return 'Sin cambios que guardar.';
  const drafts = draftsUpdated(changes);
  return `${saved} ${drafts > 0 ? `${drafts} borrador(es) actualizaron sus firmantes.` : 'Ningun borrador cambio de responsable.'}`;
};

/** GET /rh/supervision-checklists/signatories */
export const getSignatoriesOverviewController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json(await getSignatoriesOverview());
  } catch (error) {
    return fail(res, error, 'Error listando firmantes por area', 'No se pudieron cargar los firmantes por area.');
  }
};

/** PUT /rh/supervision-checklists/signatories {rows: [{area_key, area_responsible_employee_id, alternate_employee_id?}]} */
export const saveAreaSignatoriesController = async (req: AuthRequest, res: Response) => {
  const body = req.body as SaveAreaSignatoriesBody;
  try {
    const changes = await saveAreaSignatories(body.rows, req.user?.id ?? null);
    await auditChanges(req, changes);
    return res.json({
      message: savedMessage(changes, 'Responsables generales guardados.'),
      drafts_updated: draftsUpdated(changes),
      ...(await getSignatoriesOverview()),
    });
  } catch (error) {
    return fail(res, error, 'Error guardando firmantes por area', 'No se pudieron guardar los firmantes.');
  }
};

/** PUT /rh/supervision-checklists/signatories/units {rows: [{unit_id, area_key, area_responsible_employee_id}]} */
export const saveUnitSignatoriesController = async (req: AuthRequest, res: Response) => {
  const body = req.body as SaveUnitSignatoriesBody;
  try {
    const changes = await saveUnitSignatories(body.rows, req.user?.id ?? null);
    await auditChanges(req, changes);
    return res.json({
      message: savedMessage(changes, changes.length === 1 ? 'Responsable de la unidad guardado.' : `Responsable guardado en ${changes.length} unidades.`),
      drafts_updated: draftsUpdated(changes),
      ...(await getSignatoriesOverview()),
    });
  } catch (error) {
    return fail(res, error, 'Error guardando responsables por unidad', 'No se pudieron guardar los responsables por unidad.');
  }
};

/** GET /rh/supervision-checklists/signatories/impact?area_key=&unit_ids=1,2&employee_id= */
export const getUnitSignatoryImpactController = async (req: AuthRequest, res: Response) => {
  const parsed = unitSignatoryImpactQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Filtros invalidos',
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
  }
  try {
    const impact = await previewUnitSignatoryImpact({
      areaKey: parsed.data.area_key,
      unitIds: parsed.data.unit_ids,
      employeeId: parsed.data.employee_id ?? null,
    });
    return res.json({ impact });
  } catch (error) {
    return fail(res, error, 'Error calculando el impacto del cambio de responsable', 'No se pudo calcular el impacto del cambio.');
  }
};
