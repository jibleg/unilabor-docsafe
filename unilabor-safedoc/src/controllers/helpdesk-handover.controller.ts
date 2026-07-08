import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { getNumberId, getText, logHelpdeskAudit, mapHelpdeskError } from './helpdesk-controller.shared';
import {
  createHandover,
  deleteHandoverDraft,
  getHandoverById,
  listAssetsPendingHandover,
  listHandovers,
  resolveHandoverDocumentPath,
  signHandover,
  updateHandoverDraft,
  voidHandover,
  type HandoverPayload,
  type HandoverSignPayload,
  type HandoverStatus,
} from '../services/helpdesk-handover.service';

const mapHandoverError = (res: Response, error: any) => {
  if (error?.code === 'HELPDESK_HANDOVER_TABLES_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'Las tablas de entrega-recepcion no existen. Ejecuta la migracion 20260708_01.',
    });
  }
  if (error?.code === 'HELPDESK_HANDOVER_NOT_FOUND') {
    return res.status(404).json({ message: 'Acta de entrega-recepcion no encontrada.' });
  }
  if (
    error?.code === 'HELPDESK_HANDOVER_INVALID_STATE' ||
    error?.code === 'HELPDESK_HANDOVER_NO_ITEMS' ||
    error?.code === 'HELPDESK_HANDOVER_INVALID_SIGNATURE' ||
    error?.code === 'HELPDESK_HANDOVER_ASSET_ALREADY_DELIVERED'
  ) {
    const status = error.code === 'HELPDESK_HANDOVER_ASSET_ALREADY_DELIVERED' ? 409 : 400;
    return res.status(status).json({ message: error.publicMessage ?? 'La operacion no es valida para el acta.' });
  }
  return mapHelpdeskError(res, error);
};

const parseStatus = (value: unknown): HandoverStatus | null => {
  const text = getText(value);
  if (text === 'DRAFT' || text === 'SIGNED' || text === 'VOID') {
    return text;
  }
  return null;
};

const getHandoverPayload = (body: any): HandoverPayload | null => {
  const unitId = getNumberId(body?.unit_id);
  const areaId = getNumberId(body?.area_id);
  const receivedByUserId = getText(body?.received_by_user_id);
  const receivedByName = getText(body?.received_by_name);
  const deliveredByName = getText(body?.delivered_by_name);

  if (!unitId || !areaId || !receivedByUserId || !receivedByName || !deliveredByName) {
    return null;
  }

  const items = Array.isArray(body?.items)
    ? body.items
        .map((item: any) => ({
          asset_id: getNumberId(item?.asset_id),
          receipt_condition_id: getNumberId(item?.receipt_condition_id),
          observations: getText(item?.observations),
        }))
        .filter((item: { asset_id: number | null }): item is HandoverPayload['items'][number] => Boolean(item.asset_id))
    : [];

  return {
    unit_id: unitId,
    area_id: areaId,
    received_by_user_id: receivedByUserId,
    received_by_name: receivedByName,
    delivered_by_name: deliveredByName,
    notes: getText(body?.notes),
    items,
  };
};

export const listHandoverPendingAssetsController = async (req: AuthRequest, res: Response) => {
  const areaId = getNumberId(req.query.area_id);
  if (!areaId) {
    return res.status(400).json({ message: 'El area es obligatoria para listar los pendientes.' });
  }

  try {
    const assets = await listAssetsPendingHandover(areaId);
    return res.json({ assets });
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando activos pendientes de entrega:', error);
    return res.status(500).json({ message: 'No se pudieron obtener los activos pendientes.' });
  }
};

export const listHandoversController = async (req: AuthRequest, res: Response) => {
  try {
    const handovers = await listHandovers({
      status: parseStatus(req.query.status),
      areaId: getNumberId(req.query.area_id),
      receivedByUserId: getText(req.query.received_by_user_id),
    });
    return res.json({ handovers });
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando actas de entrega-recepcion:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las actas.' });
  }
};

export const getHandoverByIdController = async (req: AuthRequest, res: Response) => {
  const handoverId = getNumberId(req.params.id);
  if (!handoverId) {
    return res.status(400).json({ message: 'ID de acta invalido.' });
  }

  try {
    const handover = await getHandoverById(handoverId);
    if (!handover) {
      return res.status(404).json({ message: 'Acta de entrega-recepcion no encontrada.' });
    }
    return res.json({ handover });
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error obteniendo acta de entrega-recepcion:', error);
    return res.status(500).json({ message: 'No se pudo obtener el acta.' });
  }
};

export const createHandoverController = async (req: AuthRequest, res: Response) => {
  const payload = getHandoverPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Unidad, area, responsable y nombres de firma son obligatorios.' });
  }

  try {
    const handover = await createHandover(payload, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_HANDOVER_CREATE:${handover.id}`, req.ip, handover.id, 'helpdesk_handover');
    return res.status(201).json({ message: 'Borrador de acta creado.', handover });
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error creando acta de entrega-recepcion:', error);
    return res.status(500).json({ message: 'No se pudo crear el acta.' });
  }
};

export const updateHandoverController = async (req: AuthRequest, res: Response) => {
  const handoverId = getNumberId(req.params.id);
  if (!handoverId) {
    return res.status(400).json({ message: 'ID de acta invalido.' });
  }

  const payload = getHandoverPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Unidad, area, responsable y nombres de firma son obligatorios.' });
  }

  try {
    const handover = await updateHandoverDraft(handoverId, payload, req.user?.id ?? null);
    if (!handover) {
      return res.status(404).json({ message: 'Acta de entrega-recepcion no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_HANDOVER_UPDATE:${handoverId}`, req.ip, handoverId, 'helpdesk_handover');
    return res.json({ message: 'Borrador de acta actualizado.', handover });
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error actualizando acta de entrega-recepcion:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el acta.' });
  }
};

export const signHandoverController = async (req: AuthRequest, res: Response) => {
  const handoverId = getNumberId(req.params.id);
  if (!handoverId) {
    return res.status(400).json({ message: 'ID de acta invalido.' });
  }

  const delivererSignature = getText(req.body?.deliverer_signature);
  const receiverSignature = getText(req.body?.receiver_signature);
  if (!delivererSignature || !receiverSignature) {
    return res.status(400).json({ message: 'Se requieren ambas firmas para cerrar el acta.' });
  }

  const payload: HandoverSignPayload = {
    deliverer_signature: delivererSignature,
    receiver_signature: receiverSignature,
    delivered_by_name: getText(req.body?.delivered_by_name),
    received_by_name: getText(req.body?.received_by_name),
    notes: getText(req.body?.notes),
  };

  try {
    const handover = await signHandover(handoverId, payload, req.user?.id ?? null);
    if (!handover) {
      return res.status(404).json({ message: 'Acta de entrega-recepcion no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_HANDOVER_SIGN:${handoverId}`, req.ip, handoverId, 'helpdesk_handover');
    return res.json({ message: 'Acta de entrega-recepcion firmada correctamente.', handover });
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error firmando acta de entrega-recepcion:', error);
    return res.status(500).json({ message: 'No se pudo firmar el acta.' });
  }
};

export const voidHandoverController = async (req: AuthRequest, res: Response) => {
  const handoverId = getNumberId(req.params.id);
  if (!handoverId) {
    return res.status(400).json({ message: 'ID de acta invalido.' });
  }

  const reason = getText(req.body?.reason);
  if (!reason) {
    return res.status(400).json({ message: 'El motivo de anulacion es obligatorio.' });
  }

  try {
    const handover = await voidHandover(handoverId, reason, req.user?.id ?? null);
    if (!handover) {
      return res.status(404).json({ message: 'Acta de entrega-recepcion no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_HANDOVER_VOID:${handoverId}`, req.ip, handoverId, 'helpdesk_handover');
    return res.json({ message: 'Acta anulada correctamente.', handover });
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error anulando acta de entrega-recepcion:', error);
    return res.status(500).json({ message: 'No se pudo anular el acta.' });
  }
};

export const deleteHandoverController = async (req: AuthRequest, res: Response) => {
  const handoverId = getNumberId(req.params.id);
  if (!handoverId) {
    return res.status(400).json({ message: 'ID de acta invalido.' });
  }

  try {
    const removed = await deleteHandoverDraft(handoverId);
    if (!removed) {
      return res.status(404).json({ message: 'Acta de entrega-recepcion no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_HANDOVER_DELETE:${handoverId}`, req.ip, handoverId, 'helpdesk_handover');
    return res.json({ message: 'Borrador de acta eliminado.' });
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error eliminando acta de entrega-recepcion:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el acta.' });
  }
};

export const viewHandoverActaController = async (req: AuthRequest, res: Response) => {
  const handoverId = getNumberId(req.params.id);
  if (!handoverId) {
    return res.status(400).json({ message: 'ID de acta invalido.' });
  }

  try {
    const resolved = await resolveHandoverDocumentPath(handoverId);
    if (!resolved) {
      return res.status(404).json({ message: 'El acta aun no tiene PDF (firma el acta para generarlo).' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="acta-${resolved.handover.folio}.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(resolved.absolutePath);
  } catch (error: any) {
    const mapped = mapHandoverError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error visualizando el acta de entrega-recepcion:', error);
    return res.status(500).json({ message: 'No se pudo visualizar el acta.' });
  }
};
