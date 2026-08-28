import { Router } from 'express';
import {
  addPositionCompetencyController,
  addPositionDocumentController,
  assignEmployeePositionController,
  createPositionController,
  deletePositionController,
  deletePositionCompetencyController,
  endEmployeePositionController,
  getPositionByIdController,
  listEmployeePositionsController,
  listPositionsController,
  lookupDocumentByCodeController,
  removePositionDocumentController,
  updatePositionController,
} from '../controllers/rh-position.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  assignEmployeePositionSchema,
  positionCompetencySchema,
  positionDocumentSchema,
  positionSchema,
} from '../schemas/rh-position.schema';

const router = Router();

router.use(verifyToken);

// El router se monta en /api/rh (ver index.ts), las rutas no repiten el prefijo.

// --- Documentos del SGC por codigo (para ligar documentos a un puesto) ------
router.get('/documents/lookup', requirePermission('RH.INDUCTION.MANAGE'), lookupDocumentByCodeController);

// --- Catalogo de puestos -----------------------------------------------------
router.get('/positions', requirePermission('RH.INDUCTION.MANAGE'), listPositionsController);
router.get('/positions/:id', requirePermission('RH.INDUCTION.MANAGE'), getPositionByIdController);
router.post('/positions', requirePermission('RH.INDUCTION.MANAGE'), validate(positionSchema), createPositionController);
router.patch('/positions/:id', requirePermission('RH.INDUCTION.MANAGE'), validate(positionSchema), updatePositionController);
router.delete('/positions/:id', requirePermission('RH.INDUCTION.MANAGE'), deletePositionController);

// --- Competencias tecnicas del puesto ---------------------------------------
router.post(
  '/positions/:id/competencies',
  requirePermission('RH.INDUCTION.MANAGE'),
  validate(positionCompetencySchema),
  addPositionCompetencyController,
);
router.delete(
  '/positions/competencies/:competencyId',
  requirePermission('RH.INDUCTION.MANAGE'),
  deletePositionCompetencyController,
);

// --- Documentos obligatorios del puesto -------------------------------------
router.post(
  '/positions/:id/documents',
  requirePermission('RH.INDUCTION.MANAGE'),
  validate(positionDocumentSchema),
  addPositionDocumentController,
);
router.delete(
  '/positions/documents/:positionDocumentId',
  requirePermission('RH.INDUCTION.MANAGE'),
  removePositionDocumentController,
);

// --- Colaborador <-> puesto (M:N) -------------------------------------------
router.get(
  '/employees/:employeeId/positions',
  requirePermission('RH.INDUCTION.MANAGE'),
  listEmployeePositionsController,
);
router.post(
  '/employees/:employeeId/positions',
  requirePermission('RH.INDUCTION.MANAGE'),
  validate(assignEmployeePositionSchema),
  assignEmployeePositionController,
);
router.delete(
  '/employee-positions/:employeePositionId',
  requirePermission('RH.INDUCTION.MANAGE'),
  endEmployeePositionController,
);

export default router;
