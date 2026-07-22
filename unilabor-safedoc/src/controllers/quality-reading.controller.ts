import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  assignReaders,
  cancelReading,
  closePublication,
  getPublicationById,
  listAssignableAreas,
  listPublications,
  listReaders,
  listRepublishCandidates,
  publishReading,
  republishForNewVersion,
  type PublicationStatus,
} from '../services/quality-reading.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

// Errores de dominio -> HTTP. Los codigos los emite el servicio via `fail`.
const ERROR_STATUS: Record<string, number> = {
  QUALITY_READING_NOT_AVAILABLE: 503,
  QUALITY_DOCUMENT_NOT_FOUND: 404,
  QUALITY_DOCUMENT_NOT_ACTIVE: 409,
  QUALITY_DOCUMENT_FILE_MISSING: 409,
  QUALITY_DOCUMENT_NOT_PDF: 400,
  QUALITY_READING_ALREADY_OPEN: 409,
  QUALITY_READING_NOT_FOUND: 404,
  QUALITY_READING_CLOSED: 409,
  QUALITY_READING_NO_READERS: 400,
  QUALITY_READING_ALREADY_SIGNED: 409,
  QUALITY_READING_NO_NEW_VERSION: 409,
};

const mapError = (res: Response, error: any): Response | null => {
  const status = ERROR_STATUS[error?.code];
  if (!status) {
    return null;
  }
  return res.status(status).json({
    message: error?.publicMessage || 'No se pudo completar la operacion sobre la lectura.',
    code: error.code,
  });
};

export const publishReadingController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const publication = await publishReading(req.body, user.id);
    await registerAuditEvent({
      user_id: user.id,
      action: 'QUALITY_READING_PUBLISH',
      module_code: 'QUALITY',
      ip_address: req.ip ?? null,
      entity_type: 'quality_reading_publication',
      entity_id: publication.id,
      document_id: publication.document_id,
      metadata: { title: publication.title_snapshot, pages_total: publication.pages_total },
    });
    return res.status(201).json(publication);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error publicando documento a lectura:', error);
    return res.status(500).json({ message: 'No se pudo publicar el documento a lectura.' });
  }
};

export const listPublicationsController = async (req: AuthRequest, res: Response) => {
  const rawStatus = String(req.query.status ?? '').toLowerCase();
  const status =
    rawStatus === 'open' || rawStatus === 'closed' ? (rawStatus as PublicationStatus) : undefined;

  try {
    return res.json(await listPublications(status ? { status } : {}));
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando publicaciones de lectura:', error);
    return res.status(500).json({ message: 'No se pudieron consultar las publicaciones.' });
  }
};

export const getPublicationController = async (req: AuthRequest, res: Response) => {
  const publicationId = parsePositiveInt(req.params.id);
  if (!publicationId) {
    return res.status(400).json({ message: 'ID de publicacion invalido.' });
  }

  try {
    const publication = await getPublicationById(publicationId);
    if (!publication) {
      return res.status(404).json({ message: 'La publicacion no existe.' });
    }
    return res.json({ publication, readers: await listReaders(publicationId) });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error consultando la publicacion:', error);
    return res.status(500).json({ message: 'No se pudo consultar la publicacion.' });
  }
};

export const assignReadersController = async (req: AuthRequest, res: Response) => {
  const publicationId = parsePositiveInt(req.params.id);
  if (!publicationId) {
    return res.status(400).json({ message: 'ID de publicacion invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const result = await assignReaders(publicationId, req.body, user.id);
    await registerAuditEvent({
      user_id: user.id,
      action: 'QUALITY_READING_ASSIGN',
      module_code: 'QUALITY',
      ip_address: req.ip ?? null,
      entity_type: 'quality_reading_publication',
      entity_id: publicationId,
      metadata: {
        assigned: result.created.length,
        skipped: result.skipped_user_ids.length,
        mode: req.body?.mode,
      },
    });
    return res.status(201).json(result);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error asignando lectores:', error);
    return res.status(500).json({ message: 'No se pudieron asignar los lectores.' });
  }
};

export const closePublicationController = async (req: AuthRequest, res: Response) => {
  const publicationId = parsePositiveInt(req.params.id);
  if (!publicationId) {
    return res.status(400).json({ message: 'ID de publicacion invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const publication = await closePublication(publicationId);
    await registerAuditEvent({
      user_id: user.id,
      action: 'QUALITY_READING_CLOSE',
      module_code: 'QUALITY',
      ip_address: req.ip ?? null,
      entity_type: 'quality_reading_publication',
      entity_id: publicationId,
    });
    return res.json(publication);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error cerrando la publicacion:', error);
    return res.status(500).json({ message: 'No se pudo cerrar la publicacion.' });
  }
};

export const cancelReadingController = async (req: AuthRequest, res: Response) => {
  const readingId = parsePositiveInt(req.params.readingId);
  if (!readingId) {
    return res.status(400).json({ message: 'ID de lectura invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    await cancelReading(readingId);
    await registerAuditEvent({
      user_id: user.id,
      action: 'QUALITY_READING_CANCEL',
      module_code: 'QUALITY',
      ip_address: req.ip ?? null,
      entity_type: 'quality_reading_acknowledgement',
      entity_id: readingId,
    });
    return res.json({ message: 'Lectura cancelada.' });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error cancelando la lectura:', error);
    return res.status(500).json({ message: 'No se pudo cancelar la lectura.' });
  }
};

export const listAssignableAreasController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json(await listAssignableAreas());
  } catch (error) {
    console.error('Error listando areas asignables:', error);
    return res.status(500).json({ message: 'No se pudieron consultar las areas.' });
  }
};

export const listRepublishCandidatesController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json(await listRepublishCandidates());
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando documentos con version nueva:', error);
    return res.status(500).json({ message: 'No se pudieron consultar las versiones nuevas.' });
  }
};

export const republishController = async (req: AuthRequest, res: Response) => {
  const publicationId = parsePositiveInt(req.params.id);
  if (!publicationId) {
    return res.status(400).json({ message: 'ID de publicacion invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const result = await republishForNewVersion(publicationId, req.body ?? {}, user.id);
    await registerAuditEvent({
      user_id: user.id,
      action: 'QUALITY_READING_REPUBLISH',
      module_code: 'QUALITY',
      ip_address: req.ip ?? null,
      entity_type: 'quality_reading_publication',
      entity_id: result.publication.id,
      metadata: {
        previous_publication_id: publicationId,
        readers: result.created.length,
        include_unsigned: Boolean(req.body?.include_unsigned),
      },
    });
    return res.status(201).json(result);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error republicando la version nueva:', error);
    return res.status(500).json({ message: 'No se pudo publicar la version nueva.' });
  }
};
