import fs from 'fs/promises';
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getNumberId, getText, logHelpdeskAudit, mapHelpdeskError } from './helpdesk-controller.shared';
import { registerAuditEvent } from '../services/audit.service';
import {
  listAssetDocuments,
  resolveAssetDocumentPath,
  uploadAssetDocument,
  type HelpdeskAssetDocumentPayload,
} from '../services/helpdesk-asset-document.service';

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

export const listAssetDocumentsController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  try {
    const documents = await listAssetDocuments(assetId, {
      lifecycleEventId: getNumberId(req.query.lifecycle_event_id),
      documentKindId: getNumberId(req.query.document_kind_id),
      currentOnly: req.query.current_only === 'true',
    });
    return res.json({ documents });
  } catch (error: any) {
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando evidencias del activo:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las evidencias del equipo.' });
  }
};

export const uploadAssetDocumentController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    await removeUploadedFile(req.file?.path);
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Debes adjuntar un archivo PDF.' });
  }

  const title = getText(req.body?.title);
  if (!title) {
    await removeUploadedFile(req.file.path);
    return res.status(400).json({ message: 'El titulo del documento es obligatorio.' });
  }

  const payload: HelpdeskAssetDocumentPayload = {
    title,
    document_kind_id: getNumberId(req.body?.document_kind_id),
    lifecycle_event_id: getNumberId(req.body?.lifecycle_event_id),
    reference_key: getText(req.body?.reference_key),
    issued_on: getText(req.body?.issued_on),
    expires_on: getText(req.body?.expires_on),
  };

  try {
    const document = await uploadAssetDocument(
      assetId,
      { path: req.file.path, size: req.file.size, mimetype: req.file.mimetype },
      payload,
      req.user?.id ?? null,
    );

    await logHelpdeskAudit(
      req.user?.id,
      `HELPDESK_ASSET_DOCUMENT_UPLOAD:${document.id}`,
      req.ip,
      document.id,
      'helpdesk_asset_document',
    );

    return res.status(201).json({ message: 'Evidencia cargada correctamente.', document });
  } catch (error: any) {
    await removeUploadedFile(req.file.path);
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error cargando evidencia del activo:', error);
    return res.status(500).json({ message: 'No se pudo cargar la evidencia.' });
  }
};

export const viewAssetDocumentController = async (req: AuthRequest, res: Response) => {
  const documentId = getNumberId(req.params.documentId);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const { document, absolutePath } = await resolveAssetDocumentPath(documentId);

    await registerAuditEvent({
      user_id: user.id,
      action: `HELPDESK_ASSET_DOCUMENT_VIEW:${documentId}`,
      ip_address: req.ip ?? null,
      module_code: 'HELPDESK',
      entity_type: 'helpdesk_asset_document',
      entity_id: documentId,
      metadata: { asset_id: document.asset_id, document_kind_id: document.document_kind_id },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="evidencia.pdf"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(absolutePath);
  } catch (error: any) {
    if (error?.code === 'HELPDESK_ASSET_DOCUMENT_NOT_FOUND' || error?.message === 'FILE_NOT_FOUND') {
      return res.status(404).json({ message: 'Evidencia no encontrada.' });
    }
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error visualizando evidencia del activo:', error);
    return res.status(500).json({ message: 'No se pudo visualizar la evidencia.' });
  }
};
