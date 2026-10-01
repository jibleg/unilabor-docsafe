import fs from 'fs';
import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  loadInductionSignatureSheet,
  resolveInductionReadingDocument,
} from '../services/rh-induction-reading-evidence.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_INDUCTION_ACK_NOT_FOUND: 404,
  RH_INDUCTION_ACK_NOT_SIGNED: 409,
  QUALITY_READING_NOT_FOUND: 404,
  QUALITY_DOCUMENT_FILE_MISSING: 404,
  QUALITY_READING_FILE_MISSING: 404,
  QUALITY_READING_NOT_SIGNED: 409,
};

const fail = (res: Response, error: any, logLabel: string, fallback: string) => {
  const status = ERROR_STATUS[error?.code];
  if (status) {
    return res.status(status).json({ message: error?.publicMessage || fallback });
  }
  console.error(`${logLabel}:`, error);
  return res.status(500).json({ message: fallback });
};

const audit = (req: AuthRequest, action: string, acknowledgementId: number, employeeId: number) =>
  registerAuditEvent({
    user_id: req.user?.id ?? null,
    action: `${action}:${acknowledgementId}`,
    ip_address: req.ip ?? null,
    module_code: 'RH',
    entity_type: 'induction_reading',
    entity_id: acknowledgementId,
    employee_id: employeeId,
  });

/** GET /rh/induction/dashboard/acknowledgements/:acknowledgementId/document (visor protegido) */
export const viewInductionReadingDocumentController = async (req: AuthRequest, res: Response) => {
  const acknowledgementId = parsePositiveInt(req.params.acknowledgementId);
  if (!acknowledgementId) {
    return res.status(400).json({ message: 'ID de lectura invalido.' });
  }
  try {
    const { absolutePath, title, owner } = await resolveInductionReadingDocument(acknowledgementId);
    await audit(req, 'RH_INDUCTION_READING_DOCUMENT_VIEW', acknowledgementId, owner.employee_id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(title)}.pdf"`);
    return fs.createReadStream(absolutePath).pipe(res);
  } catch (error: any) {
    return fail(res, error, 'Error sirviendo documento de induccion a RH', 'No se pudo abrir el documento.');
  }
};

/** GET /rh/induction/dashboard/acknowledgements/:acknowledgementId/signature-sheet (solo hoja de acuse) */
export const viewInductionSignatureSheetController = async (req: AuthRequest, res: Response) => {
  const acknowledgementId = parsePositiveInt(req.params.acknowledgementId);
  if (!acknowledgementId) {
    return res.status(400).json({ message: 'ID de lectura invalido.' });
  }
  try {
    const { content, fileName, owner } = await loadInductionSignatureSheet(acknowledgementId);
    await audit(req, 'RH_INDUCTION_SIGNATURE_SHEET_VIEW', acknowledgementId, owner.employee_id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    return res.send(content);
  } catch (error: any) {
    return fail(res, error, 'Error sirviendo hoja de firma de induccion', 'No se pudo abrir la hoja de firma.');
  }
};
