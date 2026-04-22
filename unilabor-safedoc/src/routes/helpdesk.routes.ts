import { Router } from 'express';
import {
  addHelpdeskTicketCommentController,
  addMyHelpdeskTicketCommentController,
  closeMaintenanceOrderController,
  confirmMyHelpdeskTicketFunctionalityController,
  createHelpdeskAssetController,
  createMaintenancePlanController,
  createHelpdeskTicketController,
  createMyHelpdeskTicketController,
  deleteHelpdeskAssetController,
  evaluateHelpdeskTicketIsoRiskController,
  getHelpdeskAssetByIdController,
  getHelpdeskDashboardController,
  getHelpdeskSummaryController,
  getHelpdeskTicketByIdController,
  getMyHelpdeskTicketByIdController,
  listHelpdeskAssetsController,
  listHelpdeskCatalogsController,
  listHelpdeskTicketCatalogsController,
  listHelpdeskTicketsController,
  listMyHelpdeskAssetsController,
  listMyHelpdeskTicketsController,
  listMaintenanceCatalogsController,
  listMaintenanceOrdersController,
  listMaintenancePlansController,
  rescheduleMaintenanceOrderController,
  releaseHelpdeskTicketTechnicallyController,
  solveHelpdeskTicketController,
  startMaintenanceOrderController,
  updateHelpdeskAssetController,
  updateMaintenancePlanController,
  updateHelpdeskTicketController,
  validateHelpdeskTicketReturnController,
} from '../controllers/helpdesk.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';

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
  createMyHelpdeskTicketController,
);
router.post(
  '/me/tickets/:id/comments',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
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
  createMaintenancePlanController,
);
router.patch(
  '/maintenance/plans/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
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
  rescheduleMaintenanceOrderController,
);
router.post(
  '/maintenance/orders/:id/close',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  closeMaintenanceOrderController,
);
router.get(
  '/tickets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  listHelpdeskTicketsController,
);
router.get(
  '/tickets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  getHelpdeskTicketByIdController,
);
router.post(
  '/tickets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  createHelpdeskTicketController,
);
router.patch(
  '/tickets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  updateHelpdeskTicketController,
);
router.post(
  '/tickets/:id/comments',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  addHelpdeskTicketCommentController,
);
router.post(
  '/tickets/:id/iso-risk',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  evaluateHelpdeskTicketIsoRiskController,
);
router.post(
  '/tickets/:id/technical-release',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  releaseHelpdeskTicketTechnicallyController,
);
router.post(
  '/tickets/:id/solve',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  solveHelpdeskTicketController,
);
router.post(
  '/tickets/:id/validate-return',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  validateHelpdeskTicketReturnController,
);
router.get(
  '/assets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  listHelpdeskAssetsController,
);
router.get(
  '/assets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR', 'VIEWER']),
  getHelpdeskAssetByIdController,
);
router.post(
  '/assets',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  createHelpdeskAssetController,
);
router.patch(
  '/assets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR']),
  updateHelpdeskAssetController,
);
router.delete(
  '/assets/:id',
  authorizeModuleRole('HELPDESK', ['ADMIN']),
  deleteHelpdeskAssetController,
);

export default router;
