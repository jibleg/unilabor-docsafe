import { Router } from 'express';
import {
  closeCompetencyEvaluationController,
  createCompetencyEvaluationController,
  deleteCompetencyEvaluationController,
  getCompetencyEvaluationController,
  listCompetencyEvaluationsController,
  replaceCompetencyActionsController,
  replaceCompetencySectionItemsController,
  updateCompetencyEvaluationController,
} from '../controllers/rh-competency-evaluation.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  closeCompetencyEvaluationSchema,
  createCompetencyEvaluationSchema,
  replaceActionsSchema,
  replaceSectionItemsSchema,
  updateCompetencyEvaluationSchema,
} from '../schemas/rh-competency-evaluation.schema';

/**
 * Rutas del modulo Evaluacion de competencia (REH-REG-003).
 * Montadas en /api/rh/competency-evaluations.
 */
const router = Router();

router.use(verifyToken, requirePermission('RH.COMPETENCY.MANAGE'));

router.get('/', listCompetencyEvaluationsController);
router.post('/', validate(createCompetencyEvaluationSchema), createCompetencyEvaluationController);
router.get('/:id', getCompetencyEvaluationController);
router.patch('/:id', validate(updateCompetencyEvaluationSchema), updateCompetencyEvaluationController);
router.put('/:id/items', validate(replaceSectionItemsSchema), replaceCompetencySectionItemsController);
router.put('/:id/actions', validate(replaceActionsSchema), replaceCompetencyActionsController);
router.post('/:id/close', validate(closeCompetencyEvaluationSchema), closeCompetencyEvaluationController);
router.delete('/:id', deleteCompetencyEvaluationController);

export default router;
