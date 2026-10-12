import fs from 'fs';
import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { collectUploadedFiles } from '../../middlewares/attendance-upload.middleware';
import { registerAuditEvent } from '../../services/audit.service';
import { AttendanceError, invalid } from '../../services/attendance/attendance-errors';
import {
  addIncidentAttachments,
  cleanupUnregisteredFiles,
  getAttachmentFile,
  softDeleteAttachment,
} from '../../services/attendance/incident-attachments.service';
import {
  buildImportTemplate,
  importIncidents,
  simulateIncidentImport,
} from '../../services/attendance/incident-import.service';
import {
  createIncident,
  getIncidentDetail,
  justifyAbsence,
  listIncidents,
  transitionIncident,
  type IncidentAction,
} from '../../services/attendance/incidents.service';
import {
  createIncidentSchema,
  justifyAbsenceSchema,
  listIncidentsQuerySchema,
  transitionIncidentSchema,
  dateString,
} from '../../schemas/attendance/incidents.schema';
import { handleAttendanceError as handleDomainError, parsePositiveInt } from './attendance-http';

/** Errores de validacion con el mismo formato que el middleware validate: { message, errors }. */
const handleAttendanceError = (res: Response, error: unknown, fallbackMessage: string): Response => {
  if (
    error instanceof AttendanceError &&
    error.code === 'ATTENDANCE_INVALID' &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'errors' in error.details
  ) {
    return res.status(400).json({ message: error.publicMessage, errors: (error.details as { errors: unknown }).errors });
  }
  return handleDomainError(res, error, fallbackMessage);
};

/** Parseo con Zod para entradas que llegan por multipart o query (el middleware validate solo cubre JSON). */
const parseInput = <T>(schema: ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new AttendanceError('ATTENDANCE_INVALID', 'Datos de entrada invalidos', {
      errors: result.error.issues.map((issue) => ({
        field: issue.path.length > 0 ? issue.path.join('.') : '(body)',
        message: issue.message,
      })),
    });
  }
  return result.data;
};

const userIdOf = (req: Request): string => {
  const id = (req as AuthRequest).user?.id;
  if (!id) throw new AttendanceError('ATTENDANCE_UNAUTHENTICATED', 'Sesion invalida o expirada');
  return id;
};

const idParam = (value: unknown, label: string): number => {
  const parsed = parsePositiveInt(value);
  return parsed ?? invalid(`${label} invalido.`);
};

const audit = (
  req: Request,
  action: string,
  entityId: number | null,
  employeeId: number | null,
  metadata: Record<string, unknown>,
): void => {
  void registerAuditEvent({
    user_id: userIdOf(req),
    action,
    ip_address: req.ip ?? null,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_incident',
    entity_id: entityId,
    employee_id: employeeId,
    metadata,
  }).catch(() => undefined);
};

export const list = async (req: Request, res: Response) => {
  try {
    const query = parseInput(listIncidentsQuerySchema, req.query);
    return res.json(await listIncidents(query));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron consultar las incidencias');
  }
};

export const detail = async (req: Request, res: Response) => {
  try {
    return res.json({ incident: await getIncidentDetail(idParam(req.params.id, 'Incidencia')) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo consultar la incidencia');
  }
};

export const create = async (req: Request, res: Response) => {
  const files = collectUploadedFiles(req);
  try {
    const body = parseInput(createIncidentSchema, req.body);
    const created = await createIncident(
        {
          employeeId: body.employee_id,
          incidentTypeId: body.incident_type_id,
          startDate: body.start_date,
          endDate: body.end_date,
          hours: body.hours,
          reason: body.reason,
          imssFolio: body.imss_folio,
          authorize: body.authorize,
          authorizationNotes: body.authorization_notes,
        },
        files,
        userIdOf(req),
      );
    audit(req, 'attendance_incident_created', created.incident.id, body.employee_id, {
      type: created.incident.type.code,
      start_date: created.incident.start_date,
      end_date: created.incident.end_date,
      status: created.incident.status,
      attachments: created.incident.attachments_count,
    });
    return res.status(201).json({ incident: created.incident, warnings: created.warnings });
  } catch (error) {
    await cleanupUnregisteredFiles(files);
    return handleAttendanceError(res, error, 'No se pudo registrar la incidencia');
  }
};

const transition = (action: IncidentAction, auditAction: string, failure: string) =>
  async (req: Request, res: Response) => {
    try {
      const id = idParam(req.params.id, 'Incidencia');
      const { notes } = parseInput(transitionIncidentSchema, req.body);
      const result = await transitionIncident(id, action, notes, userIdOf(req));
      audit(req, auditAction, id, result.incident.employee.id, {
        from: result.previousStatus,
        to: result.incident.status,
        notes: notes ?? null,
      });
      return res.json({ incident: result.incident, warnings: result.warnings });
    } catch (error) {
      return handleAttendanceError(res, error, failure);
    }
  };

export const authorize = transition('authorize', 'attendance_incident_authorized', 'No se pudo autorizar la incidencia');
export const reject = transition('reject', 'attendance_incident_rejected', 'No se pudo rechazar la incidencia');
export const cancel = transition('cancel', 'attendance_incident_cancelled', 'No se pudo cancelar la incidencia');

export const downloadAttachment = async (req: Request, res: Response) => {
  try {
    const incidentId = idParam(req.params.id, 'Incidencia');
    const attachmentId = idParam(req.params.attachmentId, 'Comprobante');
    const file = await getAttachmentFile(incidentId, attachmentId);
    const stat = fs.statSync(file.absolutePath);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.fileName)}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    audit(req, 'attendance_incident_attachment_viewed', incidentId, null, { attachment_id: attachmentId });
    const stream = fs.createReadStream(file.absolutePath);
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo descargar el comprobante');
  }
};

export const addAttachments = async (req: Request, res: Response) => {
  const files = collectUploadedFiles(req);
  try {
    const incidentId = idParam(req.params.id, 'Incidencia');
    const attachments = await addIncidentAttachments(incidentId, files, userIdOf(req));
    audit(req, 'attendance_incident_attachment_added', incidentId, null, {
      files: files.map((file) => file.originalname),
    });
    return res.status(201).json({ attachments });
  } catch (error) {
    await cleanupUnregisteredFiles(files);
    return handleAttendanceError(res, error, 'No se pudieron agregar los comprobantes');
  }
};

export const removeAttachment = async (req: Request, res: Response) => {
  try {
    const incidentId = idParam(req.params.id, 'Incidencia');
    const attachmentId = idParam(req.params.attachmentId, 'Comprobante');
    const removed = await softDeleteAttachment(incidentId, attachmentId, userIdOf(req));
    audit(req, 'attendance_incident_attachment_removed', incidentId, null, {
      attachment_id: attachmentId,
      file: removed.original_file_name,
    });
    return res.json({ incident: await getIncidentDetail(incidentId) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo dar de baja el comprobante');
  }
};

export const justify = async (req: Request, res: Response) => {
  const files = collectUploadedFiles(req);
  try {
    const employeeId = idParam(req.params.employeeId, 'Colaborador');
    const date = parseInput(dateString, req.params.date);
    const { reason } = parseInput(justifyAbsenceSchema, req.body);
    const created = await justifyAbsence(employeeId, date, reason, files, userIdOf(req));
    audit(req, 'attendance_absence_justified', created.incident.id, employeeId, { date, reason });
    return res.status(201).json({ incident: created.incident, warnings: created.warnings });
  } catch (error) {
    await cleanupUnregisteredFiles(files);
    return handleAttendanceError(res, error, 'No se pudo justificar la falta');
  }
};

export const template = async (_req: Request, res: Response) => {
  try {
    const buffer = await buildImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-incidencias.xlsx"');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(buffer);
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo generar la plantilla');
  }
};

const readImportFile = (req: Request): Buffer => {
  const file = req.file;
  if (!file || file.size === 0) return invalid('Adjunta el libro de Excel (.xlsx) en el campo "file".');
  if (!/\.xlsx$/i.test(file.originalname)) return invalid('El archivo debe ser un libro de Excel (.xlsx); descarga la plantilla.');
  return file.buffer;
};

export const simulateImport = async (req: Request, res: Response) => {
  try {
    return res.json(await simulateIncidentImport(readImportFile(req)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo revisar el archivo');
  }
};

export const runImport = async (req: Request, res: Response) => {
  try {
    const result = await importIncidents(readImportFile(req), userIdOf(req));
    audit(req, 'attendance_incidents_imported', null, null, { ...result.summary, file: req.file?.originalname ?? null });
    return res.json(result);
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo importar el archivo');
  }
};
