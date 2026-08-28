import type { Response } from 'express';
import type { AuthRequest } from '../types';
import pool from '../config/db';
import { getEmployeeByUserId } from '../services/employee.service';
import {
  addPhaseDocument,
  addPhaseChecklistItem,
  enrollEmployeeInPhase,
  getEmployeeInductionProgress,
  listEnrollmentChecklistProgress,
  listInductionPhases,
  listPhaseChecklistItems,
  listPhaseEnrollments,
  removePhaseChecklistItem,
  removePhaseDocument,
  setEnrollmentSupervisor,
  toggleChecklistItem,
} from '../services/rh-induction.service';
import { createEffectivenessReview, listEffectivenessReviews } from '../services/rh-induction-effectiveness.service';
import { getEmployeeInductionMasterRecord } from '../services/rh-induction-master-record.service';
import { buildInductionMasterRecordPdf } from '../services/rh-induction-master-record.pdf';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_INDUCTION_PHASE_NOT_FOUND: 404,
  RH_INDUCTION_PHASE_NOT_INSTITUTIONAL: 409,
  RH_INDUCTION_ALREADY_ENROLLED: 409,
  RH_INDUCTION_EMPLOYEE_WITHOUT_USER: 409,
  RH_INDUCTION_PHASE_WITHOUT_DOCUMENTS: 409,
  RH_INDUCTION_PHASE_DOCUMENT_DUPLICATE: 409,
  RH_INDUCTION_PHASE_DOCUMENT_NOT_FOUND: 400,
  RH_INDUCTION_PREVIOUS_PHASE_NOT_APPROVED: 409,
  RH_INDUCTION_ENROLLMENT_NOT_FOUND: 404,
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
    return res.json({ record: await getEmployeeInductionMasterRecord(employeeId) });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error consultando el formato de induccion consolidado:', error);
    return res.status(500).json({ message: 'No se pudo consultar el formato de induccion.' });
  }
};

export const getEmployeeInductionMasterRecordPdfController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    const record = await getEmployeeInductionMasterRecord(employeeId);
    const pdf = await buildInductionMasterRecordPdf(record);
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
