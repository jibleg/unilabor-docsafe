import type { Response } from 'express';
import { registerAuditEvent } from '../services/audit.service';

export { getText, getOptionalDate, getNumberId } from './controller-shared-utils';

export const mapClientCatalogError = (res: Response, error: any) => {
  if (error?.code === 'CLIENT_CATEGORY_NAME_REQUIRED') {
    return res.status(400).json({ message: 'El nombre de la categoria es obligatorio.' });
  }

  if (error?.code === 'CLIENT_CATEGORY_CODE_REQUIRED') {
    return res.status(400).json({ message: 'El codigo de la categoria es obligatorio.' });
  }

  if (error?.code === 'CLIENT_CATEGORY_SORT_ORDER_INVALID') {
    return res.status(400).json({ message: 'El orden debe ser un numero entero igual o mayor a cero.' });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ message: 'Ya existe una categoria con ese codigo.' });
  }

  return null;
};

export const mapClientError = (res: Response, error: any) => {
  if (error?.code === 'CLIENT_NAME_REQUIRED') {
    return res.status(400).json({ message: 'El nombre del cliente es obligatorio.' });
  }

  if (error?.code === 'CLIENT_NOT_FOUND') {
    return res.status(404).json({ message: 'Cliente no encontrado.' });
  }

  if (error?.code === 'CLIENT_CONTACT_NAME_REQUIRED') {
    return res.status(400).json({ message: 'El nombre del contacto es obligatorio.' });
  }

  if (error?.code === 'CLIENT_CLASSIFICATION_INVALID') {
    return res
      .status(400)
      .json({ message: 'La clasificacion seleccionada no existe o no es del tipo Cliente.' });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ message: 'Ya existe un cliente con ese nombre.' });
  }

  return null;
};

export const mapClientDocumentError = (res: Response, error: any) => {
  if (error?.code === 'CLIENT_DOCUMENT_NOT_FOUND') {
    return res.status(404).json({ message: 'Documento no encontrado.' });
  }

  if (error?.code === 'CLIENT_DOCUMENT_NOT_ACTIVE' || error?.code === 'CLIENT_DOCUMENT_ALREADY_SUPERSEDED') {
    return res.status(409).json({
      message: 'El documento ya no esta vigente y no puede reemplazarse nuevamente.',
    });
  }

  if (error?.code === 'CLIENT_NOT_FOUND') {
    return res.status(404).json({ message: 'Cliente no encontrado.' });
  }

  if (error?.code === '23503') {
    return res.status(400).json({ message: 'El cliente o la categoria seleccionada no existe.' });
  }

  if (error?.code === 'CLIENT_DOCUMENT_HAS_HISTORY') {
    return res.status(409).json({
      message: 'No se puede eliminar: el documento forma parte de una cadena de versiones. Puedes desactivarlo en su lugar.',
    });
  }

  return null;
};

export const logClientAudit = async (
  userId: string | undefined,
  action: string,
  ipAddress: string | undefined,
  entityId: number,
  entityType = 'client_document',
) => {
  if (!userId) {
    return;
  }

  await registerAuditEvent({
    user_id: userId,
    action,
    ip_address: ipAddress ?? null,
    module_code: 'PROVIDERS',
    entity_type: entityType,
    entity_id: entityId,
  });
};
