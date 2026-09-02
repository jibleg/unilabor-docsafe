import type { Response } from 'express';
import type { AuthRequest } from '../types';
import pool from '../config/db';
import { getEmployeeByUserId } from '../services/employee.service';
import {
  addPhaseDocument,
  addPhaseChecklistItem,
  enablePhaseForPosition,
  enrollAllEmployeesInPhase,
  getPhaseCertificateReadiness,
  enrollEmployeeInPhase,
  unenrollEmployeeFromPhase,
  getEmployeeInductionProgress,
  listEnrollmentChecklistProgress,
  listInductionPhases,
  listPhaseChecklistItems,
  listPhaseEnrollments,
  listPhasePositions,
  removePhaseChecklistItem,
  removePhaseDocument,
  setEnrollmentSupervisor,
  toggleChecklistItem,
} from '../services/rh-induction.service';
import { createEffectivenessReview, listEffectivenessReviews } from '../services/rh-induction-effectiveness.service';
import { getEmployeeInductionMasterRecord } from '../services/rh-induction-master-record.service';
import { buildInductionMasterRecordPdf } from '../services/rh-induction-master-record.pdf';
import {
  closeInductionRecord,
  getCurrentInductionClosure,
  getCurrentInductionClosureForPdf,
} from '../services/rh-induction-closure.service';
import { registerAuditEvent } from '../services/audit.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_INDUCTION_PHASE_NOT_FOUND: 404,
  RH_INDUCTION_PHASE_NOT_INSTITUTIONAL: 409,
  RH_INDUCTION_PHASE_NOT_POSITION: 409,
  RH_INDUCTION_POSITION_NOT_FOUND: 404,
  RH_INDUCTION_PHASE_POSITION_NOT_ENABLED: 409,
  RH_INDUCTION_EMPLOYEE_WITHOUT_POSITION: 409,
  RH_INDUCTION_ALREADY_ENROLLED: 409,
  RH_INDUCTION_EMPLOYEE_WITHOUT_USER: 409,
  RH_INDUCTION_PHASE_WITHOUT_DOCUMENTS: 409,
  RH_INDUCTION_BULK_ONLY_INSTITUTIONAL: 409,
  RH_INDUCTION_PHASE_DOCUMENT_DUPLICATE: 409,
  RH_INDUCTION_PHASE_DOCUMENT_NOT_FOUND: 400,
  RH_INDUCTION_PREVIOUS_PHASE_NOT_APPROVED: 409,
  RH_INDUCTION_ENROLLMENT_NOT_FOUND: 404,
  RH_INDUCTION_ENROLLMENT_ALREADY_PASSED: 409,
  RH_INDUCTION_ENROLLMENT_EVALUATION_IN_REVIEW: 409,
  RH_INDUCTION_EMPLOYEE_NOT_FOUND: 404,
};

const mapError = (res: Response, error: any): Response | null => {
  const status = ERROR_STATUS[error?.code];
  if (!status) {
    return null;
  }
  return res.status(status).json({ message: error?.publicMessage || 'No se pudo completar la operacion.' });
};

export const listInductionPhasesController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ phases: await listInductionPhases() });
  } catch (error: any) {
    console.error('Error listando fases de induccion:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las fases de induccion.' });
  }
};

export const enrollEmployeeInPhaseController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  const employeeId = parsePositiveInt(req.body?.employee_id);
  if (!phaseId || !employeeId) {
    return res.status(400).json({ message: 'Fase y colaborador son obligatorios.' });
  }
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  const supervisorEmployeeId = parsePositiveInt(req.body?.supervisor_employee_id);
  try {
    const enrollment = await enrollEmployeeInPhase(employeeId, phaseId, req.user.id, supervisorEmployeeId);
    return res.status(201).json({ message: 'Colaborador inscrito en la fase correctamente.', enrollment });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error inscribiendo colaborador en fase de induccion:', error);
    return res.status(500).json({ message: 'No se pudo inscribir al colaborador.' });
  }
};

export const enrollAllEmployeesInPhaseController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  try {
    const result = await enrollAllEmployeesInPhase(phaseId, req.user.id);
    return res.status(201).json({
      message: `Inscripcion masiva completada: ${result.enrolled} inscrito(s), ${result.skipped.length} omitido(s).`,
      result,
    });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error en inscripcion masiva de induccion:', error);
    return res.status(500).json({ message: 'No se pudo completar la inscripcion masiva.' });
  }
};

export const unenrollEmployeeFromPhaseController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  try {
    await unenrollEmployeeFromPhase(enrollmentId);
    return res.json({ message: 'Inscripcion eliminada correctamente.' });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error eliminando inscripcion de induccion:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la inscripcion.' });
  }
};

export const listPhaseEnrollmentsController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  try {
    return res.json({ enrollments: await listPhaseEnrollments(phaseId) });
  } catch (error: any) {
    console.error('Error listando inscripciones de la fase:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las inscripciones.' });
  }
};

export const getEmployeeInductionProgressController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    return res.json({ progress: await getEmployeeInductionProgress(employeeId) });
  } catch (error: any) {
    console.error('Error consultando progreso de induccion:', error);
    return res.status(500).json({ message: 'No se pudo consultar el progreso de induccion.' });
  }
};

export const getMyInductionProgressController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  try {
    const employee = await getEmployeeByUserId(req.user.id);
    if (!employee) {
      return res.status(409).json({ message: 'Tu usuario no esta vinculado a un colaborador activo de RH.' });
    }
    return res.json({ progress: await getEmployeeInductionProgress(employee.id) });
  } catch (error: any) {
    console.error('Error consultando mi progreso de induccion:', error);
    return res.status(500).json({ message: 'No se pudo consultar tu progreso de induccion.' });
  }
};

export const addPhaseDocumentController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  const documentId = typeof req.body?.document_id === 'string' ? req.body.document_id.trim() : '';
  if (!phaseId || !documentId) {
    return res.status(400).json({ message: 'ID de fase y de documento son obligatorios.' });
  }
  try {
    const document = await addPhaseDocument(phaseId, documentId, Number(req.body?.sort_order ?? 0));
    return res.status(201).json({ message: 'Documento agregado a la fase correctamente.', document });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error agregando documento a la fase:', error);
    return res.status(500).json({ message: 'No se pudo agregar el documento.' });
  }
};

export const removePhaseDocumentController = async (req: AuthRequest, res: Response) => {
  const phaseDocumentId = parsePositiveInt(req.params.phaseDocumentId);
  if (!phaseDocumentId) {
    return res.status(400).json({ message: 'ID invalido.' });
  }
  try {
    const removed = await removePhaseDocument(phaseDocumentId);
    if (!removed) {
      return res.status(404).json({ message: 'Registro no encontrado.' });
    }
    return res.json({ message: 'Documento quitado de la fase correctamente.' });
  } catch (error: any) {
    console.error('Error quitando documento de la fase:', error);
    return res.status(500).json({ message: 'No se pudo quitar el documento.' });
  }
};

export const updatePhaseContactController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  const responsibleName = typeof req.body?.responsible_name === 'string' ? req.body.responsible_name.trim() || null : null;
  const responsiblePhone = typeof req.body?.responsible_phone === 'string' ? req.body.responsible_phone.trim() || null : null;
  try {
    const result = await pool.query(
      `UPDATE public.rh_induction_phases
          SET responsible_name = $1, responsible_phone = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id;`,
      [responsibleName, responsiblePhone, phaseId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Fase no encontrada.' });
    }
    return res.json({ message: 'Contacto de la fase actualizado correctamente.' });
  } catch (error: any) {
    console.error('Error actualizando contacto de fase:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el contacto de la fase.' });
  }
};

export const listPhasePositionsController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  try {
    return res.json({ positions: await listPhasePositions(phaseId) });
  } catch (error: any) {
    console.error('Error listando puestos de la fase:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los puestos de la fase.' });
  }
};

export const enablePhaseForPositionController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  const positionId = parsePositiveInt(req.params.positionId);
  if (!phaseId || !positionId) {
    return res.status(400).json({ message: 'Fase o puesto invalidos.' });
  }
  try {
    const enabled = await enablePhaseForPosition(phaseId, positionId, req.user?.id ?? null);
    return res.status(201).json({
      message: `Fase habilitada para el puesto. Diseña su evaluación en Capacitaciones (curso ${enabled.course_code}).`,
      position: enabled,
    });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error habilitando fase para el puesto:', error);
    return res.status(500).json({ message: 'No se pudo habilitar la fase para el puesto.' });
  }
};

export const updatePhaseDurationController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  const rawDuration = req.body?.duration_hours;
  const durationHours =
    rawDuration === null || rawDuration === undefined || rawDuration === ''
      ? null
      : Number(rawDuration);
  if (durationHours !== null && (!Number.isFinite(durationHours) || durationHours <= 0)) {
    return res.status(400).json({ message: 'La duracion debe ser un numero de horas mayor a 0.' });
  }
  try {
    const result = await pool.query(
      `UPDATE public.rh_induction_phases
          SET duration_hours = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id;`,
      [durationHours, phaseId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Fase no encontrada.' });
    }
    return res.json({ message: 'Duracion de la fase actualizada correctamente.' });
  } catch (error: any) {
    console.error('Error actualizando duracion de fase:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la duracion de la fase.' });
  }
};

export const getPhaseCertificateReadinessController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  try {
    const readiness = await getPhaseCertificateReadiness(phaseId);
    return res.json({ readiness });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error consultando preparacion de constancia de la fase:', error);
    return res.status(500).json({ message: 'No se pudo consultar la preparacion de la constancia.' });
  }
};

export const updatePhaseReadingLimitController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  const raw = req.body?.reading_time_limit_hours;
  const readingLimitHours = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (readingLimitHours !== null && (!Number.isFinite(readingLimitHours) || readingLimitHours <= 0)) {
    return res.status(400).json({ message: 'El limite de lectura debe ser un numero de horas mayor a 0.' });
  }
  try {
    const result = await pool.query(
      `UPDATE public.rh_induction_phases
          SET reading_time_limit_hours = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id;`,
      [readingLimitHours, phaseId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Fase no encontrada.' });
    }
    return res.json({ message: 'Limite de lectura de la fase actualizado correctamente.' });
  } catch (error: any) {
    console.error('Error actualizando limite de lectura de fase:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el limite de lectura de la fase.' });
  }
};

export const setEnrollmentSupervisorController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  const supervisorEmployeeId = parsePositiveInt(req.body?.supervisor_employee_id);
  try {
    const updated = await setEnrollmentSupervisor(enrollmentId, supervisorEmployeeId);
    if (!updated) {
      return res.status(404).json({ message: 'Inscripcion no encontrada.' });
    }
    return res.json({ message: 'Supervisor actualizado correctamente.' });
  } catch (error: any) {
    console.error('Error actualizando supervisor de la inscripcion:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el supervisor.' });
  }
};

export const listPhaseChecklistItemsController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  try {
    return res.json({ items: await listPhaseChecklistItems(phaseId) });
  } catch (error: any) {
    console.error('Error listando checklist de la fase:', error);
    return res.status(500).json({ message: 'No se pudo cargar el checklist.' });
  }
};

export const addPhaseChecklistItemController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  const itemText = typeof req.body?.item_text === 'string' ? req.body.item_text.trim() : '';
  if (!phaseId || !itemText) {
    return res.status(400).json({ message: 'Fase y texto del contenido son obligatorios.' });
  }
  try {
    const item = await addPhaseChecklistItem(phaseId, itemText, Number(req.body?.sort_order ?? 0));
    return res.status(201).json({ message: 'Contenido agregado al checklist correctamente.', item });
  } catch (error: any) {
    console.error('Error agregando contenido al checklist:', error);
    return res.status(500).json({ message: 'No se pudo agregar el contenido.' });
  }
};

export const removePhaseChecklistItemController = async (req: AuthRequest, res: Response) => {
  const checklistItemId = parsePositiveInt(req.params.checklistItemId);
  if (!checklistItemId) {
    return res.status(400).json({ message: 'ID invalido.' });
  }
  try {
    const removed = await removePhaseChecklistItem(checklistItemId);
    if (!removed) {
      return res.status(404).json({ message: 'Registro no encontrado.' });
    }
    return res.json({ message: 'Contenido quitado del checklist correctamente.' });
  } catch (error: any) {
    console.error('Error quitando contenido del checklist:', error);
    return res.status(500).json({ message: 'No se pudo quitar el contenido.' });
  }
};

export const listEnrollmentChecklistProgressController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  try {
    return res.json({ progress: await listEnrollmentChecklistProgress(enrollmentId) });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error consultando progreso del checklist:', error);
    return res.status(500).json({ message: 'No se pudo consultar el checklist.' });
  }
};

export const toggleChecklistItemController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  const checklistItemId = parsePositiveInt(req.params.checklistItemId);
  if (!enrollmentId || !checklistItemId) {
    return res.status(400).json({ message: 'IDs invalidos.' });
  }
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  const completed = Boolean(req.body?.completed);
  try {
    await toggleChecklistItem(enrollmentId, checklistItemId, req.user.id, completed);
    return res.json({ message: 'Checklist actualizado correctamente.' });
  } catch (error: any) {
    console.error('Error actualizando checklist:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el checklist.' });
  }
};

export const listEffectivenessReviewsController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    return res.json({ reviews: await listEffectivenessReviews(employeeId) });
  } catch (error: any) {
    console.error('Error listando seguimientos de eficacia:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los seguimientos de eficacia.' });
  }
};

export const createEffectivenessReviewController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  const reviewDate = typeof req.body?.review_date === 'string' ? req.body.review_date.trim() : '';
  const method = typeof req.body?.method === 'string' ? req.body.method.trim() : '';
  if (!employeeId || !reviewDate || !method) {
    return res.status(400).json({ message: 'Colaborador, fecha y método son obligatorios.' });
  }
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  const resultPercentage =
    req.body?.result_percentage === null || req.body?.result_percentage === undefined || req.body?.result_percentage === ''
      ? null
      : Number(req.body.result_percentage);
  const performsAsExpected =
    req.body?.performs_as_expected === null || req.body?.performs_as_expected === undefined
      ? null
      : Boolean(req.body.performs_as_expected);
  const evidenceNotes = typeof req.body?.evidence_notes === 'string' ? req.body.evidence_notes.trim() || null : null;
  try {
    const review = await createEffectivenessReview({
      employeeId,
      reviewDate,
      method,
      resultPercentage,
      performsAsExpected,
      evidenceNotes,
      reviewedByUserId: req.user.id,
    });
    return res.status(201).json({ message: 'Seguimiento de eficacia registrado correctamente.', review });
  } catch (error: any) {
    console.error('Error registrando seguimiento de eficacia:', error);
    return res.status(500).json({ message: 'No se pudo registrar el seguimiento.' });
  }
};

export const getEmployeeInductionMasterRecordController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    const [record, closure] = await Promise.all([
      getEmployeeInductionMasterRecord(employeeId),
      getCurrentInductionClosure(employeeId),
    ]);
    return res.json({ record: { ...record, closure } });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error consultando el formato de induccion consolidado:', error);
    return res.status(500).json({ message: 'No se pudo consultar el formato de induccion.' });
  }
};

export const closeInductionRecordController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    const closure = await closeInductionRecord({
      employeeId,
      verdict: req.body.verdict,
      closingNotes: req.body.closing_notes ?? null,
      collaboratorSignature: req.body.collaborator_signature,
      rhSignature: req.body.rh_signature,
      areaSignature: req.body.area_signature,
      rhSignatoryName: req.body.rh_signatory_name,
      areaSignatoryName: req.body.area_signatory_name,
      supersede: Boolean(req.body.supersede),
      closedByUserId: req.user?.id ?? null,
    });
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_CLOSE:${employeeId}:${closure.verdict}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_closure',
      entity_id: employeeId,
    });
    return res.status(201).json({ message: 'Formato de Induccion cerrado y archivado en el expediente.', closure });
  } catch (error: any) {
    const CLOSE_ERROR_STATUS: Record<string, number> = {
      RH_INDUCTION_ALREADY_CLOSED: 409,
      RH_INDUCTION_CLOSE_NOT_READY: 409,
      RH_INDUCTION_CLOSE_NOTES_REQUIRED: 400,
      RH_INDUCTION_INVALID_SIGNATURE: 400,
      ARCHIVE_DOCUMENT_TYPE_NOT_FOUND: 409,
    };
    const status = CLOSE_ERROR_STATUS[error?.code];
    if (status) {
      return res.status(status).json({ message: error?.publicMessage || 'No se pudo cerrar el Formato de Induccion.' });
    }
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error cerrando el formato de induccion:', error);
    return res.status(500).json({ message: 'No se pudo cerrar el Formato de Induccion.' });
  }
};

export const getEmployeeInductionMasterRecordPdfController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    const [record, closureForPdf] = await Promise.all([
      getEmployeeInductionMasterRecord(employeeId),
      getCurrentInductionClosureForPdf(employeeId),
    ]);
    const pdf = await buildInductionMasterRecordPdf(
      record,
      closureForPdf
        ? {
            verdictLabel: closureForPdf.closure.verdict_label,
            closedAt: new Date(closureForPdf.closure.created_at),
            closingNotes: closureForPdf.closure.closing_notes,
            collaboratorName: record.employee.full_name,
            rhSignatoryName: closureForPdf.closure.rh_signatory_name,
            areaSignatoryName: closureForPdf.closure.area_signatory_name,
            collaboratorSignaturePng: closureForPdf.signatures.collaborator,
            rhSignaturePng: closureForPdf.signatures.rh,
            areaSignaturePng: closureForPdf.signatures.area,
          }
        : undefined,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="formato-induccion-${record.employee.employee_code}.pdf"`);
    return res.send(pdf);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error generando el PDF del formato de induccion:', error);
    return res.status(500).json({ message: 'No se pudo generar el PDF.' });
  }
};
