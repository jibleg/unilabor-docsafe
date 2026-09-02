import { Router } from 'express';
import {
  addPhaseChecklistItemController,
  addPhaseDocumentController,
  closeInductionRecordController,
  createEffectivenessReviewController,
  enablePhaseForPositionController,
  enrollAllEmployeesInPhaseController,
  getPhaseCertificateReadinessController,
  enrollEmployeeInPhaseController,
  unenrollEmployeeFromPhaseController,
  getEmployeeInductionMasterRecordController,
  getEmployeeInductionMasterRecordPdfController,
  getEmployeeInductionProgressController,
  getMyInductionProgressController,
  listEffectivenessReviewsController,
  listEnrollmentChecklistProgressController,
  listInductionPhasesController,
  listPhaseChecklistItemsController,
  listPhaseEnrollmentsController,
  listPhasePositionsController,
  removePhaseChecklistItemController,
  removePhaseDocumentController,
  setEnrollmentSupervisorController,
  toggleChecklistItemController,
  updatePhaseContactController,
  updatePhaseDurationController,
  updatePhaseReadingLimitController,
} from '../controllers/rh-induction.controller';
import {
  deleteQuestionBankItemController,
  generateQuestionBankController,
  listQuestionBankBatchesController,
  listQuestionBankItemsController,
  reviewQuestionBankItemController,
} from '../controllers/rh-question-bank.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { generateQuestionBankSchema, reviewQuestionBankItemSchema } from '../schemas/rh-question-bank.schema';
import { closeInductionRecordSchema } from '../schemas/rh-induction-closure.schema';

const router = Router();

router.use(verifyToken);

// El router se monta en /api/rh (ver index.ts), las rutas no repiten el prefijo.

router.get('/induction/phases', requirePermission('RH.INDUCTION.MANAGE'), listInductionPhasesController);
router.patch('/induction/phases/:phaseId/contact', requirePermission('RH.INDUCTION.MANAGE'), updatePhaseContactController);
router.patch('/induction/phases/:phaseId/duration', requirePermission('RH.INDUCTION.MANAGE'), updatePhaseDurationController);
router.patch('/induction/phases/:phaseId/reading-limit', requirePermission('RH.INDUCTION.MANAGE'), updatePhaseReadingLimitController);
router.get('/induction/phases/:phaseId/certificate-readiness', requirePermission('RH.INDUCTION.MANAGE'), getPhaseCertificateReadinessController);
// Fases POSITION (5-6): habilitacion por puesto (crea la training_course propia).
router.get('/induction/phases/:phaseId/positions', requirePermission('RH.INDUCTION.MANAGE'), listPhasePositionsController);
router.post('/induction/phases/:phaseId/positions/:positionId/enable', requirePermission('RH.INDUCTION.MANAGE'), enablePhaseForPositionController);
router.post('/induction/phases/:phaseId/documents', requirePermission('RH.INDUCTION.MANAGE'), addPhaseDocumentController);
router.delete('/induction/phase-documents/:phaseDocumentId', requirePermission('RH.INDUCTION.MANAGE'), removePhaseDocumentController);
router.post('/induction/phases/:phaseId/enroll', requirePermission('RH.INDUCTION.MANAGE'), enrollEmployeeInPhaseController);
router.post('/induction/phases/:phaseId/enroll-all', requirePermission('RH.INDUCTION.MANAGE'), enrollAllEmployeesInPhaseController);
router.get('/induction/phases/:phaseId/enrollments', requirePermission('RH.INDUCTION.MANAGE'), listPhaseEnrollmentsController);
router.get('/employees/:employeeId/induction', requirePermission('RH.INDUCTION.MANAGE'), getEmployeeInductionProgressController);

router.get('/induction/phases/:phaseId/checklist-items', requirePermission('RH.INDUCTION.MANAGE'), listPhaseChecklistItemsController);
router.post('/induction/phases/:phaseId/checklist-items', requirePermission('RH.INDUCTION.MANAGE'), addPhaseChecklistItemController);
router.delete('/induction/checklist-items/:checklistItemId', requirePermission('RH.INDUCTION.MANAGE'), removePhaseChecklistItemController);
router.get('/induction/enrollments/:enrollmentId/checklist-progress', requirePermission('RH.INDUCTION.MANAGE'), listEnrollmentChecklistProgressController);
router.put('/induction/enrollments/:enrollmentId/checklist-items/:checklistItemId', requirePermission('RH.INDUCTION.MANAGE'), toggleChecklistItemController);
router.patch('/induction/enrollments/:enrollmentId/supervisor', requirePermission('RH.INDUCTION.MANAGE'), setEnrollmentSupervisorController);
router.delete('/induction/enrollments/:enrollmentId', requirePermission('RH.INDUCTION.MANAGE'), unenrollEmployeeFromPhaseController);

router.get('/employees/:employeeId/induction/effectiveness', requirePermission('RH.INDUCTION.MANAGE'), listEffectivenessReviewsController);
router.post('/employees/:employeeId/induction/effectiveness', requirePermission('RH.INDUCTION.MANAGE'), createEffectivenessReviewController);

router.get('/employees/:employeeId/induction/master-record', requirePermission('RH.INDUCTION.MANAGE'), getEmployeeInductionMasterRecordController);
router.get('/employees/:employeeId/induction/master-record.pdf', requirePermission('RH.INDUCTION.MANAGE'), getEmployeeInductionMasterRecordPdfController);
// Cierre formal del REH-REG-005 (3 firmas digitales + archivo en expediente).
router.post(
  '/employees/:employeeId/induction/close',
  requirePermission('RH.INDUCTION.MANAGE'),
  validate(closeInductionRecordSchema),
  closeInductionRecordController,
);

router.get('/me/induction', requirePermission('RH.SELF.INDUCTION'), getMyInductionProgressController);

// Banco de preguntas generado por IA (staging: nunca escribe evaluation_questions directo).
router.post(
  '/induction/phases/:phaseId/question-bank/generate',
  requirePermission('RH.INDUCTION.MANAGE'),
  validate(generateQuestionBankSchema),
  generateQuestionBankController,
);
router.get(
  '/induction/phases/:phaseId/question-bank',
  requirePermission('RH.INDUCTION.MANAGE'),
  listQuestionBankItemsController,
);
router.patch(
  '/induction/question-bank/:itemId',
  requirePermission('RH.INDUCTION.MANAGE'),
  validate(reviewQuestionBankItemSchema),
  reviewQuestionBankItemController,
);
router.delete(
  '/induction/question-bank/:itemId',
  requirePermission('RH.INDUCTION.MANAGE'),
  deleteQuestionBankItemController,
);
router.get(
  '/induction/phases/:phaseId/question-bank/batches',
  requirePermission('RH.INDUCTION.MANAGE'),
  listQuestionBankBatchesController,
);

export default router;
