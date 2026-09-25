import type { Response } from 'express';
import { registerAuditEvent } from '../services/audit.service';

export { getText, getOptionalDate, getNumberId } from './controller-shared-utils';

export const mapProviderCatalogError = (res: Response, error: any) => {
  if (error?.code === 'PROVIDER_CATEGORY_NAME_REQUIRED') {
    return res.status(400).json({ message: 'El nombre de la categoria es obligatorio.' });
  }

  if (error?.code === 'PROVIDER_CATEGORY_CODE_REQUIRED') {
    return res.status(400).json({ message: 'El codigo de la categoria es obligatorio.' });
  }

  if (error?.code === 'PROVIDER_CATEGORY_SORT_ORDER_INVALID') {
    return res.status(400).json({ message: 'El orden debe ser un numero entero igual o mayor a cero.' });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ message: 'Ya existe una categoria con ese codigo.' });
  }

  return null;
};

export const mapProviderError = (res: Response, error: any) => {
  if (error?.code === 'PROVIDER_NAME_REQUIRED') {
    return res.status(400).json({ message: 'El nombre del proveedor es obligatorio.' });
  }

  if (error?.code === 'PROVIDER_NOT_FOUND') {
    return res.status(404).json({ message: 'Proveedor no encontrado.' });
  }

  if (error?.code === 'PROVIDER_CONTACT_NAME_REQUIRED') {
    return res.status(400).json({ message: 'El nombre del contacto es obligatorio.' });
  }

  if (error?.code === 'PROVIDER_CLASSIFICATION_INVALID') {
    return res
      .status(400)
      .json({ message: 'La clasificacion seleccionada no existe o no es del tipo Proveedor.' });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ message: 'Ya existe un proveedor con ese nombre.' });
  }

  return null;
};

export const mapProviderDocumentError = (res: Response, error: any) => {
  if (error?.code === 'PROVIDER_DOCUMENT_NOT_FOUND') {
    return res.status(404).json({ message: 'Documento no encontrado.' });
  }

  if (error?.code === 'PROVIDER_DOCUMENT_NOT_ACTIVE' || error?.code === 'PROVIDER_DOCUMENT_ALREADY_SUPERSEDED') {
    return res.status(409).json({
      message: 'El documento ya no esta vigente: solo los documentos vigentes se pueden reemplazar o editar.',
    });
  }

  if (error?.code === 'PROVIDER_NOT_FOUND') {
    return res.status(404).json({ message: 'Proveedor no encontrado.' });
  }

  if (error?.code === '23503') {
    return res.status(400).json({ message: 'El proveedor o la categoria seleccionada no existe.' });
  }

  if (error?.code === 'PROVIDER_DOCUMENT_HAS_HISTORY') {
    return res.status(409).json({
      message: 'No se puede eliminar: el documento forma parte de una cadena de versiones. Puedes desactivarlo en su lugar.',
    });
  }

  return null;
};

export const logProviderAudit = async (
  userId: string | undefined,
  action: string,
  ipAddress: string | undefined,
  entityId: number,
  entityType = 'provider_document',
  metadata?: Record<string, unknown>,
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
    metadata: metadata ?? null,
  });
};
