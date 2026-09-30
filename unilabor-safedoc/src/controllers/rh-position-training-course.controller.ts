import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  linkTrainingCourseToPosition,
  listLinkableTrainingCourses,
  listPositionTrainingCourses,
  unlinkTrainingCourseFromPosition,
} from '../services/rh-competency-course-knowledge.service';
import type { LinkPositionTrainingCourseInput } from '../schemas/rh-competency-evaluation.schema';

/**
 * Catalogo puesto <-> capacitacion (Fase 7): las capacitaciones ligadas a un
 * puesto son la fuente de la seccion 3 (Conocimiento) del REH-REG-003.
 */

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_POSITION_COURSE_NOT_FOUND: 404,
  RH_POSITION_COURSE_NOT_ALLOWED: 409,
  RH_POSITION_NOT_FOUND: 404,
};

const fail = (res: Response, error: any, fallback: string): Response => {
  const status = ERROR_STATUS[error?.code];
  if (status) return res.status(status).json({ message: error?.publicMessage || fallback });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

const audit = (req: AuthRequest, action: string, entityId: number) =>
  registerAuditEvent({ user_id: req.user?.id ?? null, action, ip_address: req.ip ?? null, module_code: 'RH', entity_type: 'rh_position', entity_id: entityId });

/** GET /rh/positions/:id/training-courses */
export const listPositionTrainingCoursesController = async (req: AuthRequest, res: Response) => {
  const positionId = parseId(req.params.id);
  if (!positionId) return res.status(400).json({ message: 'ID de puesto invalido.' });
  try {
    return res.json({ courses: await listPositionTrainingCourses(positionId) });
  } catch (error) {
    return fail(res, error, 'No se pudieron cargar las capacitaciones del puesto.');
  }
};

/** GET /rh/training-courses/linkable - capacitaciones que se pueden ligar a un puesto. */
export const listLinkableTrainingCoursesController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ courses: await listLinkableTrainingCourses() });
  } catch (error) {
    return fail(res, error, 'No se pudo cargar el catalogo de capacitaciones.');
  }
};

/** POST /rh/positions/:id/training-courses {course_id} */
export const linkPositionTrainingCourseController = async (req: AuthRequest, res: Response) => {
  const positionId = parseId(req.params.id);
  if (!positionId) return res.status(400).json({ message: 'ID de puesto invalido.' });
  const { course_id: courseId } = req.body as LinkPositionTrainingCourseInput;
  try {
    const courses = await linkTrainingCourseToPosition(positionId, courseId, req.user?.id ?? null);
    await audit(req, `RH_POSITION_COURSE_LINKED:${positionId}:${courseId}`, positionId);
    return res.status(201).json({ message: 'Capacitacion ligada al puesto.', courses });
  } catch (error) {
    return fail(res, error, 'No se pudo ligar la capacitacion al puesto.');
  }
};

/** DELETE /rh/position-training-courses/:linkId */
export const unlinkPositionTrainingCourseController = async (req: AuthRequest, res: Response) => {
  const linkId = parseId(req.params.linkId);
  if (!linkId) return res.status(400).json({ message: 'ID invalido.' });
  try {
    const positionId = await unlinkTrainingCourseFromPosition(linkId);
    if (!positionId) return res.status(404).json({ message: 'El vinculo no existe.' });
    await audit(req, `RH_POSITION_COURSE_UNLINKED:${positionId}:${linkId}`, positionId);
    return res.json({ message: 'Capacitacion desligada del puesto.', courses: await listPositionTrainingCourses(positionId) });
  } catch (error) {
    return fail(res, error, 'No se pudo desligar la capacitacion.');
  }
};
