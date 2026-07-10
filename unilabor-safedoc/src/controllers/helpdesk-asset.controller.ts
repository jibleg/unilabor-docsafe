import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  createHelpdeskAsset,
  createAssetComponent,
  attachAssetComponent,
  detachAssetComponent,
  deactivateHelpdeskAsset,
  getHelpdeskAssetById,
  listHelpdeskAssets,
  listHelpdeskCatalogs,
  updateHelpdeskAsset,
  setAssetReviewStatus,
  getAssetReviewProgress,
} from '../services/helpdesk-asset.service';
import {
  createHelpdeskCatalogItem,
  deactivateHelpdeskCatalogItem,
  deleteHelpdeskCatalogItem,
  isHelpdeskCatalogAdminKey,
  listHelpdeskCatalogAdminData,
  updateHelpdeskCatalogItem,
  type HelpdeskCatalogAdminKey,
} from '../services/helpdesk-catalog-admin.service';
import {
  getNumberId,
  mapHelpdeskError,
  mapHelpdeskCatalogAdminError,
  getHelpdeskCatalogAdminPayload,
  getAssetPayload,
  logHelpdeskAudit,
} from './helpdesk-controller.shared';

export const listHelpdeskCatalogsController = async (_req: AuthRequest, res: Response) => {
  try {
    const catalogs = await listHelpdeskCatalogs();
    return res.json({ catalogs });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando catalogos Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los catalogos Helpdesk.' });
  }
};

export const listHelpdeskCatalogAdminDataController = async (_req: AuthRequest, res: Response) => {
  try {
    const catalogs = await listHelpdeskCatalogAdminData();
    return res.json({ catalogs });
  } catch (error: any) {
    const mappedError = mapHelpdeskCatalogAdminError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando catalogos administrables Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los catalogos administrables.' });
  }
};

export const createHelpdeskCatalogItemController = async (req: AuthRequest, res: Response) => {
  const catalogKey = String(req.params.catalogKey ?? '');
  if (!isHelpdeskCatalogAdminKey(catalogKey)) {
    return res.status(400).json({ message: 'Catalogo invalido.' });
  }

  const payload = getHelpdeskCatalogAdminPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El nombre del catalogo es obligatorio.' });
  }

  try {
    const item = await createHelpdeskCatalogItem(catalogKey as HelpdeskCatalogAdminKey, payload);
    return res.status(201).json({
      message: 'Registro de catalogo creado correctamente.',
      item,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskCatalogAdminError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando registro de catalogo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo crear el registro del catalogo.' });
  }
};

export const updateHelpdeskCatalogItemController = async (req: AuthRequest, res: Response) => {
  const catalogKey = String(req.params.catalogKey ?? '');
  const itemId = getNumberId(req.params.id);
  if (!isHelpdeskCatalogAdminKey(catalogKey)) {
    return res.status(400).json({ message: 'Catalogo invalido.' });
  }
  if (!itemId) {
    return res.status(400).json({ message: 'ID de catalogo invalido.' });
  }

  const payload = getHelpdeskCatalogAdminPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El nombre del catalogo es obligatorio.' });
  }

  try {
    const item = await updateHelpdeskCatalogItem(catalogKey as HelpdeskCatalogAdminKey, itemId, payload);
    if (!item) {
      return res.status(404).json({ message: 'Registro de catalogo no encontrado.' });
    }

    return res.json({
      message: 'Registro de catalogo actualizado correctamente.',
      item,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskCatalogAdminError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando registro de catalogo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el registro del catalogo.' });
  }
};

export const deactivateHelpdeskCatalogItemController = async (req: AuthRequest, res: Response) => {
  const catalogKey = String(req.params.catalogKey ?? '');
  const itemId = getNumberId(req.params.id);
  if (!isHelpdeskCatalogAdminKey(catalogKey)) {
    return res.status(400).json({ message: 'Catalogo invalido.' });
  }
  if (!itemId) {
    return res.status(400).json({ message: 'ID de catalogo invalido.' });
  }

  try {
    const item = await deactivateHelpdeskCatalogItem(catalogKey as HelpdeskCatalogAdminKey, itemId);
    if (!item) {
      return res.status(404).json({ message: 'Registro de catalogo no encontrado.' });
    }

    return res.json({
      message: 'Registro de catalogo desactivado correctamente.',
      item,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskCatalogAdminError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error desactivando registro de catalogo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo desactivar el registro del catalogo.' });
  }
};

export const deleteHelpdeskCatalogItemController = async (req: AuthRequest, res: Response) => {
  const catalogKey = String(req.params.catalogKey ?? '');
  const itemId = getNumberId(req.params.id);
  if (!isHelpdeskCatalogAdminKey(catalogKey)) {
    return res.status(400).json({ message: 'Catalogo invalido.' });
  }
  if (!itemId) {
    return res.status(400).json({ message: 'ID de catalogo invalido.' });
  }

  try {
    const removed = await deleteHelpdeskCatalogItem(catalogKey as HelpdeskCatalogAdminKey, itemId);
    if (!removed) {
      return res.status(404).json({ message: 'Registro de catalogo no encontrado.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_CATALOG_DELETE:${catalogKey}:${itemId}`, req.ip, itemId, 'helpdesk_catalog');
    return res.json({ message: 'Registro de catalogo eliminado definitivamente.' });
  } catch (error: any) {
    // 23503: el registro está referenciado por otros datos (activos, tickets, etc.).
    if (error?.code === '23503') {
      return res.status(409).json({
        message: 'No se puede eliminar: el registro tiene dependencias (está en uso por activos u otros registros). Puedes desactivarlo en su lugar.',
      });
    }

    const mappedError = mapHelpdeskCatalogAdminError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error eliminando registro de catalogo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el registro del catalogo.' });
  }
};

export const listHelpdeskAssetsController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listHelpdeskAssets({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      unitId: getNumberId(req.query.unit_id),
      areaId: getNumberId(req.query.area_id),
      responsibleUserId:
        typeof req.query.responsible_user_id === 'string' && req.query.responsible_user_id.trim()
          ? req.query.responsible_user_id.trim()
          : undefined,
      reviewStatus:
        req.query.review_status === 'PENDING' || req.query.review_status === 'REVIEWED'
          ? req.query.review_status
          : undefined,
    });
    return res.json(result);
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando activos Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los activos.' });
  }
};

export const getHelpdeskAssetByIdController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  try {
    const asset = await getHelpdeskAssetById(assetId);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }

    return res.json({ asset });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el activo.' });
  }
};

export const createHelpdeskAssetController = async (req: AuthRequest, res: Response) => {
  const payload = getAssetPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El nombre del activo es obligatorio.' });
  }

  try {
    const asset = await createHelpdeskAsset(payload, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_CREATE:${asset.id}`, req.ip, asset.id);

    return res.status(201).json({
      message: 'Activo registrado correctamente.',
      asset,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar el activo.' });
  }
};

// Crea un componente bajo el activo :id (activo "todo"). Devuelve el padre actualizado.
export const createAssetComponentController = async (req: AuthRequest, res: Response) => {
  const parentId = getNumberId(req.params.id);
  if (!parentId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }
  const payload = getAssetPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El nombre del componente es obligatorio.' });
  }

  try {
    const asset = await createAssetComponent(parentId, payload, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_COMPONENT_CREATE:${parentId}`, req.ip, parentId);
    return res.status(201).json({ message: 'Componente agregado correctamente.', asset });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }
    console.error('Error creando componente Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo agregar el componente.' });
  }
};

// Vincula un activo existente como componente del activo :id.
export const attachAssetComponentController = async (req: AuthRequest, res: Response) => {
  const parentId = getNumberId(req.params.id);
  const componentId = getNumberId(req.body?.component_asset_id);
  if (!parentId || !componentId) {
    return res.status(400).json({ message: 'IDs de activo/componente invalidos.' });
  }

  try {
    const asset = await attachAssetComponent(componentId, parentId, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_COMPONENT_ATTACH:${parentId}:${componentId}`, req.ip, parentId);
    return res.json({ message: 'Componente vinculado correctamente.', asset });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }
    console.error('Error vinculando componente Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo vincular el componente.' });
  }
};

// Desvincula el componente :id: vuelve a ser un activo independiente.
export const detachAssetComponentController = async (req: AuthRequest, res: Response) => {
  const componentId = getNumberId(req.params.id);
  if (!componentId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  try {
    const asset = await detachAssetComponent(componentId, req.user?.id ?? null);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_COMPONENT_DETACH:${componentId}`, req.ip, componentId);
    return res.json({ message: 'Componente desvinculado correctamente.', asset });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }
    console.error('Error desvinculando componente Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo desvincular el componente.' });
  }
};

// Avance de la depuracion de la carga: {total, reviewed, pending} de activos vigentes.
export const getAssetReviewProgressController = async (_req: AuthRequest, res: Response) => {
  try {
    const progress = await getAssetReviewProgress();
    return res.json(progress);
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }
    console.error('Error obteniendo avance de revision Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el avance de revision.' });
  }
};

// Marca o desmarca el activo :id como revisado (body { reviewed: boolean }).
export const setAssetReviewStatusController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }
  const reviewed = req.body?.reviewed === true;

  try {
    const asset = await setAssetReviewStatus(assetId, reviewed, req.user?.id ?? null);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }
    await logHelpdeskAudit(
      req.user?.id,
      `HELPDESK_ASSET_REVIEW:${assetId}:${reviewed ? 'REVIEWED' : 'PENDING'}`,
      req.ip,
      assetId,
    );
    return res.json({
      message: reviewed ? 'Activo marcado como revisado.' : 'Activo devuelto a pendiente.',
      asset,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }
    console.error('Error actualizando revision de activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la revision del activo.' });
  }
};

export const updateHelpdeskAssetController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  const payload = getAssetPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El nombre del activo es obligatorio.' });
  }

  try {
    const asset = await updateHelpdeskAsset(assetId, payload, req.user?.id ?? null);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_UPDATE:${assetId}`, req.ip, assetId);

    return res.json({
      message: 'Activo actualizado correctamente.',
      asset,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el activo.' });
  }
};

export const deleteHelpdeskAssetController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  try {
    const asset = await deactivateHelpdeskAsset(assetId, req.user?.id ?? null);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_DELETE:${assetId}`, req.ip, assetId);

    return res.json({
      message: 'Activo dado de baja correctamente.',
      asset,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error inactivando activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo dar de baja el activo.' });
  }
};
