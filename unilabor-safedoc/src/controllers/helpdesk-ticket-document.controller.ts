import fs from 'fs/promises';
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getNumberId, getText, logHelpdeskAudit, mapHelpdeskError } from './helpdesk-controller.shared';
import {
  listMyTicketDocuments,
  listTicketDocuments,
  resolveMyTicketDocumentPath,
  resolveTicketDocumentPath,
  uploadMyTicketDocument,
  uploadTicketDocument,
  type HelpdeskTicketDocumentPayload,
} from '../services/helpdesk-ticket-document.service';

const removeUploadedFile = async (filePath?: string) => {
  if (!filePath) {
    return;
  }
  try {
    await fs.unlink(filePath);
  } catch {
    // archivo ya inexistente: nada que hacer
  }
};

export const listTicketDocumentsController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  try {
    const documents = await listTicketDocuments(ticketId);
    return res.json({ documents });
  } catch (error: any) {
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando evidencias del ticket:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las evidencias de la solicitud.' });
  }
};

export const uploadTicketDocumentController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    await removeUploadedFile(req.file?.path);
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Debes adjuntar un archivo PDF o una imagen.' });
  }

  const title = getText(req.body?.title);
  if (!title) {
    await removeUploadedFile(req.file.path);
    return res.status(400).json({ message: 'El titulo de la evidencia es obligatorio.' });
  }

  const payload: HelpdeskTicketDocumentPayload = {
    title,
    document_kind: getText(req.body?.document_kind),
  };

  try {
    const document = await uploadTicketDocument(
      ticketId,
      { path: req.file.path, size: req.file.size, mimetype: req.file.mimetype },
      payload,
      req.user?.id ?? null,
    );

    await logHelpdeskAudit(
      req.user?.id,
      `HELPDESK_TICKET_DOCUMENT_UPLOAD:${document.id}`,
      req.ip,
      ticketId,
      'helpdesk_ticket',
    );

    return res.status(201).json({ message: 'Evidencia cargada correctamente.', document });
  } catch (error: any) {
    await removeUploadedFile(req.file.path);
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error cargando evidencia del ticket:', error);
    return res.status(500).json({ message: 'No se pudo cargar la evidencia.' });
  }
};

export const listMyTicketDocumentsController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  try {
    const documents = await listMyTicketDocuments(ticketId, req.user.id);
    if (!documents) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }
    return res.json({ documents });
  } catch (error: any) {
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando evidencias de mi solicitud:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las evidencias de tu solicitud.' });
  }
};

export const uploadMyTicketDocumentController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!req.user?.id) {
    await removeUploadedFile(req.file?.path);
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!ticketId) {
    await removeUploadedFile(req.file?.path);
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Debes adjuntar un archivo PDF o una imagen.' });
  }

  const title = getText(req.body?.title);
  if (!title) {
    await removeUploadedFile(req.file.path);
    return res.status(400).json({ message: 'El titulo de la evidencia es obligatorio.' });
  }

  const payload: HelpdeskTicketDocumentPayload = {
    title,
    document_kind: getText(req.body?.document_kind),
  };

  try {
    const document = await uploadMyTicketDocument(ticketId, req.user.id, {
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }, payload);

    if (!document) {
      await removeUploadedFile(req.file.path);
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(
      req.user.id,
      `HELPDESK_MY_TICKET_DOCUMENT_UPLOAD:${document.id}`,
      req.ip,
      ticketId,
      'helpdesk_ticket',
    );

    return res.status(201).json({ message: 'Evidencia cargada correctamente.', document });
  } catch (error: any) {
    await removeUploadedFile(req.file.path);
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error cargando evidencia de mi solicitud:', error);
    return res.status(500).json({ message: 'No se pudo cargar la evidencia.' });
  }
};

export const viewTicketDocumentController = async (req: AuthRequest, res: Response) => {
  const documentId = getNumberId(req.params.documentId);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  try {
    const { document, absolutePath } = await resolveTicketDocumentPath(documentId);

    await logHelpdeskAudit(
      req.user?.id,
      `HELPDESK_TICKET_DOCUMENT_VIEW:${documentId}`,
      req.ip,
      document.ticket_id,
      'helpdesk_ticket',
    );

    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', 'inline; filename="evidencia"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(absolutePath);
  } catch (error: any) {
    if (error?.code === 'HELPDESK_TICKET_DOCUMENT_NOT_FOUND' || error?.message === 'FILE_NOT_FOUND') {
      return res.status(404).json({ message: 'Evidencia no encontrada.' });
    }
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error visualizando evidencia del ticket:', error);
    return res.status(500).json({ message: 'No se pudo visualizar la evidencia.' });
  }
};

export const viewMyTicketDocumentController = async (req: AuthRequest, res: Response) => {
  const documentId = getNumberId(req.params.documentId);
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  try {
    const resolved = await resolveMyTicketDocumentPath(documentId, req.user.id);
    if (!resolved) {
      return res.status(404).json({ message: 'Evidencia no encontrada.' });
    }
    const { document, absolutePath } = resolved;

    await logHelpdeskAudit(
      req.user.id,
      `HELPDESK_MY_TICKET_DOCUMENT_VIEW:${documentId}`,
      req.ip,
      document.ticket_id,
      'helpdesk_ticket',
    );

    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', 'inline; filename="evidencia"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(absolutePath);
  } catch (error: any) {
    if (error?.code === 'HELPDESK_TICKET_DOCUMENT_NOT_FOUND' || error?.message === 'FILE_NOT_FOUND') {
      return res.status(404).json({ message: 'Evidencia no encontrada.' });
    }
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error visualizando evidencia de mi solicitud:', error);
    return res.status(500).json({ message: 'No se pudo visualizar la evidencia.' });
  }
};
