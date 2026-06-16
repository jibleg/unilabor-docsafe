import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  createHelpdeskAsset,
  deactivateHelpdeskAsset,
  getHelpdeskAssetById,
  listHelpdeskAssets,
  listHelpdeskCatalogs,
  updateHelpdeskAsset,
} from '../services/helpdesk-asset.service';
import {
  createHelpdeskCatalogItem,
  deactivateHelpdeskCatalogItem,
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

export const listHelpdeskAssetsController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listHelpdeskAssets({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
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
    return res.status(400).json({ message: 'Codigo interno y nombre del activo son obligatorios.' });
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

export const updateHelpdeskAssetController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  const payload = getAssetPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Codigo interno y nombre del activo son obligatorios.' });
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
