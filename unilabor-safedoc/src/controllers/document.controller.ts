import fs from 'fs';
import { Response } from 'express';
import pool from '../config/db';
import { AuthRequest } from '../types';
import * as categoryService from '../services/category.service';
import * as documentService from '../services/document.service';

const parsePositiveInt = (rawValue: unknown): number | null => {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
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

const parseOptionalQueryText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const parseDocumentId = (rawValue: unknown): string | null => {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  const normalized = String(rawValue).trim();
  if (normalized.length === 0) {
    return null;
  }

  const isNumericId = /^\d+$/.test(normalized);
  const isUuidId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized
    );

  if (!isNumericId && !isUuidId) {
    return null;
  }

  return normalized;
};

const parseOptionalDate = (rawValue: unknown): string | null | undefined => {
  if (rawValue === undefined) {
    return undefined;
  }

  if (rawValue === null) {
    return null;
  }

  const normalized = String(rawValue).trim();
  if (normalized.length === 0) {
    return null;
  }

  const dateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return undefined;
  }

  const year = Number.parseInt(dateMatch[1] ?? '', 10);
  const month = Number.parseInt(dateMatch[2] ?? '', 10);
  const day = Number.parseInt(dateMatch[3] ?? '', 10);

  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsedDate.getTime())) {
    return undefined;
  }

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    return undefined;
  }

  return normalized;
};

const logDocumentAudit = async (
  userId: string | undefined,
  action: string,
  ipAddress: string | undefined,
  documentId?: string | number
): Promise<void> => {
  if (!userId) {
    return;
  }

  try {
    if (documentId) {
      await pool.query(
        'INSERT INTO access_logs (user_id, document_id, action, ip_address) VALUES ($1, $2, $3, $4)',
        [userId, documentId, action, ipAddress ?? null]
      );
      return;
    }

    await pool.query(
      'INSERT INTO access_logs (user_id, action, ip_address) VALUES ($1, $2, $3)',
      [userId, action, ipAddress ?? null]
    );
  } catch (error) {
    console.error('No se pudo registrar auditoria documental:', error);
  }
};

const removeUploadedDocumentIfExists = async (storedPath: string | undefined) => {
  if (!storedPath) {
    return;
  }

  try {
    await fs.promises.unlink(storedPath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.error('No se pudo eliminar el archivo cargado durante rollback/validacion:', error);
    }
  }
};

export const uploadDocument = async (req: AuthRequest, res: Response) => {
  const file = req.file;
  const user = req.user;
  const categoryId = parsePositiveInt(req.body?.category_id);
  const { title, description, publish_date, expiry_date } = req.body;

  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  if (user.role === 'VIEWER') {
    return res.status(403).json({ message: 'No tienes permisos para publicar documentos' });
  }

  if (!file) {
    return res.status(400).json({ message: 'Archivo no proporcionado' });
  }

  if (!categoryId) {
    return res.status(400).json({ message: 'La categoria es obligatoria y debe ser valida' });
  }

  try {
    const categoryExists = await categoryService.ensureActiveCategoryExists(categoryId);
    if (!categoryExists) {
      return res.status(400).json({ message: 'La categoria no existe o esta inactiva' });
    }

    const canUseCategory = await documentService.canUserAccessDocumentCategory(
      user.id,
      user.role,
      categoryId
    );

    if (!canUseCategory) {
      return res.status(403).json({ message: 'No tienes acceso a la categoria seleccionada' });
    }

    const documentId = await documentService.createDocumentWithMetadata({
      title: title || file.originalname,
      file_path: file.path,
      file_size: file.size,
      uploaded_by: user.id,
      category_id: categoryId,
      description: description || '',
      publish_date: publish_date || new Date().toISOString().split('T')[0],
      expiry_date: expiry_date || null,
      ip: req.ip,
    });

    res.status(201).json({ message: 'Documento publicado con exito', docId: documentId });
  } catch (error) {
    console.error('Error subiendo documento:', error);
    res.status(500).json({ message: 'Error interno al procesar el documento' });
  }
};

export const getCategories = async (req: AuthRequest, res: Response) => {
  const user = req.user;

  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  try {
    const categories = await documentService.getAllCategories(user.id, user.role);
    res.json(categories);
  } catch (error) {
    console.error('Error obteniendo categorias:', error);
    res.status(500).json({ message: 'Error al obtener categorias' });
  }
};

export const toggleDocumentStatus = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const documentId = parseDocumentId(req.params.id);
  const status = String(req.body?.status ?? '').trim().toLowerCase();

  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido' });
  }

  if (status !== 'active' && status !== 'inactive') {
    return res.status(400).json({ message: "Estado invalido. Usa 'active' o 'inactive'" });
  }

  try {
    const docResult = await pool.query(
      'SELECT id, category_id, status FROM documents WHERE id = $1 LIMIT 1',
      [documentId]
    );

    const doc = docResult.rows[0];
    if (!doc) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    const canManageDocument = await documentService.canUserAccessDocumentCategory(
      user.id,
      user.role,
      doc.category_id
    );

    if (!canManageDocument) {
      return res.status(403).json({ message: 'No tienes permiso para administrar este documento' });
    }

    if (doc.status === 'superseded') {
      return res.status(409).json({
        message: 'No puedes cambiar el estado de un documento derogado. Debes trabajar sobre la version vigente.',
      });
    }

    await pool.query(
      'UPDATE documents SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, documentId]
    );

    await logDocumentAudit(
      user.id,
      status === 'active' ? 'ENABLE' : 'DISABLE',
      req.ip,
      documentId
    );

    res.json({ message: `Documento marcado como ${status}` });
  } catch (error) {
    console.error('Error actualizando estado de documento:', error);
    res.status(500).json({ message: 'Error al actualizar estado del documento' });
  }
};

export const deleteDocument = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const documentId = parseDocumentId(req.params.id);

  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido' });
  }

  try {
    const docResult = await pool.query(
      'SELECT id, category_id, file_path FROM documents WHERE id = $1 LIMIT 1',
      [documentId]
    );

    const doc = docResult.rows[0];
    if (!doc) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    const canManageDocument = await documentService.canUserAccessDocumentCategory(
      user.id,
      user.role,
      doc.category_id
    );

    if (!canManageDocument) {
      return res.status(403).json({ message: 'No tienes permiso para eliminar este documento' });
    }

    await pool.query(
      'UPDATE documents SET status = $1, updated_at = NOW() WHERE id = $2',
      ['inactive', documentId]
    );

    try {
      const filePath = documentService.resolveStoredDocumentPath(doc.file_path);
      await fs.promises.unlink(filePath);
    } catch (fileError: any) {
      if (fileError?.message !== 'FILE_NOT_FOUND' && fileError?.code !== 'ENOENT') {
        console.error('No se pudo eliminar el archivo fisico del documento:', fileError);
      }
    }

    await logDocumentAudit(user.id, 'DELETE', req.ip, documentId);
    res.json({ message: 'Documento eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando documento:', error);
    res.status(500).json({ message: 'Error al eliminar el documento' });
  }
};

export const updateDocumentMetadata = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const documentId = parseDocumentId(req.params.id);

  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido' });
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'title');
  const hasDescription = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'description');
  const hasPublishDate = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'publish_date');
  const hasExpiryDate = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'expiry_date');
  const hasCategoryId = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'category_id');
  const hasStatus = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'status');

  if (!hasTitle && !hasDescription && !hasPublishDate && !hasExpiryDate && !hasCategoryId && !hasStatus) {
    return res.status(400).json({
      message:
        'Debes enviar al menos un campo para actualizar: title, description, publish_date, expiry_date, category_id o status',
    });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (hasTitle) {
    const title = String(req.body?.title ?? '').trim();
    if (title.length < 2) {
      return res.status(400).json({ message: 'title debe tener al menos 2 caracteres' });
    }

    values.push(title);
    updates.push(`title = $${values.length}`);
  }

  if (hasDescription) {
    const rawDescription = req.body?.description;
    const description =
      rawDescription === null || rawDescription === undefined ? '' : String(rawDescription).trim();

    values.push(description);
    updates.push(`description = $${values.length}`);
  }

  if (hasPublishDate) {
    const parsedPublishDate = parseOptionalDate(req.body?.publish_date);
    if (parsedPublishDate === undefined) {
      return res.status(400).json({ message: 'publish_date debe tener formato YYYY-MM-DD' });
    }

    if (parsedPublishDate === null) {
      return res.status(400).json({ message: 'publish_date no puede ser vacio o nulo' });
    }

    values.push(parsedPublishDate);
    updates.push(`publish_date = $${values.length}`);
  }

  if (hasExpiryDate) {
    const parsedExpiryDate = parseOptionalDate(req.body?.expiry_date);
    if (parsedExpiryDate === undefined) {
      return res.status(400).json({ message: 'expiry_date debe tener formato YYYY-MM-DD o null' });
    }

    values.push(parsedExpiryDate);
    updates.push(`expiry_date = $${values.length}`);
  }

  let requestedCategoryId: number | null = null;
  if (hasCategoryId) {
    requestedCategoryId = parsePositiveInt(req.body?.category_id);
    if (!requestedCategoryId) {
      return res.status(400).json({ message: 'category_id debe ser un entero positivo valido' });
    }
  }

  let requestedStatus: string | null = null;
  if (hasStatus) {
    const status = String(req.body?.status ?? '').trim().toLowerCase();
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ message: "status invalido. Usa 'active' o 'inactive'" });
    }

    requestedStatus = status;
  }

  try {
    const docResult = await pool.query(
      `
        SELECT id, category_id, status
        FROM documents
        WHERE id = $1
        LIMIT 1;
      `,
      [documentId]
    );

    const existingDocument = docResult.rows[0];
    if (!existingDocument) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    const canManageCurrentCategory = await documentService.canUserAccessDocumentCategory(
      user.id,
      user.role,
      existingDocument.category_id
    );
    if (!canManageCurrentCategory) {
      return res.status(403).json({ message: 'No tienes permiso para editar este documento' });
    }

    if (existingDocument.status === 'superseded' && requestedStatus !== null) {
      return res.status(409).json({
        message: 'No puedes cambiar el estado de un documento derogado. Debes trabajar sobre la version vigente.',
      });
    }

    if (requestedCategoryId) {
      const categoryExists = await categoryService.ensureActiveCategoryExists(requestedCategoryId);
      if (!categoryExists) {
        return res.status(400).json({ message: 'La categoria de destino no existe o esta inactiva' });
      }

      const canUseTargetCategory = await documentService.canUserAccessDocumentCategory(
        user.id,
        user.role,
        requestedCategoryId
      );
      if (!canUseTargetCategory) {
        return res.status(403).json({ message: 'No tienes acceso a la categoria de destino' });
      }

      values.push(requestedCategoryId);
      updates.push(`category_id = $${values.length}`);
    }

    if (requestedStatus) {
      values.push(requestedStatus);
      updates.push(`status = $${values.length}`);
    }

    updates.push('updated_at = NOW()');
    values.push(documentId);

    const updateQuery = `
      UPDATE documents
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, title, category_id, description, publish_date, expiry_date, status, updated_at;
    `;

    const updateResult = await pool.query(updateQuery, values);
    const updatedDocument = updateResult.rows[0];

    await logDocumentAudit(user.id, 'UPDATE', req.ip, documentId);
    res.json({
      message: 'Metadata del documento actualizada correctamente',
      document: updatedDocument,
    });
  } catch (error) {
    console.error('Error actualizando metadata de documento:', error);
    res.status(500).json({ message: 'Error al actualizar metadata del documento' });
  }
};

export const replaceDocumentFile = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const file = req.file;
  const documentId = parseDocumentId(req.params.id);

  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido' });
  }

  if (!file) {
    return res.status(400).json({ message: 'Debes enviar el nuevo archivo PDF' });
  }

  const failWithFileCleanup = async (status: number, message: string) => {
    await removeUploadedDocumentIfExists(file.path);
    return res.status(status).json({ message });
  };

  const hasTitle = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'title');
  const hasDescription = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'description');
  const hasPublishDate = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'publish_date');
  const hasExpiryDate = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'expiry_date');
  const hasCategoryId = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'category_id');

  let requestedCategoryId: number | null = null;
  if (hasCategoryId) {
    requestedCategoryId = parsePositiveInt(req.body?.category_id);
    if (!requestedCategoryId) {
      return failWithFileCleanup(400, 'category_id debe ser un entero positivo valido');
    }
  }

  let parsedTitle: string | null = null;
  if (hasTitle) {
    parsedTitle = String(req.body?.title ?? '').trim();
    if (parsedTitle.length < 2) {
      return failWithFileCleanup(400, 'title debe tener al menos 2 caracteres');
    }
  }

  let parsedDescription: string | null = null;
  if (hasDescription) {
    const rawDescription = req.body?.description;
    parsedDescription =
      rawDescription === null || rawDescription === undefined ? '' : String(rawDescription).trim();
  }

  let parsedPublishDate: string | null | undefined;
  if (hasPublishDate) {
    parsedPublishDate = parseOptionalDate(req.body?.publish_date);
    if (parsedPublishDate === undefined) {
      return failWithFileCleanup(400, 'publish_date debe tener formato YYYY-MM-DD');
    }

    if (parsedPublishDate === null) {
      return failWithFileCleanup(400, 'publish_date no puede ser vacio o nulo');
    }
  }

  let parsedExpiryDate: string | null | undefined;
  if (hasExpiryDate) {
    parsedExpiryDate = parseOptionalDate(req.body?.expiry_date);
    if (parsedExpiryDate === undefined) {
      return failWithFileCleanup(400, 'expiry_date debe tener formato YYYY-MM-DD o null');
    }
  }

  try {
    const existingDocument = await documentService.findDocumentForManagement(documentId);
    if (!existingDocument) {
      return failWithFileCleanup(404, 'Documento no encontrado');
    }

    if (existingDocument.status !== 'active') {
      return failWithFileCleanup(
        409,
        'Solo puedes reemplazar documentos vigentes. Los documentos inactivos o derogados no se pueden reemplazar.'
      );
    }

    const canManageCurrentCategory = await documentService.canUserAccessDocumentCategory(
      user.id,
      user.role,
      existingDocument.category_id
    );
    if (!canManageCurrentCategory) {
      return failWithFileCleanup(403, 'No tienes permiso para reemplazar este documento');
    }

    const targetCategoryId = requestedCategoryId ?? existingDocument.category_id;
    if (requestedCategoryId) {
      const categoryExists = await categoryService.ensureActiveCategoryExists(requestedCategoryId);
      if (!categoryExists) {
        return failWithFileCleanup(400, 'La categoria de destino no existe o esta inactiva');
      }

      const canUseTargetCategory = await documentService.canUserAccessDocumentCategory(
        user.id,
        user.role,
        requestedCategoryId
      );
      if (!canUseTargetCategory) {
        return failWithFileCleanup(403, 'No tienes acceso a la categoria de destino');
      }
    }

    const replacementResult = await documentService.replaceDocumentWithNewVersion({
      previous_document_id: documentId,
      title: parsedTitle ?? existingDocument.title,
      file_path: file.path,
      file_size: file.size,
      uploaded_by: user.id,
      category_id: targetCategoryId,
      description: parsedDescription ?? existingDocument.description ?? '',
      publish_date: parsedPublishDate ?? existingDocument.publish_date ?? new Date().toISOString().slice(0, 10),
      expiry_date:
        parsedExpiryDate !== undefined ? parsedExpiryDate : (existingDocument.expiry_date ?? null),
      ip: req.ip,
    });

    res.status(201).json({
      message: 'Documento reemplazado correctamente. La version anterior quedo derogada.',
      supersededDocument: replacementResult.previousDocument,
      document: replacementResult.newDocument,
    });
  } catch (error: any) {
    await removeUploadedDocumentIfExists(file.path);

    if (error?.code === 'DOCUMENT_VERSIONING_NOT_AVAILABLE') {
      return res.status(409).json({
        message: 'El versionado de documentos no esta disponible. Ejecuta la migracion correspondiente.',
      });
    }

    if (error?.code === 'DOCUMENT_NOT_FOUND') {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    if (error?.code === 'DOCUMENT_NOT_ACTIVE' || error?.code === 'DOCUMENT_ALREADY_SUPERSEDED') {
      return res.status(409).json({
        message: 'El documento ya no esta vigente y no puede reemplazarse nuevamente.',
      });
    }

    console.error('Error reemplazando documento:', error);
    res.status(500).json({ message: 'Error al reemplazar el documento' });
  }
};

export const viewDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  const fileName = req.params.filename;

  if (!user?.id || !user.role) {
    res.status(401).json({ message: 'Sesion invalida o expirada' });
    return;
  }

  if (!fileName || typeof fileName !== 'string') {
    res.status(400).json({ message: 'Nombre de archivo invalido o ausente' });
    return;
  }

  try {
    const document = await documentService.findDocumentByFilename(fileName);

    if (!document) {
      res.status(404).json({ message: 'Archivo no encontrado' });
      return;
    }

    if (user.role === 'VIEWER' && document.status !== 'active') {
      res.status(404).json({ message: 'Documento no disponible' });
      return;
    }

    const canView = await documentService.canUserAccessDocumentCategory(
      user.id,
      user.role,
      document.category_id
    );

    if (!canView) {
      res.status(403).json({ message: 'No tienes permiso para visualizar este documento' });
      return;
    }

    const filePath = documentService.resolveStoredDocumentPath(document.file_path);

    await logDocumentAudit(user.id, 'VIEW', req.ip, document.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="protected-view.pdf"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'clipboard-read=(), clipboard-write=(), display-capture=(), fullscreen=()');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.sendFile(filePath);
  } catch (error: any) {
    if (error?.message === 'FILE_NOT_FOUND') {
      res.status(404).json({ message: 'Archivo no encontrado fisicamente' });
      return;
    }

    console.error('Error visualizando documento:', error);
    res.status(500).json({ message: 'Error interno al visualizar el documento' });
  }
};

export const getAllDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  const includeInactiveRequested = parseBooleanQuery(req.query.includeInactive);

  if (!user?.id || !user.role) {
    res.status(401).json({ message: 'Sesion invalida o expirada' });
    return;
  }

  try {
    const includeInactive =
      includeInactiveRequested && (user.role === 'ADMIN' || user.role === 'EDITOR');

    const documents = await documentService.listDocumentsForUser(user.id, user.role, {
      includeInactive,
    });
    res.json(documents);
  } catch (error) {
    console.error('Error al obtener documentos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const searchDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  const includeInactiveRequested = parseBooleanQuery(req.query.includeInactive);
  const title = parseOptionalQueryText(req.query.title);
  const description = parseOptionalQueryText(req.query.description);
  const rawCategoryId = req.query.category_id ?? req.query.categoryId;
  const rawPublishDate = req.query.publish_date ?? req.query.publishDate;
  const rawExpiryDate = req.query.expiry_date ?? req.query.expiryDate;

  if (!user?.id || !user.role) {
    res.status(401).json({ message: 'Sesion invalida o expirada' });
    return;
  }

  const hasCategoryId =
    rawCategoryId !== undefined &&
    rawCategoryId !== null &&
    String(rawCategoryId).trim().length > 0;

  let categoryId: number | undefined;
  if (hasCategoryId) {
    const parsedCategoryId = parsePositiveInt(rawCategoryId);
    if (!parsedCategoryId) {
      res.status(400).json({ message: 'category_id debe ser un entero positivo valido' });
      return;
    }

    categoryId = parsedCategoryId;
  }

  let publishDate: string | undefined;
  if (rawPublishDate !== undefined) {
    const parsedPublishDate = parseOptionalDate(rawPublishDate);
    if (parsedPublishDate === undefined || parsedPublishDate === null) {
      res.status(400).json({ message: 'publish_date debe tener formato YYYY-MM-DD' });
      return;
    }

    publishDate = parsedPublishDate;
  }

  let expiryDate: string | undefined;
  if (rawExpiryDate !== undefined) {
    const parsedExpiryDate = parseOptionalDate(rawExpiryDate);
    if (parsedExpiryDate === undefined || parsedExpiryDate === null) {
      res.status(400).json({ message: 'expiry_date debe tener formato YYYY-MM-DD' });
      return;
    }

    expiryDate = parsedExpiryDate;
  }

  if (!categoryId && !title && !description && !publishDate && !expiryDate) {
    res.status(400).json({
      message:
        'Debes enviar al menos un filtro de busqueda: category_id, title, description, publish_date o expiry_date',
    });
    return;
  }

  try {
    const includeInactive =
      includeInactiveRequested && (user.role === 'ADMIN' || user.role === 'EDITOR');

    const documents = await documentService.searchDocumentsForUser(user.id, user.role, {
      includeInactive,
      filters: {
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(publishDate ? { publish_date: publishDate } : {}),
        ...(expiryDate ? { expiry_date: expiryDate } : {}),
      },
    });

    res.json(documents);
  } catch (error) {
    console.error('Error buscando documentos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
