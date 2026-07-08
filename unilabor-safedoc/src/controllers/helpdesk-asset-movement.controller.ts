import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { getNumberId, getText, logHelpdeskAudit, mapHelpdeskError } from './helpdesk-controller.shared';
import {
  createAssetMovement,
  listAssetMovements,
  resolveMovementSignaturePath,
  type AssetMovementPayload,
} from '../services/helpdesk-asset-movement.service';

const mapMovementError = (res: Response, error: any) => {
  if (error?.code === 'HELPDESK_MOVEMENT_TABLES_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'Las tablas de movimientos no existen. Ejecuta la migracion 20260708_02.',
    });
  }
  if (error?.code === 'HELPDESK_MOVEMENT_NO_CHANGES' || error?.code === 'HELPDESK_MOVEMENT_INVALID_SIGNATURE') {
    return res.status(400).json({ message: error.publicMessage ?? 'El movimiento no es valido.' });
  }
  if (error?.code === 'HELPDESK_ASSET_NOT_FOUND') {
    return res.status(404).json({ message: 'Activo no encontrado.' });
  }
  return mapHelpdeskError(res, error);
};

const getMovementPayload = (body: any): (AssetMovementPayload & { asset_id: number }) | null => {
  const assetId = getNumberId(body?.asset_id);
  const reason = getText(body?.reason);
  const performedName = getText(body?.performed_by_name);
  const performedSignature = getText(body?.performed_by_signature);
  const responsibleName = getText(body?.responsible_name);
  const responsibleSignature = getText(body?.responsible_signature);

  if (!assetId || !reason || !performedName || !performedSignature || !responsibleName || !responsibleSignature) {
    return null;
  }

  return {
    asset_id: assetId,
    to_unit_id: getNumberId(body?.to_unit_id),
    to_area_id: getNumberId(body?.to_area_id),
    to_category_id: getNumberId(body?.to_category_id),
    reason,
    performed_by_name: performedName,
    performed_by_signature: performedSignature,
    responsible_user_id: getText(body?.responsible_user_id),
    responsible_name: responsibleName,
    responsible_signature: responsibleSignature,
  };
};

export const listAssetMovementsController = async (req: AuthRequest, res: Response) => {
  try {
    const movements = await listAssetMovements(getNumberId(req.query.asset_id));
    return res.json({ movements });
  } catch (error: any) {
    const mapped = mapMovementError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando movimientos de activos:', error);
    return res.status(500).json({ message: 'No se pudieron obtener los movimientos.' });
  }
};

export const createAssetMovementController = async (req: AuthRequest, res: Response) => {
  const payload = getMovementPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Activo, motivo, nombres y firmas son obligatorios.' });
  }

  try {
    const movement = await createAssetMovement(payload.asset_id, payload, req.user?.id ?? null);
    await logHelpdeskAudit(
      req.user?.id,
      `HELPDESK_ASSET_MOVEMENT:${movement.id}`,
      req.ip,
      movement.id,
      'helpdesk_asset_movement',
    );
    return res.status(201).json({ message: 'Movimiento registrado correctamente.', movement });
  } catch (error: any) {
    const mapped = mapMovementError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error registrando movimiento de activo:', error);
    return res.status(500).json({ message: 'No se pudo registrar el movimiento.' });
  }
};

export const viewMovementSignatureController = async (req: AuthRequest, res: Response) => {
  const movementId = getNumberId(req.params.id);
  if (!movementId) {
    return res.status(400).json({ message: 'ID de movimiento invalido.' });
  }
  const party = req.query.party === 'responsible' ? 'responsible' : 'performed';

  try {
    const absolutePath = await resolveMovementSignaturePath(movementId, party);
    if (!absolutePath) {
      return res.status(404).json({ message: 'Firma no encontrada.' });
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(absolutePath);
  } catch (error: any) {
    const mapped = mapMovementError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error visualizando firma del movimiento:', error);
    return res.status(500).json({ message: 'No se pudo visualizar la firma.' });
  }
};
