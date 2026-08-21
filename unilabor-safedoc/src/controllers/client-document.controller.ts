import fs from 'fs';
import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { getClientById } from '../services/client-catalog.service';
import {
  deactivateClientDocument,
  deleteClientDocument,
  findClientDocumentById,
  getClientDocumentHistory,
  listActiveClientDocuments,
  listAllClientDocuments,
  replaceClientDocumentWithNewVersion,
  resolveStoredClientDocumentPath,
  createClientDocument,
} from '../services/client-document.service';
import {
  getNumberId,
  getOptionalDate,
  getText,
  logClientAudit,
  mapClientDocumentError,
} from './client-controller.shared';

const removeUploadedFileIfExists = async (storedPath: string | undefined) => {
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

export const listClientDocumentsController = async (req: AuthRequest, res: Response) => {
  const clientId = getNumberId(req.params.clientId);
  if (!clientId) {
    return res.status(400).json({ message: 'ID de cliente invalido.' });
  }

  const includeAll = String(req.query.all ?? '').trim().toLowerCase() === 'true';

  try {
    const client = await getClientById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Cliente no encontrado.' });
    }

    const documents = includeAll
      ? await listAllClientDocuments(clientId)
      : await listActiveClientDocuments(clientId);

    return res.json({ client, documents });
  } catch (error) {
    console.error('Error listando documentos de cliente:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los documentos del cliente.' });
  }
};

export const getClientDocumentController = async (req: AuthRequest, res: Response) => {
  const documentId = getNumberId(req.params.id);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  try {
    const document = await findClientDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Documento no encontrado.' });
    }

    const history = await getClientDocumentHistory(documentId);
    return res.json({ document, history });
  } catch (error) {
    console.error('Error obteniendo documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo cargar el documento.' });
  }
};

export const uploadClientDocumentController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const file = req.file;
  const clientId = getNumberId(req.params.clientId);
  const categoryId = getNumberId(req.body?.category_id);
  const title = getText(req.body?.title);

  if (!file) {
    return res.status(400).json({ message: 'Archivo no proporcionado.' });
  }

  const failWithFileCleanup = async (status: number, message: string) => {
    await removeUploadedFileIfExists(file.path);
    return res.status(status).json({ message });
  };

  if (!clientId) {
    return failWithFileCleanup(400, 'ID de cliente invalido.');
  }
  if (!categoryId) {
    return failWithFileCleanup(400, 'La categoria es obligatoria.');
  }
  if (!title) {
    return failWithFileCleanup(400, 'El titulo es obligatorio.');
  }

  try {
    const client = await getClientById(clientId);
    if (!client) {
      return failWithFileCleanup(404, 'Cliente no encontrado.');
    }

    const document = await createClientDocument({
      client_id: clientId,
      category_id: categoryId,
      title,
      description: getText(req.body?.description),
      file_path: file.path,
      file_size: file.size,
      uploaded_by: user?.id,
      document_date: getOptionalDate(req.body?.document_date),
      effective_from: getOptionalDate(req.body?.effective_from),
      expiry_date: getOptionalDate(req.body?.expiry_date),
    });

    await logClientAudit(user?.id, 'CLIENT_DOCUMENT_UPLOAD', req.ip, document.id);

    return res.status(201).json({ message: 'Documento cargado correctamente.', document });
  } catch (error: any) {
    await removeUploadedFileIfExists(file.path);

    const mappedError = mapClientDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error cargando documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo cargar el documento.' });
  }
};

export const replaceClientDocumentController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const file = req.file;
  const documentId = getNumberId(req.params.id);

  if (!file) {
    return res.status(400).json({ message: 'Debes enviar el nuevo archivo.' });
  }

  const failWithFileCleanup = async (status: number, message: string) => {
    await removeUploadedFileIfExists(file.path);
    return res.status(status).json({ message });
  };

  if (!documentId) {
    return failWithFileCleanup(400, 'ID de documento invalido.');
  }

  try {
    const existingDocument = await findClientDocumentById(documentId);
    if (!existingDocument) {
      return failWithFileCleanup(404, 'Documento no encontrado.');
    }

    if (existingDocument.status !== 'active') {
      return failWithFileCleanup(
        409,
        'Solo puedes reemplazar documentos vigentes. Los documentos derogados o inactivos no se pueden reemplazar.',
      );
    }

    const requestedCategoryId = getNumberId(req.body?.category_id);
    const requestedTitle = getText(req.body?.title);

    const replacementResult = await replaceClientDocumentWithNewVersion({
      previous_document_id: documentId,
      category_id: requestedCategoryId ?? existingDocument.category_id,
      title: requestedTitle ?? existingDocument.title,
      description:
        req.body?.description !== undefined ? getText(req.body?.description) : existingDocument.description,
      file_path: file.path,
      file_size: file.size,
      uploaded_by: user?.id,
      document_date:
        req.body?.document_date !== undefined
          ? getOptionalDate(req.body?.document_date)
          : existingDocument.document_date,
      effective_from:
        req.body?.effective_from !== undefined
          ? getOptionalDate(req.body?.effective_from)
          : existingDocument.effective_from,
      expiry_date:
        req.body?.expiry_date !== undefined ? getOptionalDate(req.body?.expiry_date) : existingDocument.expiry_date,
    });

    await logClientAudit(user?.id, 'CLIENT_DOCUMENT_REPLACE', req.ip, replacementResult.newDocument.id);

    return res.status(201).json({
      message: 'Documento reemplazado correctamente. La version anterior quedo derogada.',
      supersededDocument: replacementResult.previousDocument,
      document: replacementResult.newDocument,
    });
  } catch (error: any) {
    await removeUploadedFileIfExists(file.path);

    const mappedError = mapClientDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error reemplazando documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo reemplazar el documento.' });
  }
};

export const deactivateClientDocumentController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const documentId = getNumberId(req.params.id);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  try {
    const document = await deactivateClientDocument(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Documento no encontrado.' });
    }

    await logClientAudit(user?.id, 'CLIENT_DOCUMENT_DEACTIVATE', req.ip, documentId);

    return res.json({ message: 'Documento desactivado correctamente.', document });
  } catch (error: any) {
    const mappedError = mapClientDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error desactivando documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo desactivar el documento.' });
  }
};

export const deleteClientDocumentController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const documentId = getNumberId(req.params.id);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  try {
    const removed = await deleteClientDocument(documentId);
    if (!removed) {
      return res.status(404).json({ message: 'Documento no encontrado.' });
    }

    await removeUploadedFileIfExists(removed.file_path);
    await logClientAudit(user?.id, 'CLIENT_DOCUMENT_DELETE', req.ip, documentId);

    return res.json({ message: 'Documento eliminado definitivamente.' });
  } catch (error: any) {
    const mappedError = mapClientDocumentError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error eliminando documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el documento.' });
  }
};

export const viewClientDocumentController = async (req: AuthRequest, res: Response): Promise<void> => {
  const documentId = getNumberId(req.params.id);
  const user = req.user;

  if (!documentId) {
    res.status(400).json({ message: 'ID de documento invalido.' });
    return;
  }

  try {
    const document = await findClientDocumentById(documentId);
    if (!document) {
      res.status(404).json({ message: 'Documento no encontrado.' });
      return;
    }

    const filePath = resolveStoredClientDocumentPath(document.file_path);

    await logClientAudit(user?.id, `CLIENT_DOCUMENT_VIEW:${documentId}`, req.ip, documentId);

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
      res.status(404).json({ message: 'Archivo no encontrado fisicamente.' });
      return;
    }

    console.error('Error visualizando documento de cliente:', error);
    res.status(500).json({ message: 'Error interno al visualizar el documento.' });
  }
};
