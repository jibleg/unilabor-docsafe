import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  createTrainingCourse,
  deactivateTrainingCourse,
  getTrainingCourseById,
  listTrainingCourses,
  updateTrainingCourse,
  type TrainingCoursePayload,
} from '../services/training.service';
import {
  createEvaluationTemplate,
  deactivateEvaluationTemplate,
  getEvaluationTemplateById,
  listTemplatesByCourse,
  replaceTemplateQuestions,
  updateEvaluationTemplate,
  type EvaluationTemplatePayload,
  type QuestionInput,
} from '../services/evaluation-template.service';
import {
  capturePracticalResults,
  type PracticalResultInput,
} from '../services/evaluation-practical.service';

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const mapTrainingError = (res: Response, error: any): Response | null => {
  switch (error?.code) {
    case 'TRAINING_TABLES_NOT_AVAILABLE':
      return res.status(409).json({
        message: 'Las tablas del modulo de evaluaciones no existen. Ejecuta las migraciones del Sprint 31.',
      });
    case 'TRAINING_CODE_ALREADY_EXISTS':
    case '23505':
      return res.status(409).json({ message: 'Ya existe una capacitacion con ese codigo.' });
    case 'TRAINING_COURSE_NOT_FOUND':
      return res.status(404).json({ message: 'La capacitacion indicada no existe o esta inactiva.' });
    case 'RANDOM_COUNT_EXCEEDS_BANK':
      return res.status(400).json({
        message: 'La cantidad de preguntas aleatorias no puede superar el total del banco.',
      });
    case 'EVAL_TEMPLATE_NOT_FOUND':
      return res.status(404).json({ message: 'La evaluacion indicada no existe.' });
    case 'EVAL_TEMPLATE_NOT_PUBLISHED':
      return res.status(409).json({ message: 'La evaluacion no esta activa.' });
    case 'EVAL_TEMPLATE_NOT_PRACTICAL':
      return res.status(400).json({ message: 'Esta captura solo aplica a evaluaciones de tipo practico.' });
    case 'EVAL_PRACTICAL_NO_RESULTS':
      return res.status(400).json({ message: 'Debes capturar la calificacion de al menos un colaborador.' });
    case 'EVAL_PRACTICAL_EMPLOYEE_NOT_FOUND':
      return res.status(404).json({ message: 'Uno o mas colaboradores no existen o estan inactivos.' });
    case 'EVAL_PRACTICAL_SCORE_OUT_OF_RANGE':
      return res.status(400).json({ message: 'La calificacion debe estar entre 0 y 10.' });
    default:
      return null;
  }
};

const logTrainingAudit = async (
  userId: string | undefined,
  action: string,
  entityId: number | null,
  ipAddress: string | undefined,
) => {
  if (!userId) {
    return;
  }
  await registerAuditEvent({
    user_id: userId,
    action,
    ip_address: ipAddress ?? null,
    module_code: 'RH',
    entity_type: 'training',
    entity_id: entityId,
  });
};

// --- Capacitaciones ---

export const listTrainingCoursesController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listTrainingCourses({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      includeInactive: req.query.include_inactive === 'true',
    });
    return res.json(result);
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error listando capacitaciones:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las capacitaciones.' });
  }
};

export const getTrainingCourseController = async (req: AuthRequest, res: Response) => {
  const courseId = parseId(req.params.id);
  if (!courseId) {
    return res.status(400).json({ message: 'ID de capacitacion invalido.' });
  }
  try {
    const course = await getTrainingCourseById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Capacitacion no encontrada.' });
    }
    const templates = await listTemplatesByCourse(courseId);
    return res.json({ course, templates });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error obteniendo capacitacion:', error);
    return res.status(500).json({ message: 'No se pudo obtener la capacitacion.' });
  }
};

export const createTrainingCourseController = async (req: AuthRequest, res: Response) => {
  try {
    const course = await createTrainingCourse(req.body as TrainingCoursePayload, req.user?.id ?? null);
    await logTrainingAudit(req.user?.id, `RH_TRAINING_CREATE:${course.id}`, course.id, req.ip);
    return res.status(201).json({ message: 'Capacitacion creada correctamente.', course });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error creando capacitacion:', error);
    return res.status(500).json({ message: 'No se pudo crear la capacitacion.' });
  }
};

export const updateTrainingCourseController = async (req: AuthRequest, res: Response) => {
  const courseId = parseId(req.params.id);
  if (!courseId) {
    return res.status(400).json({ message: 'ID de capacitacion invalido.' });
  }
  try {
    const course = await updateTrainingCourse(courseId, req.body);
    if (!course) {
      return res.status(404).json({ message: 'Capacitacion no encontrada.' });
    }
    await logTrainingAudit(req.user?.id, `RH_TRAINING_UPDATE:${courseId}`, courseId, req.ip);
    return res.json({ message: 'Capacitacion actualizada correctamente.', course });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error actualizando capacitacion:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la capacitacion.' });
  }
};

export const deleteTrainingCourseController = async (req: AuthRequest, res: Response) => {
  const courseId = parseId(req.params.id);
  if (!courseId) {
    return res.status(400).json({ message: 'ID de capacitacion invalido.' });
  }
  try {
    const course = await deactivateTrainingCourse(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Capacitacion no encontrada.' });
    }
    await logTrainingAudit(req.user?.id, `RH_TRAINING_DELETE:${courseId}`, courseId, req.ip);
    return res.json({ message: 'Capacitacion inactivada correctamente.', course });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error inactivando capacitacion:', error);
    return res.status(500).json({ message: 'No se pudo inactivar la capacitacion.' });
  }
};

// --- Plantillas de evaluacion ---

export const createEvaluationTemplateController = async (req: AuthRequest, res: Response) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) {
    return res.status(400).json({ message: 'ID de capacitacion invalido.' });
  }
  try {
    const template = await createEvaluationTemplate(courseId, req.body as EvaluationTemplatePayload, req.user?.id ?? null);
    await logTrainingAudit(req.user?.id, `RH_EVAL_TEMPLATE_CREATE:${template.id}`, template.id, req.ip);
    return res.status(201).json({ message: 'Evaluacion creada correctamente.', template });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error creando evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo crear la evaluacion.' });
  }
};

export const getEvaluationTemplateController = async (req: AuthRequest, res: Response) => {
  const templateId = parseId(req.params.templateId);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const template = await getEvaluationTemplateById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Evaluacion no encontrada.' });
    }
    return res.json({ template });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error obteniendo evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo obtener la evaluacion.' });
  }
};

export const updateEvaluationTemplateController = async (req: AuthRequest, res: Response) => {
  const templateId = parseId(req.params.templateId);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const template = await updateEvaluationTemplate(templateId, req.body as EvaluationTemplatePayload);
    if (!template) {
      return res.status(404).json({ message: 'Evaluacion no encontrada.' });
    }
    await logTrainingAudit(req.user?.id, `RH_EVAL_TEMPLATE_UPDATE:${templateId}`, templateId, req.ip);
    return res.json({ message: 'Evaluacion actualizada correctamente.', template });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error actualizando evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la evaluacion.' });
  }
};

export const deleteEvaluationTemplateController = async (req: AuthRequest, res: Response) => {
  const templateId = parseId(req.params.templateId);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const deleted = await deactivateEvaluationTemplate(templateId);
    if (!deleted) {
      return res.status(404).json({ message: 'Evaluacion no encontrada.' });
    }
    await logTrainingAudit(req.user?.id, `RH_EVAL_TEMPLATE_DELETE:${templateId}`, templateId, req.ip);
    return res.json({ message: 'Evaluacion inactivada correctamente.' });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error inactivando evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo inactivar la evaluacion.' });
  }
};

export const replaceTemplateQuestionsController = async (req: AuthRequest, res: Response) => {
  const templateId = parseId(req.params.templateId);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const template = await replaceTemplateQuestions(templateId, req.body.questions as QuestionInput[]);
    if (!template) {
      return res.status(404).json({ message: 'Evaluacion no encontrada.' });
    }
    await logTrainingAudit(req.user?.id, `RH_EVAL_QUESTIONS_REPLACE:${templateId}`, templateId, req.ip);
    return res.json({ message: 'Banco de preguntas actualizado correctamente.', template });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error guardando banco de preguntas:', error);
    return res.status(500).json({ message: 'No se pudo guardar el banco de preguntas.' });
  }
};

// --- Evaluacion practica: captura directa de calificacion por RH ---

export const capturePracticalController = async (req: AuthRequest, res: Response) => {
  const templateId = parseId(req.body?.template_id);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const summary = await capturePracticalResults(
      templateId,
      typeof req.body?.captured_at === 'string' ? req.body.captured_at : null,
      req.body.results as PracticalResultInput[],
      req.user?.id ?? null,
    );
    await logTrainingAudit(
      req.user?.id,
      `RH_EVAL_PRACTICAL_CAPTURE:${templateId}:${summary.results.length}`,
      templateId,
      req.ip,
    );
    return res.status(201).json({ message: 'Calificaciones registradas correctamente.', summary });
  } catch (error: any) {
    const mapped = mapTrainingError(res, error);
    if (mapped) return mapped;
    console.error('Error capturando evaluacion practica:', error);
    return res.status(500).json({ message: 'No se pudieron registrar las calificaciones.' });
  }
};
