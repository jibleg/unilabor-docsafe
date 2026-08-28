import { Router } from 'express';
import {
  addPhaseChecklistItemController,
  addPhaseDocumentController,
  createEffectivenessReviewController,
  enrollEmployeeInPhaseController,
  getEmployeeInductionMasterRecordController,
  getEmployeeInductionMasterRecordPdfController,
  getEmployeeInductionProgressController,
  getMyInductionProgressController,
  listEffectivenessReviewsController,
  listEnrollmentChecklistProgressController,
  listInductionPhasesController,
  listPhaseChecklistItemsController,
  listPhaseEnrollmentsController,
  removePhaseChecklistItemController,
  removePhaseDocumentController,
  setEnrollmentSupervisorController,
  toggleChecklistItemController,
  updatePhaseContactController,
} from '../controllers/rh-induction.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

// El router se monta en /api/rh (ver index.ts), las rutas no repiten el prefijo.

router.get('/induction/phases', requirePermission('RH.INDUCTION.MANAGE'), listInductionPhasesController);
router.patch('/induction/phases/:phaseId/contact', requirePermission('RH.INDUCTION.MANAGE'), updatePhaseContactController);
router.post('/induction/phases/:phaseId/documents', requirePermission('RH.INDUCTION.MANAGE'), addPhaseDocumentController);
router.delete('/induction/phase-documents/:phaseDocumentId', requirePermission('RH.INDUCTION.MANAGE'), removePhaseDocumentController);
router.post('/induction/phases/:phaseId/enroll', requirePermission('RH.INDUCTION.MANAGE'), enrollEmployeeInPhaseController);
router.get('/induction/phases/:phaseId/enrollments', requirePermission('RH.INDUCTION.MANAGE'), listPhaseEnrollmentsController);
router.get('/employees/:employeeId/induction', requirePermission('RH.INDUCTION.MANAGE'), getEmployeeInductionProgressController);

router.get('/induction/phases/:phaseId/checklist-items', requirePermission('RH.INDUCTION.MANAGE'), listPhaseChecklistItemsController);
router.post('/induction/phases/:phaseId/checklist-items', requirePermission('RH.INDUCTION.MANAGE'), addPhaseChecklistItemController);
router.delete('/induction/checklist-items/:checklistItemId', requirePermission('RH.INDUCTION.MANAGE'), removePhaseChecklistItemController);
router.get('/induction/enrollments/:enrollmentId/checklist-progress', requirePermission('RH.INDUCTION.MANAGE'), listEnrollmentChecklistProgressController);
router.put('/induction/enrollments/:enrollmentId/checklist-items/:checklistItemId', requirePermission('RH.INDUCTION.MANAGE'), toggleChecklistItemController);
router.patch('/induction/enrollments/:enrollmentId/supervisor', requirePermission('RH.INDUCTION.MANAGE'), setEnrollmentSupervisorController);

router.get('/employees/:employeeId/induction/effectiveness', requirePermission('RH.INDUCTION.MANAGE'), listEffectivenessReviewsController);
router.post('/employees/:employeeId/induction/effectiveness', requirePermission('RH.INDUCTION.MANAGE'), createEffectivenessReviewController);

router.get('/employees/:employeeId/induction/master-record', requirePermission('RH.INDUCTION.MANAGE'), getEmployeeInductionMasterRecordController);
router.get('/employees/:employeeId/induction/master-record.pdf', requirePermission('RH.INDUCTION.MANAGE'), getEmployeeInductionMasterRecordPdfController);

router.get('/me/induction', requirePermission('RH.SELF.INDUCTION'), getMyInductionProgressController);

export default router;
