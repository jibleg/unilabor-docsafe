import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import { filterAuthorizedPersonnelListing, getAuthorizedPersonnelListing } from '../services/rh-authorized-personnel.service';
import { AUTHORIZED_PERSONNEL_FORM, buildAuthorizedPersonnelPdf } from '../services/rh-authorized-personnel.pdf';
import { setEvaluationAuthorizationLevel } from '../services/rh-competency-authorization.service';
import {
  createAuthorizationLevel,
  createOrganizationalLevel,
  listAuthorizationLevels,
  listOrganizationalLevels,
  updateAuthorizationLevel,
  updateOrganizationalLevel,
} from '../services/rh-personnel-levels.service';
import { formSignerSlotParamsSchema, levelParamsSchema, type AuthorizedPersonnelPdfInput, type FormSignerBody } from '../schemas/rh-authorized-personnel.schema';
import {
  FORM_SIGNER_SLOT_LABEL,
  getFormSignerImage,
  listFormSigners,
  loadFormSignersForPdf,
  retireFormSigner,
  setFormSigner,
} from '../services/rh-form-signers.service';
import { decodeSignaturePng } from '../utils/signature-image';

/** Controladores del Listado de personal autorizado (REH-REG-026) y sus catalogos. */

const ERROR_STATUS: Record<string, number> = {
  RH_ORG_LEVEL_CODE_TAKEN: 409,
  RH_ORG_LEVEL_IN_USE: 409,
  RH_AUTH_LEVEL_NO_TAKEN: 409,
  RH_LEVEL_NOT_FOUND: 404,
  RH_COMP_EVAL_NOT_FOUND: 404,
  RH_COMP_EVAL_NOT_AUTHORIZED: 409,
  RH_COMP_EVAL_AUTH_LEVEL_INVALID: 400,
  RH_FORM_SIGNER_NOT_FOUND: 404,
  RH_FORM_SIGNER_FILE_MISSING: 404,
};

const fail = (res: Response, error: any, fallback: string): Response => {
  const status = ERROR_STATUS[error?.code];
  if (status) {
    return res.status(status).json({ message: error?.publicMessage || fallback });
  }
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

const audit = async (req: AuthRequest, action: string, entityType: string, entityId: number | null) => {
  if (!req.user?.id) return;
  await registerAuditEvent({
    user_id: req.user.id,
    action,
    ip_address: req.ip ?? null,
    module_code: 'RH',
    entity_type: entityType,
    entity_id: entityId,
  });
};

export const getAuthorizedPersonnelController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json(await getAuthorizedPersonnelListing());
  } catch (error) {
    return fail(res, error, 'No se pudo cargar el listado de personal autorizado.');
  }
};

/**
 * PDF del REH-REG-026 con las filas que muestra la pantalla (sus filtros).
 * Sin claves sale el listado completo; con claves se imprime el aviso de extracto.
 */
export const getAuthorizedPersonnelPdfController = async (req: AuthRequest, res: Response) => {
  const body = req.body as AuthorizedPersonnelPdfInput;
  try {
    const now = new Date();
    const full = await getAuthorizedPersonnelListing(now);
    const listing = body.keys ? filterAuthorizedPersonnelListing(full, body.keys) : full;
    const partial = listing.rows.length !== full.rows.length;
    const filterNote = partial
      ? `EXTRACTO: ${listing.rows.length} de ${full.rows.length} filas del listado${body.filter_label ? ` · Filtros: ${body.filter_label}` : ''}`
      : undefined;
    const signers = await loadFormSignersForPdf(AUTHORIZED_PERSONNEL_FORM.code);
    const pdf = await buildAuthorizedPersonnelPdf(listing, now, { signers, ...(filterNote ? { filterNote } : {}) });
    await audit(req, `RH_AUTHORIZED_PERSONNEL_PDF:${listing.cutoff_date}:${listing.rows.length}/${full.rows.length}`, 'authorized_personnel', null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${AUTHORIZED_PERSONNEL_FORM.code}_Listado_personal_autorizado_${listing.cutoff_date}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, 'No se pudo generar el PDF del listado.');
  }
};

/** Fija o corrige el nivel de autorizacion de una evaluacion ya autorizada (queda en bitacora). */
export const setAuthorizationLevelController = async (req: AuthRequest, res: Response) => {
  const params = levelParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  try {
    const { record, previousLevelNo } = await setEvaluationAuthorizationLevel(params.data.id, Number(req.body.authorization_level_id));
    await audit(
      req,
      `RH_COMP_EVAL_AUTH_LEVEL:${record.id}:${previousLevelNo ?? 'sin_nivel'}->${record.authorization_level_no ?? ''}`,
      'competency_evaluation',
      record.id,
    );
    return res.json({ message: `Nivel de autorización ${record.authorization_level_no} registrado.`, evaluation: record });
  } catch (error) {
    return fail(res, error, 'No se pudo guardar el nivel de autorización.');
  }
};

// --- Catalogos ---------------------------------------------------------------

const includeInactive = (req: AuthRequest): boolean => String(req.query.include_inactive ?? '') === 'true';

export const listOrganizationalLevelsController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ levels: await listOrganizationalLevels(includeInactive(req)) });
  } catch (error) {
    return fail(res, error, 'No se pudieron cargar los niveles organizacionales.');
  }
};

export const createOrganizationalLevelController = async (req: AuthRequest, res: Response) => {
  try {
    const level = await createOrganizationalLevel(req.body);
    await audit(req, `RH_ORG_LEVEL_CREATE:${level.code}`, 'organizational_level', level.id);
    return res.status(201).json({ level });
  } catch (error) {
    return fail(res, error, 'No se pudo crear el nivel organizacional.');
  }
};

export const updateOrganizationalLevelController = async (req: AuthRequest, res: Response) => {
  const params = levelParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'ID de nivel invalido.' });
  try {
    const level = await updateOrganizationalLevel(params.data.id, req.body);
    await audit(req, `RH_ORG_LEVEL_UPDATE:${level.code}:${level.is_active ? 'activo' : 'inactivo'}`, 'organizational_level', level.id);
    return res.json({ level });
  } catch (error) {
    return fail(res, error, 'No se pudo actualizar el nivel organizacional.');
  }
};

export const listAuthorizationLevelsController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ levels: await listAuthorizationLevels(includeInactive(req)) });
  } catch (error) {
    return fail(res, error, 'No se pudieron cargar los niveles de autorización.');
  }
};

export const createAuthorizationLevelController = async (req: AuthRequest, res: Response) => {
  try {
    const level = await createAuthorizationLevel(req.body);
    await audit(req, `RH_AUTH_LEVEL_CREATE:${level.level_no}`, 'authorization_level', level.id);
    return res.status(201).json({ level });
  } catch (error) {
    return fail(res, error, 'No se pudo crear el nivel de autorización.');
  }
};

export const updateAuthorizationLevelController = async (req: AuthRequest, res: Response) => {
  const params = levelParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'ID de nivel invalido.' });
  try {
    const level = await updateAuthorizationLevel(params.data.id, req.body);
    await audit(req, `RH_AUTH_LEVEL_UPDATE:${level.level_no}:${level.is_active ? 'activo' : 'inactivo'}`, 'authorization_level', level.id);
    return res.json({ level });
  } catch (error) {
    return fail(res, error, 'No se pudo actualizar el nivel de autorización.');
  }
};

// --- Firmantes del pie del formato (ELABORO / REVISO / AUTORIZO) ----------------

const FORM_CODE = AUTHORIZED_PERSONNEL_FORM.code;

export const listFormSignersController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ signers: await listFormSigners(FORM_CODE) });
  } catch (error) {
    return fail(res, error, 'No se pudieron cargar los firmantes del formato.');
  }
};

/** Nombre, cargo y (opcionalmente) firma nueva del puesto; el registro anterior queda retirado. */
export const setFormSignerController = async (req: AuthRequest, res: Response) => {
  const params = formSignerSlotParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'Puesto de firma invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  const body = req.body as FormSignerBody;
  try {
    let png: Buffer | null = null;
    if (body.image) {
      png = decodeSignaturePng(body.image);
      if (!png) return res.status(400).json({ message: 'La imagen de la firma está vacía o no es un PNG válido.' });
    }
    const signer = await setFormSigner({
      formCode: FORM_CODE,
      slot: params.data.slot,
      signerName: body.signer_name,
      signerTitle: body.signer_title,
      png,
      userId: req.user.id,
    });
    await audit(req, `RH_FORM_SIGNER_SET:${FORM_CODE}:${signer.slot}:${signer.id}${png ? ':IMAGE' : ''}`, 'form_signer', signer.id);
    return res.json({ message: `${FORM_SIGNER_SLOT_LABEL[signer.slot]}: firmante registrado.`, signer });
  } catch (error) {
    return fail(res, error, 'No se pudo registrar al firmante.');
  }
};

export const retireFormSignerController = async (req: AuthRequest, res: Response) => {
  const params = formSignerSlotParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'Puesto de firma invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  try {
    const signer = await retireFormSigner(FORM_CODE, params.data.slot, req.user.id);
    await audit(req, `RH_FORM_SIGNER_RETIRE:${FORM_CODE}:${signer.slot}:${signer.id}`, 'form_signer', signer.id);
    return res.json({ message: `${FORM_SIGNER_SLOT_LABEL[signer.slot]}: firmante retirado; el PDF vuelve al nombre fijo del formato.`, signer });
  } catch (error) {
    return fail(res, error, 'No se pudo retirar al firmante.');
  }
};

/** PNG de la firma vigente del puesto (para la miniatura del drawer). */
export const getFormSignerImageController = async (req: AuthRequest, res: Response) => {
  const params = formSignerSlotParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'Puesto de firma invalido.' });
  try {
    const found = await getFormSignerImage(FORM_CODE, params.data.slot);
    if (!found) return res.status(404).json({ message: 'Ese puesto de firma no tiene firma registrada.' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(found.png);
  } catch (error) {
    return fail(res, error, 'No se pudo cargar la imagen de la firma.');
  }
};
