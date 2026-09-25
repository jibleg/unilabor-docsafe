import { Router } from 'express';
import {
  assignKnowledgeQuizController,
  cancelKnowledgeQuizController,
  issueCompetencyCertificateController,
  listApprovedPositionQuestionsController,
  closeCompetencyEvaluationController,
  createCompetencyEvaluationController,
  deleteCompetencyEvaluationController,
  getCompetencyEvaluationController,
  listCompetencyEvaluationsController,
  replaceCompetencyActionsController,
  replaceCompetencySectionItemsController,
  updateCompetencyEvaluationController,
} from '../controllers/rh-competency-evaluation.controller';
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
import {
  assignKnowledgeQuizSchema,
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

// Banco de preguntas IA por PUESTO (seccion 3 Conocimiento). Va ANTES de /:id.
router.post(
  '/positions/:positionId/question-bank/generate',
  validate(generateQuestionBankSchema),
  generateQuestionBankController,
);
router.get('/positions/:positionId/question-bank', listQuestionBankItemsController);
router.get('/positions/:positionId/question-bank/approved', listApprovedPositionQuestionsController);
router.get('/positions/:positionId/question-bank/batches', listQuestionBankBatchesController);
router.patch('/question-bank/:itemId', validate(reviewQuestionBankItemSchema), reviewQuestionBankItemController);
router.delete('/question-bank/:itemId', deleteQuestionBankItemController);

router.get('/', listCompetencyEvaluationsController);
router.post('/', validate(createCompetencyEvaluationSchema), createCompetencyEvaluationController);
router.get('/:id', getCompetencyEvaluationController);
router.patch('/:id', validate(updateCompetencyEvaluationSchema), updateCompetencyEvaluationController);
router.put('/:id/items', validate(replaceSectionItemsSchema), replaceCompetencySectionItemsController);
router.put('/:id/actions', validate(replaceActionsSchema), replaceCompetencyActionsController);
router.post('/:id/close', validate(closeCompetencyEvaluationSchema), closeCompetencyEvaluationController);
router.post('/:id/knowledge-quiz', validate(assignKnowledgeQuizSchema), assignKnowledgeQuizController);
router.delete('/:id/knowledge-quiz', cancelKnowledgeQuizController);
router.post('/:id/certificate', issueCompetencyCertificateController);
router.delete('/:id', deleteCompetencyEvaluationController);

export default router;
