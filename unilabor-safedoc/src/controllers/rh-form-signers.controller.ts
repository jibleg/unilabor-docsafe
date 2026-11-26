import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  FORM_SIGNER_SLOT_LABEL,
  getFormSignerImage,
  listFormSigners,
  retireFormSigner,
  setFormSigner,
} from '../services/rh-form-signers.service';
import { formSignerSlotParamsSchema, type FormSignerBody } from '../schemas/rh-authorized-personnel.schema';
import { decodeSignaturePng } from '../utils/signature-image';

// Firmantes del pie de un formato controlado (ELABORO / REVISO / AUTORIZO).
// Los mismos cuatro controladores sirven a cada formato: se crean con su codigo
// y cada modulo los monta en sus rutas con el permiso que le corresponda.

const ERROR_STATUS: Record<string, number> = {
  RH_FORM_SIGNER_NOT_FOUND: 404,
  RH_FORM_SIGNER_FILE_MISSING: 404,
};

const fail = (res: Response, error: any, fallback: string): Response => {
  const status = ERROR_STATUS[error?.code];
  if (status) return res.status(status).json({ message: error?.publicMessage || fallback });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

const audit = async (req: AuthRequest, action: string, entityId: number) => {
  if (!req.user?.id) return;
  await registerAuditEvent({
    user_id: req.user.id,
    action,
    ip_address: req.ip ?? null,
    module_code: 'RH',
    entity_type: 'form_signer',
    entity_id: entityId,
  });
};

export const createFormSignerControllers = (formCode: string) => ({
  list: async (_req: AuthRequest, res: Response) => {
    try {
      return res.json({ signers: await listFormSigners(formCode) });
    } catch (error) {
      return fail(res, error, 'No se pudieron cargar los firmantes del formato.');
    }
  },

  /** Nombre, cargo y (opcionalmente) firma nueva del puesto; el registro anterior queda retirado. */
  set: async (req: AuthRequest, res: Response) => {
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
        formCode,
        slot: params.data.slot,
        signerName: body.signer_name,
        signerTitle: body.signer_title,
        png,
        userId: req.user.id,
      });
      await audit(req, `RH_FORM_SIGNER_SET:${formCode}:${signer.slot}:${signer.id}${png ? ':IMAGE' : ''}`, signer.id);
      return res.json({ message: `${FORM_SIGNER_SLOT_LABEL[signer.slot]}: firmante registrado.`, signer });
    } catch (error) {
      return fail(res, error, 'No se pudo registrar al firmante.');
    }
  },

  retire: async (req: AuthRequest, res: Response) => {
    const params = formSignerSlotParamsSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ message: 'Puesto de firma invalido.' });
    if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada.' });
    try {
      const signer = await retireFormSigner(formCode, params.data.slot, req.user.id);
      await audit(req, `RH_FORM_SIGNER_RETIRE:${formCode}:${signer.slot}:${signer.id}`, signer.id);
      return res.json({ message: `${FORM_SIGNER_SLOT_LABEL[signer.slot]}: firmante retirado; el PDF vuelve al nombre fijo del formato.`, signer });
    } catch (error) {
      return fail(res, error, 'No se pudo retirar al firmante.');
    }
  },

  /** PNG de la firma vigente del puesto (para la miniatura del drawer). */
  image: async (req: AuthRequest, res: Response) => {
    const params = formSignerSlotParamsSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ message: 'Puesto de firma invalido.' });
    try {
      const found = await getFormSignerImage(formCode, params.data.slot);
      if (!found) return res.status(404).json({ message: 'Ese puesto de firma no tiene firma registrada.' });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(found.png);
    } catch (error) {
      return fail(res, error, 'No se pudo cargar la imagen de la firma.');
    }
  },
});
