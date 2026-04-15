import { Response } from 'express';
import pool from '../config/db';
import { AuthRequest } from '../types';
import * as categoryService from '../services/category.service';

const getStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return null;
};

const parseCategoryId = (rawId: unknown): number | null => {
  const value = getStringValue(rawId);
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const parseBooleanQuery = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const logCategoryAudit = async (
  userId: string | undefined,
  action: string,
  ipAddress: string | undefined
): Promise<void> => {
  if (!userId) {
    return;
  }

  try {
    await pool.query(
      'INSERT INTO access_logs (user_id, action, ip_address) VALUES ($1, $2, $3)',
      [userId, action, ipAddress ?? null]
    );
  } catch (error) {
    console.error('No se pudo registrar auditoría de categoría:', error);
  }
};

export const listCategories = async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const searchValue = getStringValue(req.query.search);
  const includeInactiveRequested = parseBooleanQuery(req.query.includeInactive);

  const userRole = req.user?.role;
  const includeInactive = includeInactiveRequested && (userRole === 'ADMIN' || userRole === 'EDITOR');

  try {
    const options: {
      page: number;
      limit: number;
      includeInactive: boolean;
      search?: string;
    } = {
      page,
      limit,
      includeInactive,
    };

    if (searchValue && searchValue.trim().length > 0) {
      options.search = searchValue;
    }

    const result = await categoryService.getCategoriesPaginated(options);

    res.json(result);
  } catch (error) {
    console.error('Error listando categorías:', error);
    res.status(500).json({ message: 'Error al obtener categorías' });
  }
};

export const getCategoryById = async (req: AuthRequest, res: Response) => {
  const categoryId = parseCategoryId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoría inválido' });
  }

  try {
    const category = await categoryService.getCategoryById(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error obteniendo categoría:', error);
    res.status(500).json({ message: 'Error al obtener la categoría' });
  }
};

export const createCategory = async (req: AuthRequest, res: Response) => {
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 2) {
    return res.status(400).json({ message: 'El nombre de la categoría es obligatorio (mínimo 2 caracteres)' });
  }

  try {
    const category = await categoryService.createCategory(name);
    await logCategoryAudit(req.user?.id, `CATEGORY_CREATE:${category.id}`, req.ip);

    res.status(201).json({
      message: 'Categoría creada correctamente',
      category,
    });
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
    }

    console.error('Error creando categoría:', error);
    res.status(500).json({ message: 'Error al crear la categoría' });
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  const categoryId = parseCategoryId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoría inválido' });
  }

  const name = String(req.body?.name ?? '').trim();
  if (name.length < 2) {
    return res.status(400).json({ message: 'El nombre de la categoría es obligatorio (mínimo 2 caracteres)' });
  }

  try {
    const category = await categoryService.updateCategory(categoryId, name);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    await logCategoryAudit(req.user?.id, `CATEGORY_UPDATE:${categoryId}`, req.ip);
    res.json({ message: 'Categoría actualizada correctamente', category });
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
    }

    console.error('Error actualizando categoría:', error);
    res.status(500).json({ message: 'Error al actualizar la categoría' });
  }
};

export const updateCategoryStatus = async (req: AuthRequest, res: Response) => {
  const categoryId = parseCategoryId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoría inválido' });
  }

  const rawIsActive = req.body?.is_active;
  if (
    typeof rawIsActive !== 'boolean' &&
    typeof rawIsActive !== 'string' &&
    typeof rawIsActive !== 'number'
  ) {
    return res.status(400).json({ message: 'El campo is_active es obligatorio (true/false)' });
  }

  const isActive = parseBooleanQuery(rawIsActive);

  try {
    const category = await categoryService.setCategoryStatus(categoryId, isActive);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    await logCategoryAudit(
      req.user?.id,
      `${isActive ? 'CATEGORY_ENABLE' : 'CATEGORY_DISABLE'}:${categoryId}`,
      req.ip
    );

    res.json({
      message: `Categoría ${isActive ? 'habilitada' : 'inhabilitada'} correctamente`,
      category,
    });
  } catch (error: any) {
    if (error?.code === 'CATEGORY_STATUS_COLUMN_NOT_AVAILABLE') {
      return res.status(409).json({
        message: 'La tabla categories no tiene columna is_active. Ejecuta la migración de categorías.',
      });
    }

    console.error('Error cambiando estado de categoría:', error);
    res.status(500).json({ message: 'Error al actualizar estado de la categoría' });
  }
};

export const deleteCategory = async (req: AuthRequest, res: Response) => {
  const categoryId = parseCategoryId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoría inválido' });
  }

  try {
    const category = await categoryService.setCategoryStatus(categoryId, false);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    await logCategoryAudit(req.user?.id, `CATEGORY_DELETE:${categoryId}`, req.ip);
    res.json({ message: 'Categoría eliminada lógicamente', category });
  } catch (error: any) {
    if (error?.code === 'CATEGORY_STATUS_COLUMN_NOT_AVAILABLE') {
      return res.status(409).json({
        message: 'No se puede eliminar lógicamente sin columna is_active en categories.',
      });
    }

    console.error('Error eliminando categoría:', error);
    res.status(500).json({ message: 'Error al eliminar la categoría' });
  }
};
