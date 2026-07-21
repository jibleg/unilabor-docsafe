import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  createInstitutionalDocument,
  deactivateInstitutionalDocument,
  getInstitutionalDocumentById,
  listInstitutionalDocuments,
  resolveInstitutionalDocumentPath,
} from '../services/rh-institutional-document.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const ERROR_STATUS: Record<string, number> = {
  RH_INSTITUTIONAL_TABLE_NOT_AVAILABLE: 503,
  RH_INSTITUTIONAL_NOT_PDF: 400,
  RH_INSTITUTIONAL_TYPE_NOT_FOUND: 400,
  RH_INSTITUTIONAL_NOT_FOUND: 404,
  RH_INSTITUTIONAL_FILE_MISSING: 409,
  RH_INSTITUTIONAL_CREATE_FAILED: 500,
};

const mapError = (res: Response, error: any): Response | null => {
  const status = ERROR_STATUS[error?.code];
  if (!status) {
    return null;
  }
  return res.status(status).json({
    message: error?.publicMessage || 'No se pudo completar la operacion.',
    code: error.code,
  });
};

export const listInstitutionalDocumentsController = async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.include_inactive ?? '') === 'true';
    return res.json(await listInstitutionalDocuments(includeInactive));
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando documentos institucionales:', error);
    return res.status(500).json({ message: 'No se pudieron consultar los documentos.' });
  }
};

export const createInstitutionalDocumentController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'Debes adjuntar el archivo PDF.' });
  }

  try {
    const document = await createInstitutionalDocument(
      req.file,
      {
        title: req.body.title,
        description: req.body.description ?? null,
        target_document_type_id: Number(req.body.target_document_type_id),
      },
      user.id,
    );

    await registerAuditEvent({
      user_id: user.id,
      action: `RH_INSTITUTIONAL_UPLOAD:${document.id}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'rh_institutional_document',
      entity_id: document.id,
      metadata: {
        title: document.title,
        pages_total: document.pages_total,
        sha256: document.sha256,
      },
    });

    return res.status(201).json(document);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error cargando documento institucional:', error);
    return res.status(500).json({ message: 'No se pudo cargar el documento.' });
  }
};

/** Sirve el PDF al visor protegido. */
export const viewInstitutionalDocumentController = async (req: AuthRequest, res: Response) => {
  const documentId = parsePositiveInt(req.params.documentId);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const { absolutePath } = await resolveInstitutionalDocumentPath(documentId);

    await registerAuditEvent({
      user_id: user.id,
      action: `RH_INSTITUTIONAL_VIEW:${documentId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'rh_institutional_document',
      entity_id: documentId,
    });

    // Mismos encabezados de proteccion que el visor de expediente.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="protected-view.pdf"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(absolutePath);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error visualizando documento institucional:', error);
    return res.status(500).json({ message: 'No se pudo visualizar el documento.' });
  }
};

export const deactivateInstitutionalDocumentController = async (
  req: AuthRequest,
  res: Response,
) => {
  const documentId = parsePositiveInt(req.params.id);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const existing = await getInstitutionalDocumentById(documentId);
    if (!existing) {
      return res.status(404).json({ message: 'El documento no existe.' });
    }

    const deactivated = await deactivateInstitutionalDocument(documentId);
    if (!deactivated) {
      return res.status(409).json({ message: 'El documento ya estaba inactivo.' });
    }

    await registerAuditEvent({
      user_id: user.id,
      action: `RH_INSTITUTIONAL_DEACTIVATE:${documentId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'rh_institutional_document',
      entity_id: documentId,
    });

    return res.status(204).send();
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error inactivando documento institucional:', error);
    return res.status(500).json({ message: 'No se pudo inactivar el documento.' });
  }
};
