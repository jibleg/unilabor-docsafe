import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import { getEmployeeForAuthenticatedUser } from '../services/employee-document.service';
import {
  assignAcknowledgements,
  cancelAcknowledgement,
  getAcknowledgementById,
  listAcknowledgements,
  listAcknowledgementsForEmployee,
  registerReadingProgress,
  signAcknowledgement,
  type AcknowledgementFilters,
  type AcknowledgementStatus,
} from '../services/rh-document-acknowledgement.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const ACKNOWLEDGEMENT_STATUSES: AcknowledgementStatus[] = [
  'pending',
  'in_progress',
  'read',
  'signed',
  'expired',
  'cancelled',
];

// Errores de dominio -> HTTP. Los codigos los emite el servicio via `fail`.
const ERROR_STATUS: Record<string, number> = {
  RH_ACK_TABLE_NOT_AVAILABLE: 503,
  RH_ACK_NO_EMPLOYEES: 400,
  RH_ACK_SOURCE_NOT_PDF: 400,
  RH_INSTITUTIONAL_NOT_FOUND: 404,
  RH_INSTITUTIONAL_FILE_MISSING: 409,
  RH_INSTITUTIONAL_INACTIVE: 409,
  RH_ACK_SOURCE_FILE_MISSING: 409,
  RH_ACK_ALREADY_SIGNED: 409,
  RH_ACK_NOT_FOUND: 404,
  RH_ACK_FORBIDDEN: 403,
  RH_ACK_NOT_TRACKABLE: 409,
  RH_ACK_EXPIRED: 409,
  RH_ACK_INVALID_PAGE: 400,
  RH_ACK_INVALID_SIGNATURE: 400,
  RH_ACK_NOT_READ: 409,
  RH_ACK_SOURCE_CHANGED: 409,
  EMPLOYEE_DOCUMENT_NOT_FOUND: 404,
  EMPLOYEE_PROFILE_NOT_FOUND: 404,
};

// Codigos que nacen fuera del dominio del acuse: no traen `publicMessage`, y sin
// esto el lector solo ve "no se pudo completar" sin saber a quien pedirle ayuda.
const ERROR_MESSAGE: Record<string, string> = {
  EMPLOYEE_PROFILE_NOT_FOUND:
    'Tu cuenta aun no esta vinculada a un expediente de colaborador. Pide a RH que la vincule.',
};

const mapError = (res: Response, error: any): Response | null => {
  const status = ERROR_STATUS[error?.code];
  if (!status) {
    return null;
  }
  return res.status(status).json({
    message:
      error?.publicMessage ||
      ERROR_MESSAGE[error?.code] ||
      'No se pudo completar la operacion sobre el acuse.',
    code: error.code,
  });
};

export const assignAcknowledgementsController = async (req: AuthRequest, res: Response) => {
  const documentId = parsePositiveInt(req.params.documentId);
  if (!documentId) {
    return res.status(400).json({ message: 'ID de documento invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const result = await assignAcknowledgements(documentId, req.body, user.id);

    await registerAuditEvent({
      user_id: user.id,
      action: `RH_ACK_ASSIGN:${documentId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'rh_institutional_document',
      entity_id: documentId,
      metadata: {
        created: result.created.length,
        skipped: result.skipped_employee_ids.length,
        employee_ids: req.body?.employee_ids ?? [],
      },
    });

    return res.status(201).json(result);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error asignando acuse de lectura:', error);
    return res.status(500).json({ message: 'No se pudo solicitar el acuse de lectura.' });
  }
};

export const listAcknowledgementsController = async (req: AuthRequest, res: Response) => {
  const rawStatus = String(req.query.status ?? '').trim();
  if (rawStatus && !ACKNOWLEDGEMENT_STATUSES.includes(rawStatus as AcknowledgementStatus)) {
    return res.status(400).json({ message: 'Estado de acuse invalido.' });
  }

  const filters: AcknowledgementFilters = {};
  if (rawStatus) {
    filters.status = rawStatus as AcknowledgementStatus;
  }
  const employeeId = parsePositiveInt(req.query.employee_id);
  if (employeeId) {
    filters.employee_id = employeeId;
  }
  const documentId = parsePositiveInt(req.query.institutional_document_id);
  if (documentId) {
    filters.institutional_document_id = documentId;
  }

  try {
    return res.json(await listAcknowledgements(filters));
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando acuses de lectura:', error);
    return res.status(500).json({ message: 'No se pudieron consultar los acuses.' });
  }
};

export const listMyAcknowledgementsController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const employee = await getEmployeeForAuthenticatedUser(user.id);
    return res.json(await listAcknowledgementsForEmployee(employee.id));
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando mis acuses de lectura:', error);
    return res.status(500).json({ message: 'No se pudieron consultar tus acuses.' });
  }
};

export const cancelAcknowledgementController = async (req: AuthRequest, res: Response) => {
  const acknowledgementId = parsePositiveInt(req.params.id);
  if (!acknowledgementId) {
    return res.status(400).json({ message: 'ID de acuse invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const cancelled = await cancelAcknowledgement(acknowledgementId);
    if (!cancelled) {
      return res.status(404).json({ message: 'El acuse no existe.' });
    }

    await registerAuditEvent({
      user_id: user.id,
      action: `RH_ACK_CANCEL:${acknowledgementId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'rh_document_acknowledgement',
      entity_id: acknowledgementId,
    });

    return res.status(204).send();
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error cancelando acuse de lectura:', error);
    return res.status(500).json({ message: 'No se pudo cancelar el acuse.' });
  }
};

/**
 * Latido del visor. El cuerpo solo trae la pagina; los segundos los calcula el
 * servidor (ver registerReadingProgress).
 */
export const registerReadingProgressController = async (req: AuthRequest, res: Response) => {
  const acknowledgementId = parsePositiveInt(req.params.id);
  if (!acknowledgementId) {
    return res.status(400).json({ message: 'ID de acuse invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const employee = await getEmployeeForAuthenticatedUser(user.id);
    const progress = await registerReadingProgress(
      acknowledgementId,
      employee.id,
      req.body.page,
    );

    // El detalle pagina por pagina vive en la bitacora de auditoria; la tabla de
    // acuses solo guarda el agregado.
    await registerAuditEvent({
      user_id: user.id,
      action: `RH_ACK_PAGE:${acknowledgementId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'rh_document_acknowledgement',
      entity_id: acknowledgementId,
      employee_id: employee.id,
      metadata: {
        page: req.body.page,
        pages_seen_count: progress.pages_seen_count,
        pages_total: progress.pages_total,
        active_seconds: progress.active_seconds,
        status: progress.status,
      },
    });

    return res.json(progress);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error registrando avance de lectura:', error);
    return res.status(500).json({ message: 'No se pudo registrar el avance de lectura.' });
  }
};

export const signAcknowledgementController = async (req: AuthRequest, res: Response) => {
  const acknowledgementId = parsePositiveInt(req.params.id);
  if (!acknowledgementId) {
    return res.status(400).json({ message: 'ID de acuse invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const employee = await getEmployeeForAuthenticatedUser(user.id);
    const signed = await signAcknowledgement(acknowledgementId, employee.id, {
      signature: req.body.signature,
      user_id: user.id,
      // La procedencia la fija el servidor: si viniera del cuerpo, seria dictada
      // por quien firma y perderia todo valor probatorio.
      ip_address: req.ip ?? null,
      user_agent: req.get('user-agent') ?? null,
    });

    await registerAuditEvent({
      user_id: user.id,
      action: `RH_ACK_SIGN:${acknowledgementId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'rh_document_acknowledgement',
      entity_id: acknowledgementId,
      employee_id: employee.id,
      document_id: signed.signed_document_id,
      metadata: {
        institutional_document_id: signed.institutional_document_id,
        signed_document_id: signed.signed_document_id,
        source_sha256: signed.source_sha256,
        signed_sha256: signed.signed_sha256,
        pages_total: signed.pages_total,
        active_seconds: signed.active_seconds,
      },
    });

    return res.status(201).json(signed);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error firmando acuse de lectura:', error);
    return res.status(500).json({ message: 'No se pudo firmar el acuse.' });
  }
};

export const getAcknowledgementController = async (req: AuthRequest, res: Response) => {
  const acknowledgementId = parsePositiveInt(req.params.id);
  if (!acknowledgementId) {
    return res.status(400).json({ message: 'ID de acuse invalido.' });
  }

  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const acknowledgement = await getAcknowledgementById(acknowledgementId);
    if (!acknowledgement) {
      return res.status(404).json({ message: 'El acuse no existe.' });
    }

    // Autoservicio: el colaborador solo puede ver los acuses propios. RH accede
    // por la ruta con permiso RH.ACKNOWLEDGEMENTS.MANAGE.
    const employee = await getEmployeeForAuthenticatedUser(user.id);
    if (acknowledgement.employee_id !== employee.id) {
      return res.status(403).json({ message: 'No tienes acceso a este acuse.' });
    }

    return res.json(acknowledgement);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error consultando acuse de lectura:', error);
    return res.status(500).json({ message: 'No se pudo consultar el acuse.' });
  }
};
