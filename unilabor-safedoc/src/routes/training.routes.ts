import { Router } from 'express';
import {
  createEvaluationTemplateController,
  createTrainingCourseController,
  deleteEvaluationTemplateController,
  deleteTrainingCourseController,
  getEvaluationTemplateController,
  getTrainingCourseController,
  listTrainingCoursesController,
  replaceTemplateQuestionsController,
  updateEvaluationTemplateController,
  updateTrainingCourseController,
} from '../controllers/training.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createEvaluationTemplateSchema,
  createTrainingCourseSchema,
  replaceQuestionsSchema,
  updateEvaluationTemplateSchema,
  updateTrainingCourseSchema,
} from '../schemas/training.schema';

/**
 * Rutas del modulo de Evaluaciones de capacitacion (ISO 15189).
 * Montadas en /api/rh/trainings. Solo RH ADMIN/EDITOR pueden disenar.
 */
const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'), authorizeModuleRole('RH', ['ADMIN', 'EDITOR']));

// Capacitaciones
router.get('/', listTrainingCoursesController);
router.post('/', validate(createTrainingCourseSchema), createTrainingCourseController);
router.get('/:id', getTrainingCourseController);
router.patch('/:id', validate(updateTrainingCourseSchema), updateTrainingCourseController);
router.delete('/:id', deleteTrainingCourseController);

// Plantillas de evaluacion (banco de preguntas incluido)
router.post(
  '/:courseId/templates',
  validate(createEvaluationTemplateSchema),
  createEvaluationTemplateController,
);
router.get('/templates/:templateId', getEvaluationTemplateController);
router.patch(
  '/templates/:templateId',
  validate(updateEvaluationTemplateSchema),
  updateEvaluationTemplateController,
);
router.delete('/templates/:templateId', deleteEvaluationTemplateController);
router.put(
  '/templates/:templateId/questions',
  validate(replaceQuestionsSchema),
  replaceTemplateQuestionsController,
);

export default router;
