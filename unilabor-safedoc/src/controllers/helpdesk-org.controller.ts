import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  getHelpdeskOrgStructure,
  setAreaResponsibles,
  setUnitAreas,
} from '../services/helpdesk-org.service';
import { getNumberId, mapHelpdeskError } from './helpdesk-controller.shared';

// Mapea los errores propios de la estructura organizacional; delega el resto
// (FK 23503, tablas de activos, etc.) al mapeador compartido.
const mapOrgError = (res: Response, error: any) => {
  if (error?.code === 'HELPDESK_ORG_TABLES_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'Las tablas de estructura organizacional no existen. Ejecuta la migracion 20260707_01.',
    });
  }

  if (error?.code === 'HELPDESK_ORG_REFERENCE_NOT_FOUND') {
    return res.status(400).json({
      message: 'La unidad o el area referenciada no existe o esta inactiva.',
    });
  }

  return mapHelpdeskError(res, error);
};

export const getHelpdeskOrgStructureController = async (_req: AuthRequest, res: Response) => {
  try {
    const structure = await getHelpdeskOrgStructure();
    return res.json({ structure });
  } catch (error: any) {
    const mappedError = mapOrgError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo estructura organizacional Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo cargar la estructura organizacional.' });
  }
};

export const setUnitAreasController = async (req: AuthRequest, res: Response) => {
  const unitId = getNumberId(req.params.unitId);
  if (!unitId) {
    return res.status(400).json({ message: 'ID de unidad invalido.' });
  }

  const areaIds: number[] = Array.isArray(req.body?.area_ids) ? req.body.area_ids : [];

  try {
    const assigned = await setUnitAreas(unitId, areaIds);
    return res.json({
      message: 'Areas de la unidad actualizadas correctamente.',
      unit_id: unitId,
      area_ids: assigned,
    });
  } catch (error: any) {
    const mappedError = mapOrgError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error asignando areas a la unidad Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron actualizar las areas de la unidad.' });
  }
};

export const setAreaResponsiblesController = async (req: AuthRequest, res: Response) => {
  const areaId = getNumberId(req.params.areaId);
  if (!areaId) {
    return res.status(400).json({ message: 'ID de area invalido.' });
  }

  const userIds: string[] = Array.isArray(req.body?.user_ids) ? req.body.user_ids : [];

  try {
    const assigned = await setAreaResponsibles(areaId, userIds);
    return res.json({
      message: 'Responsables del area actualizados correctamente.',
      area_id: areaId,
      user_ids: assigned,
    });
  } catch (error: any) {
    const mappedError = mapOrgError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error asignando responsables al area Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron actualizar los responsables del area.' });
  }
};
