import fs from 'fs';
import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  buildEmployeeExpedient,
  canUserAccessEmployeeDocument,
  canUserAccessEmployeeExpedient,
  getEmployeeForAuthenticatedUser,
  listEmployeeDocuments,
  resolveEmployeeDocumentPath,
  uploadEmployeeDocument,
  type EmployeeDocumentPayload,
} from '../services/employee-document.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const getText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseOptionalDate = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
};

const removeUploadedFile = async (path?: string) => {
  if (!path) {
    return;
  }

  try {
    await fs.promises.unlink(path);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.error('No se pudo eliminar archivo RH tras error:', error);
    }
  }
};

const mapEmployeeDocumentError = (res: Response, error: any) => {
  if (error?.code === 'EMPLOYEE_DOCUMENTS_TABLE_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'La tabla employee_documents no existe. Ejecuta la migracion del Sprint 4.',
    });
  }

  if (error?.code === 'EMPLOYEE_NOT_FOUND') {
    return res.status(404).json({ message: 'Colaborador no encontrado.' });
  }

  if (error?.code === 'EMPLOYEE_PROFILE_NOT_FOUND') {
    return res.status(404).json({ message: 'Tu cuenta aun no esta vinculada a un expediente de colaborador.' });
  }

  if (error?.code === 'DOCUMENT_TYPE_NOT_FOUND') {
    return res.status(404).json({ message: 'Tipo documental no encontrado o inactivo.' });
  }

  if (error?.code === 'EXPIRY_DATES_REQUIRED') {
    return res.status(400).json({
      message: 'Este tipo documental requiere fecha de emision y fecha de vencimiento.',
    });
  }

  if (error?.code === 'EXPIRY_DATES_INVALID') {
    return res.status(400).json({
      message: 'Las fechas de vigencia del documento no tienen un formato valido.',
    });
  }

  if (error?.code === 'EXPIRY_MUST_BE_AFTER_ISSUE') {
    return res.status(400).json({
      message: 'La fecha de vencimiento debe ser posterior a la fecha de emision.',
    });
  }

  if (error?.code === 'EMPLOYEE_DOCUMENT_NOT_FOUND') {
    return res.status(404).json({ message: 'Documento RH no encontrado.' });
  }

  if (error?.message === 'FILE_NOT_FOUND') {
    return res.status(404).json({ message: 'El archivo PDF ya no existe fisicamente.' });
  }

  return null;
};

export const getEmployeeExpedientController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.id);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }

  const user = req.user;
  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const canAccess = await canUserAccessEmployeeExpedient(user.id, user.role, employeeId);
    if (!canAccess) {
      return res.status(403).json({ message: 'No tienes acceso al expediente solicitado.' });
    }

    const expedient = await buildEmployeeExpedient(employeeId);
    return res.json(expedient);
  } catch (error: any) {
    const mappedError = mapEmployeeDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo expediente RH:', error);
    return res.status(500).json({ message: 'No se pudo obtener el expediente del colaborador.' });
  }
};

export const listEmployeeDocumentsController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.id);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }

  const user = req.user;
  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const canAccess = await canUserAccessEmployeeExpedient(user.id, user.role, employeeId);
    if (!canAccess) {
      return res.status(403).json({ message: 'No tienes acceso a los documentos de este expediente.' });
    }

    const sectionId = parsePositiveInt(req.query.section_id);
    const documentTypeId = parsePositiveInt(req.query.document_type_id);
    const currentOnly =
      req.query.current_only === undefined
        ? true
        : String(req.query.current_only).trim().toLowerCase() !== 'false';
    const expiryStatusRaw =
      typeof req.query.expiry_status === 'string' ? req.query.expiry_status.trim().toLowerCase() : '';
    const expiryStatus =
      expiryStatusRaw === 'valid' || expiryStatusRaw === 'expiring' || expiryStatusRaw === 'expired'
        ? expiryStatusRaw
        : undefined;

    const documents = await listEmployeeDocuments(employeeId, {
      ...(sectionId ? { section_id: sectionId } : {}),
      ...(documentTypeId ? { document_type_id: documentTypeId } : {}),
      current_only: currentOnly,
      ...(expiryStatus ? { expiry_status: expiryStatus } : {}),
    });

    return res.json({ documents });
  } catch (error: any) {
    const mappedError = mapEmployeeDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando documentos RH:', error);
    return res.status(500).json({ message: 'No se pudieron listar los documentos RH.' });
  }
};

export const uploadEmployeeDocumentController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.id);
  if (!employeeId) {
    await removeUploadedFile(req.file?.path);
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }

  const user = req.user;
  if (!user?.id || !user.role) {
    await removeUploadedFile(req.file?.path);
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Debes adjuntar un archivo PDF.' });
  }

  const documentTypeId = parsePositiveInt(req.body?.document_type_id);
  const title = getText(req.body?.title);

  if (!documentTypeId || !title) {
    await removeUploadedFile(req.file.path);
    return res.status(400).json({
      message: 'El tipo documental y el titulo son obligatorios para cargar el documento.',
    });
  }

  const issueDate = parseOptionalDate(req.body?.issue_date);
  const expiryDate = parseOptionalDate(req.body?.expiry_date);

  if (issueDate === undefined || expiryDate === undefined) {
    await removeUploadedFile(req.file.path);
    return res.status(400).json({ message: 'Las fechas deben tener formato YYYY-MM-DD.' });
  }

  try {
    const canAccess = await canUserAccessEmployeeExpedient(user.id, user.role, employeeId);
    if (!canAccess || (user.role !== 'ADMIN' && user.role !== 'EDITOR')) {
      await removeUploadedFile(req.file.path);
      return res.status(403).json({ message: 'No tienes permiso para cargar documentos RH.' });
    }

    const payload: EmployeeDocumentPayload = {
      document_type_id: documentTypeId,
      title,
      ...(getText(req.body?.description) ? { description: getText(req.body?.description) } : {}),
      ...(issueDate !== undefined ? { issue_date: issueDate } : {}),
      ...(expiryDate !== undefined ? { expiry_date: expiryDate } : {}),
    };

    const document = await uploadEmployeeDocument(employeeId, user.id, req.file, payload);
    return res.status(201).json({
      message: 'Documento RH cargado correctamente.',
      document,
    });
  } catch (error: any) {
    await removeUploadedFile(req.file.path);

    const mappedError = mapEmployeeDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error cargando documento RH:', error);
    return res.status(500).json({ message: 'No se pudo cargar el documento RH.' });
  }
};

export const viewEmployeeDocumentController = async (req: AuthRequest, res: Response) => {
  const documentId = parsePositiveInt(req.params.documentId);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  const user = req.user;
  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const { document, absolutePath } = await resolveEmployeeDocumentPath(documentId);
    const canAccess = await canUserAccessEmployeeDocument(user.id, user.role, documentId);
    if (!canAccess) {
      return res.status(403).json({ message: 'No tienes acceso a este documento RH.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="protected-view.pdf"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
      'Permissions-Policy',
      'clipboard-read=(), clipboard-write=(), display-capture=(), fullscreen=()',
    );
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(absolutePath);
  } catch (error: any) {
    const mappedError = mapEmployeeDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error visualizando documento RH:', error);
    return res.status(500).json({ message: 'No se pudo visualizar el documento RH.' });
  }
};

export const getMyExpedientController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const employee = await getEmployeeForAuthenticatedUser(user.id);
    const expedient = await buildEmployeeExpedient(employee.id);
    return res.json(expedient);
  } catch (error: any) {
    const mappedError = mapEmployeeDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo mi expediente RH:', error);
    return res.status(500).json({ message: 'No se pudo cargar tu expediente.' });
  }
};

export const listMyDocumentsController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const employee = await getEmployeeForAuthenticatedUser(user.id);
    const sectionId = parsePositiveInt(req.query.section_id);
    const documentTypeId = parsePositiveInt(req.query.document_type_id);
    const currentOnly =
      req.query.current_only === undefined
        ? true
        : String(req.query.current_only).trim().toLowerCase() !== 'false';
    const expiryStatusRaw =
      typeof req.query.expiry_status === 'string' ? req.query.expiry_status.trim().toLowerCase() : '';
    const expiryStatus =
      expiryStatusRaw === 'valid' || expiryStatusRaw === 'expiring' || expiryStatusRaw === 'expired'
        ? expiryStatusRaw
        : undefined;

    const documents = await listEmployeeDocuments(employee.id, {
      ...(sectionId ? { section_id: sectionId } : {}),
      ...(documentTypeId ? { document_type_id: documentTypeId } : {}),
      current_only: currentOnly,
      ...(expiryStatus ? { expiry_status: expiryStatus } : {}),
    });

    return res.json({ documents });
  } catch (error: any) {
    const mappedError = mapEmployeeDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando mis documentos RH:', error);
    return res.status(500).json({ message: 'No se pudieron listar tus documentos.' });
  }
};

export const uploadMyDocumentController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id || !user.role) {
    await removeUploadedFile(req.file?.path);
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Debes adjuntar un archivo PDF.' });
  }

  const documentTypeId = parsePositiveInt(req.body?.document_type_id);
  const title = getText(req.body?.title);

  if (!documentTypeId || !title) {
    await removeUploadedFile(req.file.path);
    return res.status(400).json({
      message: 'El tipo documental y el titulo son obligatorios para cargar tu documento.',
    });
  }

  const issueDate = parseOptionalDate(req.body?.issue_date);
  const expiryDate = parseOptionalDate(req.body?.expiry_date);

  if (issueDate === undefined || expiryDate === undefined) {
    await removeUploadedFile(req.file.path);
    return res.status(400).json({ message: 'Las fechas deben tener formato YYYY-MM-DD.' });
  }

  try {
    const employee = await getEmployeeForAuthenticatedUser(user.id);

    const payload: EmployeeDocumentPayload = {
      document_type_id: documentTypeId,
      title,
      ...(getText(req.body?.description) ? { description: getText(req.body?.description) } : {}),
      ...(issueDate !== undefined ? { issue_date: issueDate } : {}),
      ...(expiryDate !== undefined ? { expiry_date: expiryDate } : {}),
    };

    const document = await uploadEmployeeDocument(employee.id, user.id, req.file, payload);
    return res.status(201).json({
      message: 'Documento personal cargado correctamente.',
      document,
    });
  } catch (error: any) {
    await removeUploadedFile(req.file.path);

    const mappedError = mapEmployeeDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error cargando mi documento RH:', error);
    return res.status(500).json({ message: 'No se pudo cargar tu documento.' });
  }
};
