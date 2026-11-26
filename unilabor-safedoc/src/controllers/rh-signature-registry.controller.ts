import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  createDiscipline,
  filterSignatureRegistryListing,
  getSignatureRegistryListing,
  listDisciplines,
  proposeSigningScopeForRow,
  saveSignatureAuthorization,
  updateDiscipline,
} from '../services/rh-signature-registry.service';
import { buildSignatureRegistryPdf, SIGNATURE_REGISTRY_FORM } from '../services/rh-signature-registry.pdf';
import {
  findLastOwnDocumentSignature,
  getSpecimenImage,
  listEmployeeSpecimens,
  loadSpecimenImages,
  registerSpecimen,
  retireSpecimen,
  SPECIMEN_KIND_LABEL,
} from '../services/rh-signature-specimen.service';
import { decodeSignaturePng } from '../utils/signature-image';
import { loadFormSignersForPdf } from '../services/rh-form-signers.service';
import {
  signatureRegistryEmployeeParamsSchema,
  signatureRegistryIdParamsSchema,
  signatureRegistryRowParamsSchema,
  type DisciplineInput,
  type SignatureAuthorizationInput,
  type SignatureRegistryPdfInput,
  type SpecimenInput,
} from '../schemas/rh-signature-registry.schema';

/** Controladores del Registro de firmas autorizadas (REH-REG-027). */

const ERROR_STATUS: Record<string, number> = {
  RH_SIGNATURE_ROW_NOT_FOUND: 404,
  RH_SIGNATURE_EMPLOYEE_NOT_FOUND: 404,
  RH_SIGNATURE_SPECIMEN_NOT_FOUND: 404,
  RH_SIGNATURE_SPECIMEN_FILE_MISSING: 404,
  RH_SIGNATURE_NO_DOCUMENT_SIGNATURE: 404,
  RH_SIGNATURE_IMAGE_INVALID: 400,
  RH_DISCIPLINE_NOT_FOUND: 404,
  RH_DISCIPLINE_TAKEN: 409,
};

const fail = (res: Response, error: any, fallback: string): Response => {
  const status = ERROR_STATUS[error?.code];
  if (status) return res.status(status).json({ message: error?.publicMessage || fallback });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

const audit = async (req: AuthRequest, action: string, entityType: string, entityId: number | null, employeeId?: number) => {
  if (!req.user?.id) return;
  await registerAuditEvent({
    user_id: req.user.id,
    action,
    ip_address: req.ip ?? null,
    module_code: 'RH',
    entity_type: entityType,
    entity_id: entityId,
    ...(employeeId ? { employee_id: employeeId } : {}),
  });
};

export const getSignatureRegistryController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json(await getSignatureRegistryListing());
  } catch (error) {
    return fail(res, error, 'No se pudo cargar el registro de firmas autorizadas.');
  }
};

/** PDF del REH-REG-027 con las filas que muestra la pantalla; sin claves, el registro completo. */
export const getSignatureRegistryPdfController = async (req: AuthRequest, res: Response) => {
  const body = req.body as SignatureRegistryPdfInput;
  try {
    const now = new Date();
    const full = await getSignatureRegistryListing(now);
    const listing = body.keys ? filterSignatureRegistryListing(full, body.keys) : full;
    const specimenIds = listing.rows.flatMap((row) => [row.signature_specimen?.id, row.initials_specimen?.id]).filter((id): id is number => typeof id === 'number');
    const [specimenImages, signers] = await Promise.all([loadSpecimenImages([...new Set(specimenIds)]), loadFormSignersForPdf(SIGNATURE_REGISTRY_FORM.code)]);
    const pdf = await buildSignatureRegistryPdf(listing, now, { specimenImages, signers });
    await audit(req, `RH_SIGNATURE_REGISTRY_PDF:${listing.cutoff_date}:${listing.rows.length}/${full.rows.length}`, 'signature_registry', null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${SIGNATURE_REGISTRY_FORM.code}_Registro_firmas_autorizadas_${listing.cutoff_date}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, 'No se pudo generar el PDF del registro.');
  }
};

export const saveSignatureAuthorizationController = async (req: AuthRequest, res: Response) => {
  const params = signatureRegistryRowParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'Fila invalida.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const { employeeId, positionId } = params.data;
  try {
    const authorization = await saveSignatureAuthorization(employeeId, positionId, req.body as SignatureAuthorizationInput, req.user.id);
    await audit(req, `RH_SIGNATURE_REGISTRY_ROW_SAVE:${employeeId}:${positionId}`, 'signature_authorization', positionId, employeeId);
    return res.json({ message: 'Fila del registro guardada.', authorization });
  } catch (error) {
    return fail(res, error, 'No se pudo guardar la fila del registro.');
  }
};

/** Propuesta del alcance desde la carta REH-REG-008 (no guarda nada). */
export const proposeSigningScopeController = async (req: AuthRequest, res: Response) => {
  const params = signatureRegistryRowParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'Fila invalida.' });
  try {
    return res.json(await proposeSigningScopeForRow(params.data.employeeId, params.data.positionId));
  } catch (error) {
    return fail(res, error, 'No se pudo proponer el alcance desde la carta.');
  }
};

// --- Disciplinas ----------------------------------------------------------------

export const listDisciplinesController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ disciplines: await listDisciplines(String(req.query.include_inactive ?? '') === 'true') });
  } catch (error) {
    return fail(res, error, 'No se pudieron cargar las disciplinas.');
  }
};

export const createDisciplineController = async (req: AuthRequest, res: Response) => {
  try {
    const discipline = await createDiscipline(req.body as DisciplineInput);
    await audit(req, `RH_DISCIPLINE_CREATE:${discipline.code}`, 'discipline', discipline.id);
    return res.status(201).json({ discipline });
  } catch (error) {
    return fail(res, error, 'No se pudo crear la disciplina.');
  }
};

export const updateDisciplineController = async (req: AuthRequest, res: Response) => {
  const params = signatureRegistryIdParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'ID de disciplina invalido.' });
  try {
    const discipline = await updateDiscipline(params.data.id, req.body as DisciplineInput);
    await audit(req, `RH_DISCIPLINE_UPDATE:${discipline.code}:${discipline.is_active ? 'activa' : 'inactiva'}`, 'discipline', discipline.id);
    return res.json({ discipline });
  } catch (error) {
    return fail(res, error, 'No se pudo actualizar la disciplina.');
  }
};

// --- Especimenes ----------------------------------------------------------------

export const listSpecimensController = async (req: AuthRequest, res: Response) => {
  const params = signatureRegistryEmployeeParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'Colaborador invalido.' });
  try {
    return res.json({ specimens: await listEmployeeSpecimens(params.data.employeeId) });
  } catch (error) {
    return fail(res, error, 'No se pudo cargar el historial de especímenes.');
  }
};

export const registerSpecimenController = async (req: AuthRequest, res: Response) => {
  const params = signatureRegistryEmployeeParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'Colaborador invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const body = req.body as SpecimenInput;
  const employeeId = params.data.employeeId;
  try {
    let png: Buffer | null = null;
    let source: 'UPLOAD' | 'CLIPBOARD' | 'DOCUMENT_SIGNATURE' = body.source ?? 'UPLOAD';
    let sourceNote: string | null = null;
    if (body.from_last_signature) {
      const last = await findLastOwnDocumentSignature(employeeId);
      if (!last) {
        return res.status(404).json({ message: 'El colaborador aún no ha firmado ningún REH-REG-003 ni REH-REG-008 desde su sesión en SafeDoc.' });
      }
      png = last.png;
      source = 'DOCUMENT_SIGNATURE';
      sourceNote = last.note;
    } else {
      png = decodeSignaturePng(body.image ?? '');
      if (!png) return res.status(400).json({ message: 'La imagen del espécimen está vacía o no es un PNG válido.' });
    }
    const specimen = await registerSpecimen({ employeeId, kind: body.kind, png, source, sourceNote, userId: req.user.id });
    await audit(req, `RH_SIGNATURE_SPECIMEN_REGISTER:${body.kind}:${source}:${specimen.id}`, 'signature_specimen', specimen.id, employeeId);
    return res.status(201).json({ message: `${SPECIMEN_KIND_LABEL[body.kind]} registrada.`, specimen });
  } catch (error) {
    return fail(res, error, 'No se pudo registrar el espécimen.');
  }
};

export const retireSpecimenController = async (req: AuthRequest, res: Response) => {
  const params = signatureRegistryIdParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'ID de espécimen invalido.' });
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  try {
    const specimen = await retireSpecimen(params.data.id, req.user.id);
    await audit(req, `RH_SIGNATURE_SPECIMEN_RETIRE:${specimen.kind}:${specimen.id}`, 'signature_specimen', specimen.id, specimen.employee_id);
    return res.json({ message: `${SPECIMEN_KIND_LABEL[specimen.kind]} retirada; queda como antecedente.`, specimen });
  } catch (error) {
    return fail(res, error, 'No se pudo retirar el espécimen.');
  }
};

/** PNG del especimen; cada consulta queda en bitacora. */
export const getSpecimenImageController = async (req: AuthRequest, res: Response) => {
  const params = signatureRegistryIdParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: 'ID de espécimen invalido.' });
  try {
    const { specimen, png } = await getSpecimenImage(params.data.id);
    await audit(req, `RH_SIGNATURE_SPECIMEN_VIEW:${specimen.kind}:${specimen.id}`, 'signature_specimen', specimen.id, specimen.employee_id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(png);
  } catch (error) {
    return fail(res, error, 'No se pudo cargar la imagen del espécimen.');
  }
};
