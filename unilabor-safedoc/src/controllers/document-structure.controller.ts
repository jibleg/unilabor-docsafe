import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  createDocumentSection,
  createDocumentType,
  deleteDocumentSection,
  deleteDocumentType,
  listDocumentSections,
  listDocumentTypes,
  type DocumentSectionPayload,
  type DocumentTypePayload,
  updateDocumentSection,
  updateDocumentType,
} from '../services/document-structure.service';

const parseNumber = (value: unknown): number | null => {
  const parsedValue = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }
  return parsedValue;
};

const getString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const getBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'true') {
      return true;
    }
    if (value.trim().toLowerCase() === 'false') {
      return false;
    }
  }
  return undefined;
};

const mapStructureError = (res: Response, error: any) => {
  if (error?.code === 'DOCUMENT_STRUCTURE_TABLES_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'La estructura documental RH no existe. Ejecuta la migracion del Sprint 3.',
    });
  }

  if (error?.code === '23505') {
    return res.status(409).json({
      message: 'Ya existe una seccion o tipo documental con el mismo nombre o codigo.',
    });
  }

  if (error?.code === '23503') {
    return res.status(400).json({
      message: 'La seccion documental indicada no existe o no esta disponible.',
    });
  }

  return null;
};

export const listDocumentSectionsController = async (_req: AuthRequest, res: Response) => {
  try {
    const sections = await listDocumentSections();
    return res.json({ sections });
  } catch (error: any) {
    const mapped = mapStructureError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando secciones documentales:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las secciones documentales.' });
  }
};

export const createDocumentSectionController = async (req: AuthRequest, res: Response) => {
  const name = getString(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'El nombre de la seccion es obligatorio.' });
  }

  try {
    const payload: DocumentSectionPayload = {
      name,
      sort_order: parseNumber(req.body?.sort_order) ?? 0,
    };
    const code = getString(req.body?.code);
    const description = getString(req.body?.description);
    const isActive = getBoolean(req.body?.is_active);

    if (code !== null) {
      payload.code = code;
    }
    if (description !== null) {
      payload.description = description;
    }
    if (typeof isActive === 'boolean') {
      payload.is_active = isActive;
    }

    const section = await createDocumentSection(payload);

    return res.status(201).json({
      message: 'Seccion documental creada correctamente.',
      section,
    });
  } catch (error: any) {
    const mapped = mapStructureError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error creando seccion documental:', error);
    return res.status(500).json({ message: 'No se pudo crear la seccion documental.' });
  }
};

export const updateDocumentSectionController = async (req: AuthRequest, res: Response) => {
  const sectionId = parseNumber(req.params.id);
  if (!sectionId) {
    return res.status(400).json({ message: 'ID de seccion invalido.' });
  }

  try {
    const payload: Partial<DocumentSectionPayload> = {};

    if (req.body?.code !== undefined) {
      payload.code = getString(req.body?.code);
    }
    if (req.body?.name !== undefined) {
      payload.name = getString(req.body?.name) ?? '';
    }
    if (req.body?.description !== undefined) {
      payload.description = getString(req.body?.description);
    }
    if (req.body?.is_active !== undefined) {
      payload.is_active = getBoolean(req.body?.is_active) ?? false;
    }
    if (req.body?.sort_order !== undefined) {
      payload.sort_order = parseNumber(req.body?.sort_order) ?? 0;
    }

    const section = await updateDocumentSection(sectionId, payload);

    if (!section) {
      return res.status(404).json({ message: 'Seccion documental no encontrada.' });
    }

    return res.json({
      message: 'Seccion documental actualizada correctamente.',
      section,
    });
  } catch (error: any) {
    const mapped = mapStructureError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error actualizando seccion documental:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la seccion documental.' });
  }
};

export const deleteDocumentSectionController = async (req: AuthRequest, res: Response) => {
  const sectionId = parseNumber(req.params.id);
  if (!sectionId) {
    return res.status(400).json({ message: 'ID de seccion invalido.' });
  }

  try {
    const section = await deleteDocumentSection(sectionId);
    if (!section) {
      return res.status(404).json({ message: 'Seccion documental no encontrada.' });
    }

    return res.json({
      message: 'Seccion documental inactivada correctamente.',
      section,
    });
  } catch (error: any) {
    const mapped = mapStructureError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error inactivando seccion documental:', error);
    return res.status(500).json({ message: 'No se pudo inactivar la seccion documental.' });
  }
};

export const listDocumentTypesController = async (req: AuthRequest, res: Response) => {
  try {
    const sectionId = parseNumber(req.query?.section_id);
    const isActive = getBoolean(req.query?.is_active);
    const filters: { sectionId?: number | null; isActive?: boolean | null } = {};

    if (sectionId !== null) {
      filters.sectionId = sectionId;
    }
    if (typeof isActive === 'boolean') {
      filters.isActive = isActive;
    }

    const types = await listDocumentTypes(filters);
    return res.json({ types });
  } catch (error: any) {
    const mapped = mapStructureError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando tipos documentales:', error);
    return res.status(500).json({ message: 'No se pudieron obtener los tipos documentales.' });
  }
};

export const createDocumentTypeController = async (req: AuthRequest, res: Response) => {
  const sectionId = parseNumber(req.body?.section_id);
  const name = getString(req.body?.name);

  if (!sectionId) {
    return res.status(400).json({ message: 'section_id es obligatorio y debe ser valido.' });
  }

  if (!name) {
    return res.status(400).json({ message: 'El nombre del tipo documental es obligatorio.' });
  }

  try {
    const payload: DocumentTypePayload = {
      section_id: sectionId,
      name,
      sort_order: parseNumber(req.body?.sort_order) ?? 0,
    };
    const code = getString(req.body?.code);
    const description = getString(req.body?.description);
    const isRequired = getBoolean(req.body?.is_required);
    const isSensitive = getBoolean(req.body?.is_sensitive);
    const hasExpiry = getBoolean(req.body?.has_expiry);
    const isActive = getBoolean(req.body?.is_active);

    if (code !== null) {
      payload.code = code;
    }
    if (description !== null) {
      payload.description = description;
    }
    if (typeof isRequired === 'boolean') {
      payload.is_required = isRequired;
    }
    if (typeof isSensitive === 'boolean') {
      payload.is_sensitive = isSensitive;
    }
    if (typeof hasExpiry === 'boolean') {
      payload.has_expiry = hasExpiry;
    }
    if (typeof isActive === 'boolean') {
      payload.is_active = isActive;
    }

    const type = await createDocumentType(payload);

    return res.status(201).json({
      message: 'Tipo documental creado correctamente.',
      type,
    });
  } catch (error: any) {
    const mapped = mapStructureError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error creando tipo documental:', error);
    return res.status(500).json({ message: 'No se pudo crear el tipo documental.' });
  }
};

export const updateDocumentTypeController = async (req: AuthRequest, res: Response) => {
  const typeId = parseNumber(req.params.id);
  if (!typeId) {
    return res.status(400).json({ message: 'ID de tipo documental invalido.' });
  }

  try {
    const payload: Partial<DocumentTypePayload> = {};

    if (req.body?.section_id !== undefined) {
      payload.section_id = parseNumber(req.body?.section_id) ?? 0;
    }
    if (req.body?.code !== undefined) {
      payload.code = getString(req.body?.code);
    }
    if (req.body?.name !== undefined) {
      payload.name = getString(req.body?.name) ?? '';
    }
    if (req.body?.description !== undefined) {
      payload.description = getString(req.body?.description);
    }
    if (req.body?.is_required !== undefined) {
      payload.is_required = getBoolean(req.body?.is_required) ?? false;
    }
    if (req.body?.is_sensitive !== undefined) {
      payload.is_sensitive = getBoolean(req.body?.is_sensitive) ?? false;
    }
    if (req.body?.has_expiry !== undefined) {
      payload.has_expiry = getBoolean(req.body?.has_expiry) ?? false;
    }
    if (req.body?.is_active !== undefined) {
      payload.is_active = getBoolean(req.body?.is_active) ?? false;
    }
    if (req.body?.sort_order !== undefined) {
      payload.sort_order = parseNumber(req.body?.sort_order) ?? 0;
    }

    const type = await updateDocumentType(typeId, payload);

    if (!type) {
      return res.status(404).json({ message: 'Tipo documental no encontrado.' });
    }

    return res.json({
      message: 'Tipo documental actualizado correctamente.',
      type,
    });
  } catch (error: any) {
    const mapped = mapStructureError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error actualizando tipo documental:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el tipo documental.' });
  }
};

export const deleteDocumentTypeController = async (req: AuthRequest, res: Response) => {
  const typeId = parseNumber(req.params.id);
  if (!typeId) {
    return res.status(400).json({ message: 'ID de tipo documental invalido.' });
  }

  try {
    const type = await deleteDocumentType(typeId);
    if (!type) {
      return res.status(404).json({ message: 'Tipo documental no encontrado.' });
    }

    return res.json({
      message: 'Tipo documental inactivado correctamente.',
      type,
    });
  } catch (error: any) {
    const mapped = mapStructureError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error inactivando tipo documental:', error);
    return res.status(500).json({ message: 'No se pudo inactivar el tipo documental.' });
  }
};
