import { Router } from 'express';
import {
  capturePracticalController,
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
import {
  assignEvaluationController,
  listTemplateAssignmentsController,
} from '../controllers/evaluation-assignment.controller';
import {
  getCertificateTemplateController,
  previewCertificateController,
  uploadCertificateImageController,
  upsertCertificateTemplateController,
} from '../controllers/certificate.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';
import { uploadCertificateImage } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  assignEvaluationSchema,
  capturePracticalSchema,
  createEvaluationTemplateSchema,
  createTrainingCourseSchema,
  replaceQuestionsSchema,
  updateEvaluationTemplateSchema,
  updateTrainingCourseSchema,
  upsertCertificateTemplateSchema,
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

// Asignacion de evaluaciones a colaboradores + seguimiento
router.post(
  '/templates/:templateId/assign',
  validate(assignEvaluationSchema),
  assignEvaluationController,
);
router.get('/templates/:templateId/assignments', listTemplateAssignmentsController);

// Evaluacion practica: captura directa de calificacion (0-10) por RH
router.post('/practical/capture', validate(capturePracticalSchema), capturePracticalController);

// Plantilla de constancia + vista preliminar
router.get('/:courseId/certificate', getCertificateTemplateController);
router.put(
  '/:courseId/certificate',
  validate(upsertCertificateTemplateSchema),
  upsertCertificateTemplateController,
);
router.post(
  '/:courseId/certificate/image',
  uploadCertificateImage.single('file'),
  uploadCertificateImageController,
);
router.get('/:courseId/certificate/preview', previewCertificateController);

export default router;
