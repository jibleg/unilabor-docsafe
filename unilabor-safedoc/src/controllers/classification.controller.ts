import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  createClassification,
  deactivateClassification,
  deleteClassification,
  getClassificationById,
  listClassifications,
  updateClassification,
  type ClassificationType,
} from '../services/classification.service';
import { getNumberId, getText, logProviderAudit } from './provider-controller.shared';

const parseBooleanQuery = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const parseTypeQuery = (value: unknown): ClassificationType | undefined => {
  if (value === 'PROVIDER' || value === 'CLIENT') {
    return value;
  }

  return undefined;
};

const mapClassificationError = (res: Response, error: any) => {
  if (error?.code === 'CLASSIFICATION_NAME_REQUIRED') {
    return res.status(400).json({ message: 'El nombre de la clasificacion es obligatorio.' });
  }

  if (error?.code === 'CLASSIFICATION_TYPE_INVALID') {
    return res.status(400).json({ message: 'El tipo debe ser PROVIDER o CLIENT.' });
  }

  if (error?.code === 'CLASSIFICATION_SORT_ORDER_INVALID') {
    return res.status(400).json({ message: 'El orden debe ser un numero entero igual o mayor a cero.' });
  }

  if (error?.code === 'CLASSIFICATION_IN_USE') {
    return res.status(409).json({
      message: 'No se puede eliminar: hay proveedores o clientes que usan esta clasificacion. Puedes desactivarla en su lugar.',
    });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ message: 'Ya existe una clasificacion con ese nombre para ese tipo.' });
  }

  return null;
};

export const listClassificationsController = async (req: AuthRequest, res: Response) => {
  try {
    const classifications = await listClassifications({
      type: parseTypeQuery(req.query.type),
      includeInactive: parseBooleanQuery(req.query.includeInactive),
    });
    return res.json({ classifications });
  } catch (error) {
    console.error('Error listando clasificaciones:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las clasificaciones.' });
  }
};

export const createClassificationController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const type = parseTypeQuery(req.body?.type);
  const name = getText(req.body?.name);

  if (!type) {
    return res.status(400).json({ message: 'El tipo debe ser PROVIDER o CLIENT.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre de la clasificacion es obligatorio.' });
  }

  try {
    const classification = await createClassification({
      type,
      name,
      description: getText(req.body?.description),
      sort_order: req.body?.sort_order === undefined ? null : Number(req.body?.sort_order),
    });

    await logProviderAudit(user?.id, 'CLASSIFICATION_CREATE', req.ip, classification.id, 'classification');

    return res.status(201).json({ message: 'Clasificacion creada correctamente.', classification });
  } catch (error: any) {
    const mappedError = mapClassificationError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando clasificacion:', error);
    return res.status(500).json({ message: 'No se pudo crear la clasificacion.' });
  }
};

export const updateClassificationController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const classificationId = getNumberId(req.params.id);
  if (!classificationId) {
    return res.status(400).json({ message: 'ID de clasificacion invalido.' });
  }

  try {
    const existing = await getClassificationById(classificationId);
    if (!existing) {
      return res.status(404).json({ message: 'Clasificacion no encontrada.' });
    }

    const type = req.body?.type !== undefined ? parseTypeQuery(req.body?.type) : existing.type;
    if (req.body?.type !== undefined && !type) {
      return res.status(400).json({ message: 'El tipo debe ser PROVIDER o CLIENT.' });
    }

    const name = req.body?.name !== undefined ? getText(req.body?.name) : existing.name;
    if (req.body?.name !== undefined && !name) {
      return res.status(400).json({ message: 'El nombre de la clasificacion es obligatorio.' });
    }

    const description =
      req.body?.description !== undefined ? getText(req.body?.description) : existing.description;
    const sortOrder =
      req.body?.sort_order !== undefined ? Number(req.body?.sort_order) : existing.sort_order;

    const classification = await updateClassification(classificationId, {
      type: type as ClassificationType,
      name: name as string,
      description,
      sort_order: sortOrder,
    });

    if (!classification) {
      return res.status(404).json({ message: 'Clasificacion no encontrada.' });
    }

    await logProviderAudit(user?.id, 'CLASSIFICATION_UPDATE', req.ip, classification.id, 'classification');

    return res.json({ message: 'Clasificacion actualizada correctamente.', classification });
  } catch (error: any) {
    const mappedError = mapClassificationError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando clasificacion:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la clasificacion.' });
  }
};

export const deactivateClassificationController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const classificationId = getNumberId(req.params.id);
  if (!classificationId) {
    return res.status(400).json({ message: 'ID de clasificacion invalido.' });
  }

  try {
    const classification = await deactivateClassification(classificationId);
    if (!classification) {
      return res.status(404).json({ message: 'Clasificacion no encontrada.' });
    }

    await logProviderAudit(user?.id, 'CLASSIFICATION_DEACTIVATE', req.ip, classificationId, 'classification');

    return res.json({ message: 'Clasificacion desactivada correctamente.', classification });
  } catch (error) {
    console.error('Error desactivando clasificacion:', error);
    return res.status(500).json({ message: 'No se pudo desactivar la clasificacion.' });
  }
};

export const deleteClassificationController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const classificationId = getNumberId(req.params.id);
  if (!classificationId) {
    return res.status(400).json({ message: 'ID de clasificacion invalido.' });
  }

  try {
    const removed = await deleteClassification(classificationId);
    if (!removed) {
      return res.status(404).json({ message: 'Clasificacion no encontrada.' });
    }

    await logProviderAudit(user?.id, 'CLASSIFICATION_DELETE', req.ip, classificationId, 'classification');

    return res.json({ message: 'Clasificacion eliminada definitivamente.' });
  } catch (error: any) {
    const mappedError = mapClassificationError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error eliminando clasificacion:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la clasificacion.' });
  }
};
