import fs from 'fs';
import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  getMyReading,
  listMyReadings,
  loadReaderConstancia,
  registerReadingProgress,
  resolveMyReadingSource,
  resolveSignedCopy,
  signReading,
} from '../services/quality-reading-self.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const ERROR_STATUS: Record<string, number> = {
  QUALITY_READING_NOT_FOUND: 404,
  QUALITY_READING_FORBIDDEN: 403,
  QUALITY_READING_NOT_TRACKABLE: 409,
  QUALITY_READING_EXPIRED: 409,
  QUALITY_READING_INVALID_PAGE: 400,
  QUALITY_READING_INVALID_SIGNATURE: 400,
  QUALITY_READING_NOT_READ: 409,
  QUALITY_READING_ALREADY_SIGNED: 409,
  QUALITY_READING_SOURCE_CHANGED: 409,
  QUALITY_READING_NOT_SIGNED: 409,
  QUALITY_READING_FILE_MISSING: 409,
  QUALITY_DOCUMENT_FILE_MISSING: 409,
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

export const listMyReadingsController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    return res.json(await listMyReadings(user.id));
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando mis lecturas:', error);
    return res.status(500).json({ message: 'No se pudieron consultar tus lecturas.' });
  }
};

export const getMyReadingController = async (req: AuthRequest, res: Response) => {
  const readingId = parsePositiveInt(req.params.id);
  if (!readingId) {
    return res.status(400).json({ message: 'ID de lectura invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    return res.json(await getMyReading(readingId, user.id));
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error consultando mi lectura:', error);
    return res.status(500).json({ message: 'No se pudo consultar la lectura.' });
  }
};

/** Sirve el PDF del SGC al lector. Lo autoriza que la lectura sea suya. */
export const viewMyReadingSourceController = async (req: AuthRequest, res: Response) => {
  const readingId = parsePositiveInt(req.params.id);
  if (!readingId) {
    return res.status(400).json({ message: 'ID de lectura invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const { absolutePath, title } = await resolveMyReadingSource(readingId, user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(title)}.pdf"`);
    return fs.createReadStream(absolutePath).pipe(res);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error sirviendo el documento de la lectura:', error);
    return res.status(500).json({ message: 'No se pudo abrir el documento.' });
  }
};

export const registerReadingProgressController = async (req: AuthRequest, res: Response) => {
  const readingId = parsePositiveInt(req.params.id);
  if (!readingId) {
    return res.status(400).json({ message: 'ID de lectura invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    // El cuerpo solo trae la pagina: los segundos los mide el servidor.
    return res.json(await registerReadingProgress(readingId, user.id, Number(req.body.page)));
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error registrando avance de lectura:', error);
    return res.status(500).json({ message: 'No se pudo registrar el avance.' });
  }
};

export const signReadingController = async (req: AuthRequest, res: Response) => {
  const readingId = parsePositiveInt(req.params.id);
  if (!readingId) {
    return res.status(400).json({ message: 'ID de lectura invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const reading = await signReading(readingId, user.id, {
      signature: String(req.body.signature),
      ip_address: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
    });

    await registerAuditEvent({
      user_id: user.id,
      action: 'QUALITY_READING_SIGN',
      module_code: 'QUALITY',
      ip_address: req.ip ?? null,
      entity_type: 'quality_reading_acknowledgement',
      entity_id: readingId,
      metadata: { document: reading.document_title, pages_total: reading.pages_total },
    });

    return res.json(reading);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error firmando la lectura:', error);
    return res.status(500).json({ message: 'No se pudo firmar la lectura.' });
  }
};

/**
 * Descarga de la constancia de lectura.
 *
 * - Gestor (`manage`): recibe la copia firmada completa (documento + hoja
 *   anexa), que es la evidencia del SGC.
 * - Lector: recibe SOLO la hoja de constancia. El documento es controlado y no
 *   debe poder descargarse; se consulta unicamente en el visor protegido.
 */
export const downloadSignedCopyController =
  (options: { manage?: boolean } = {}) =>
  async (req: AuthRequest, res: Response) => {
    const readingId = parsePositiveInt(req.params.readingId ?? req.params.id);
    if (!readingId) {
      return res.status(400).json({ message: 'ID de lectura invalido.' });
    }

    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ message: 'Sesion invalida o expirada.' });
    }

    try {
      res.setHeader('Content-Type', 'application/pdf');

      if (options.manage) {
        const { absolutePath, fileName } = await resolveSignedCopy(readingId, user.id, {
          allowAnyOwner: true,
        });
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        return fs.createReadStream(absolutePath).pipe(res);
      }

      const { content, fileName } = await loadReaderConstancia(readingId, user.id);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      return res.send(content);
    } catch (error: any) {
      const mapped = mapError(res, error);
      if (mapped) {
        return mapped;
      }
      console.error('Error descargando la copia firmada:', error);
      return res.status(500).json({ message: 'No se pudo descargar la copia firmada.' });
    }
  };
