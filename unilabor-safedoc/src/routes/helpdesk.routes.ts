import { Router } from 'express';
import {
  addHelpdeskTicketCommentController,
  addMaintenanceScheduleController,
  addMyHelpdeskTicketCommentController,
  closeMaintenanceOrderController,
  confirmMyHelpdeskTicketFunctionalityController,
  createHelpdeskAssetController,
  createAssetComponentController,
  attachAssetComponentController,
  detachAssetComponentController,
  createHelpdeskCatalogItemController,
  createMaintenancePlanController,
  createHelpdeskTicketController,
  createMyHelpdeskTicketController,
  deactivateHelpdeskCatalogItemController,
  deleteHelpdeskCatalogItemController,
  deleteHelpdeskAssetController,
  evaluateHelpdeskTicketIsoRiskController,
  getHelpdeskAssetByIdController,
  getHelpdeskDashboardController,
  getHelpdeskOrgStructureController,
  getHelpdeskSummaryController,
  getHelpdeskTicketByIdController,
  getMyHelpdeskTicketByIdController,
  listHelpdeskCatalogAdminDataController,
  listHelpdeskAssetsController,
  getAssetReviewProgressController,
  setAssetReviewStatusController,
  listHelpdeskCatalogsController,
  listHelpdeskTicketCatalogsController,
  listHelpdeskTicketsController,
  getHelpdeskTicketStatsController,
  listMyHelpdeskAssetsController,
  listMyHelpdeskTicketsController,
  listMaintenanceCatalogsController,
  listMaintenanceOrdersController,
  listMaintenancePlansController,
  rescheduleMaintenanceOrderController,
  releaseHelpdeskTicketTechnicallyController,
  setAreaResponsiblesController,
  setUnitAreasController,
  solveHelpdeskTicketController,
  startMaintenanceOrderController,
  updateHelpdeskAssetController,
  updateHelpdeskCatalogItemController,
  updateMaintenancePlanController,
  updateHelpdeskTicketController,
  validateHelpdeskTicketReturnController,
} from '../controllers/helpdesk.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  helpdeskAssetSchema,
  assetComponentSchema,
  assetComponentAttachSchema,
  helpdeskCatalogItemSchema,
  helpdeskTicketCommentSchema,
  helpdeskTicketIsoRiskSchema,
  helpdeskTicketSchema,
  helpdeskTicketSolveSchema,
  helpdeskTicketTechnicalReleaseSchema,
  helpdeskTicketValidateReturnSchema,
  maintenanceOrderCloseSchema,
  maintenanceOrderRescheduleSchema,
  maintenancePlanSchema,
  calibrationOrderCloseSchema,
  calibrationOrderRescheduleSchema,
  calibrationPlanSchema,
  scheduleDatesSchema,
  lifecycleEventSchema,
  unitAreasSchema,
  areaResponsiblesSchema,
  handoverSchema,
  handoverSignSchema,
  handoverVoidSchema,
  assetMovementSchema,
} from '../schemas/helpdesk.schema';
import {
  createLifecycleEventController,
  getAssetExpedientController,
  getLifecycleEventDetailController,
  listAssetLifecycleEventsController,
  updateLifecycleEventController,
} from '../controllers/helpdesk-lifecycle.controller';
import {
  addCalibrationScheduleController,
  closeCalibrationOrderController,
  createCalibrationPlanController,
  listCalibrationCatalogsController,
  listCalibrationOrdersController,
  listCalibrationPlansController,
  rescheduleCalibrationOrderController,
  startCalibrationOrderController,
  updateCalibrationPlanController,
} from '../controllers/helpdesk-calibration.controller';
import {
  listAssetDocumentsController,
  uploadAssetDocumentController,
  viewAssetDocumentController,
} from '../controllers/helpdesk-asset-document.controller';
import {
  createHandoverController,
  deleteHandoverController,
  getHandoverByIdController,
  listHandoverPendingAssetsController,
  listHandoversController,
  signHandoverController,
  updateHandoverController,
  viewHandoverActaController,
  voidHandoverController,
} from '../controllers/helpdesk-handover.controller';
import {
  createAssetMovementController,
  listAssetMovementsController,
  viewMovementSignatureController,
} from '../controllers/helpdesk-asset-movement.controller';
import { upload } from '../middlewares/upload.middleware';

const router = Router();

router.use(verifyToken, authorizeModuleAccess('HELPDESK'));

router.get(
  '/summary',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getHelpdeskSummaryController,
);
router.get(
  '/dashboard',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getHelpdeskDashboardController,
);
router.get(
  '/me/assets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listMyHelpdeskAssetsController,
);
router.get(
  '/me/tickets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listMyHelpdeskTicketsController,
);
router.get(
  '/me/tickets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getMyHelpdeskTicketByIdController,
);
router.post(
  '/me/tickets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  validate(helpdeskTicketSchema),
  createMyHelpdeskTicketController,
);
router.post(
  '/me/tickets/:id/comments',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  validate(helpdeskTicketCommentSchema),
  addMyHelpdeskTicketCommentController,
);
router.post(
  '/me/tickets/:id/confirm-functionality',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  confirmMyHelpdeskTicketFunctionalityController,
);
router.get(
  '/catalogs',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listHelpdeskCatalogsController,
);
router.get(
  '/ticket-catalogs',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listHelpdeskTicketCatalogsController,
);
router.get(
  '/maintenance-catalogs',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listMaintenanceCatalogsController,
);
router.get(
  '/catalog-admin',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  listHelpdeskCatalogAdminDataController,
);
router.post(
  '/catalog-admin/:catalogKey',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  validate(helpdeskCatalogItemSchema),
  createHelpdeskCatalogItemController,
);
router.patch(
  '/catalog-admin/:catalogKey/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  validate(helpdeskCatalogItemSchema),
  updateHelpdeskCatalogItemController,
);
router.post(
  '/catalog-admin/:catalogKey/:id/deactivate',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  deactivateHelpdeskCatalogItemController,
);
router.delete(
  '/catalog-admin/:catalogKey/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  deleteHelpdeskCatalogItemController,
);

// --- Estructura organizacional (Unidad <-> Area <-> Responsables) ---
router.get(
  '/org-structure',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getHelpdeskOrgStructureController,
);
router.put(
  '/units/:unitId/areas',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  validate(unitAreasSchema),
  setUnitAreasController,
);
router.put(
  '/areas/:areaId/responsibles',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  validate(areaResponsiblesSchema),
  setAreaResponsiblesController,
);

// --- Acta de entrega-recepcion de activos (ISO 15189:2022) ---
// Las rutas literales van antes de '/handovers/:id' para no capturarlas como :id.
router.get(
  '/handovers/pending-assets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  listHandoverPendingAssetsController,
);
router.get(
  '/handovers',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  listHandoversController,
);
router.post(
  '/handovers',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(handoverSchema),
  createHandoverController,
);
router.get(
  '/handovers/:id/acta',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  viewHandoverActaController,
);
router.get(
  '/handovers/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getHandoverByIdController,
);
router.patch(
  '/handovers/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(handoverSchema),
  updateHandoverController,
);
router.post(
  '/handovers/:id/sign',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(handoverSignSchema),
  signHandoverController,
);
router.post(
  '/handovers/:id/void',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(handoverVoidSchema),
  voidHandoverController,
);
router.delete(
  '/handovers/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  deleteHandoverController,
);

// --- Movimientos del activo (cambio de unidad/area/categoria/responsable) ---
router.get(
  '/movements',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  listAssetMovementsController,
);
router.post(
  '/movements',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(assetMovementSchema),
  createAssetMovementController,
);
router.get(
  '/movements/:id/signature',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  viewMovementSignatureController,
);
router.get(
  '/maintenance/plans',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listMaintenancePlansController,
);
router.get(
  '/maintenance/orders',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listMaintenanceOrdersController,
);
router.post(
  '/maintenance/plans',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(maintenancePlanSchema),
  createMaintenancePlanController,
);
router.patch(
  '/maintenance/plans/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(maintenancePlanSchema),
  updateMaintenancePlanController,
);
router.post(
  '/maintenance/orders/:id/start',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  startMaintenanceOrderController,
);
router.post(
  '/maintenance/orders/:id/reschedule',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(maintenanceOrderRescheduleSchema),
  rescheduleMaintenanceOrderController,
);
router.post(
  '/maintenance/orders/:id/close',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(maintenanceOrderCloseSchema),
  closeMaintenanceOrderController,
);
router.post(
  '/maintenance/plans/:id/schedule',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(scheduleDatesSchema),
  addMaintenanceScheduleController,
);

// --- Calibracion (ISO 15189:2022, control metrologico 6.5) ---
router.get(
  '/calibration-catalogs',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listCalibrationCatalogsController,
);
router.get(
  '/calibration/plans',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listCalibrationPlansController,
);
router.get(
  '/calibration/orders',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listCalibrationOrdersController,
);
router.post(
  '/calibration/plans',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(calibrationPlanSchema),
  createCalibrationPlanController,
);
router.patch(
  '/calibration/plans/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(calibrationPlanSchema),
  updateCalibrationPlanController,
);
router.post(
  '/calibration/orders/:id/start',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  startCalibrationOrderController,
);
router.post(
  '/calibration/orders/:id/reschedule',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(calibrationOrderRescheduleSchema),
  rescheduleCalibrationOrderController,
);
router.post(
  '/calibration/orders/:id/close',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(calibrationOrderCloseSchema),
  closeCalibrationOrderController,
);
router.post(
  '/calibration/plans/:id/schedule',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(scheduleDatesSchema),
  addCalibrationScheduleController,
);
router.get(
  '/tickets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  listHelpdeskTicketsController,
);
router.get(
  '/tickets/summary',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  getHelpdeskTicketStatsController,
);
router.get(
  '/tickets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  getHelpdeskTicketByIdController,
);
router.post(
  '/tickets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskTicketSchema),
  createHelpdeskTicketController,
);
router.patch(
  '/tickets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskTicketSchema),
  updateHelpdeskTicketController,
);
router.post(
  '/tickets/:id/comments',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskTicketCommentSchema),
  addHelpdeskTicketCommentController,
);
router.post(
  '/tickets/:id/iso-risk',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskTicketIsoRiskSchema),
  evaluateHelpdeskTicketIsoRiskController,
);
router.post(
  '/tickets/:id/technical-release',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskTicketTechnicalReleaseSchema),
  releaseHelpdeskTicketTechnicallyController,
);
router.post(
  '/tickets/:id/solve',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskTicketSolveSchema),
  solveHelpdeskTicketController,
);
router.post(
  '/tickets/:id/validate-return',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskTicketValidateReturnSchema),
  validateHelpdeskTicketReturnController,
);
router.get(
  '/assets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listHelpdeskAssetsController,
);
// Avance de la depuracion de la carga (antes de /assets/:id para no colisionar).
router.get(
  '/assets/review-progress',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getAssetReviewProgressController,
);
router.get(
  '/assets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getHelpdeskAssetByIdController,
);
router.post(
  '/assets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskAssetSchema),
  createHelpdeskAssetController,
);
router.patch(
  '/assets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(helpdeskAssetSchema),
  updateHelpdeskAssetController,
);
router.delete(
  '/assets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  deleteHelpdeskAssetController,
);
// Revision de carga: marcar/desmarcar activo como revisado.
router.post(
  '/assets/:id/review',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  setAssetReviewStatusController,
);

// --- Componentes de activo (activos compuestos) ---
router.post(
  '/assets/:id/components',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(assetComponentSchema),
  createAssetComponentController,
);
router.post(
  '/assets/:id/components/attach',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(assetComponentAttachSchema),
  attachAssetComponentController,
);
router.post(
  '/assets/:id/detach',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  detachAssetComponentController,
);

// --- Ciclo de vida del equipo (ISO 15189:2022) ---
router.get(
  '/assets/:id/expedient',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getAssetExpedientController,
);
router.get(
  '/assets/:id/lifecycle-events',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listAssetLifecycleEventsController,
);
router.post(
  '/assets/:id/lifecycle-events',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(lifecycleEventSchema),
  createLifecycleEventController,
);
router.get(
  '/lifecycle-events/:eventId',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getLifecycleEventDetailController,
);
router.patch(
  '/lifecycle-events/:eventId',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validate(lifecycleEventSchema),
  updateLifecycleEventController,
);

// --- Evidencias documentales del equipo (PDF) ---
router.get(
  '/assets/:id/documents',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listAssetDocumentsController,
);
router.post(
  '/assets/:id/documents',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  upload.single('file'),
  uploadAssetDocumentController,
);
router.get(
  '/asset-documents/:documentId/view',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  viewAssetDocumentController,
);

export default router;
