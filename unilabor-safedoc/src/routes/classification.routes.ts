import { Router } from 'express';
import {
  createClassificationController,
  deactivateClassificationController,
  deleteClassificationController,
  listClassificationsController,
  updateClassificationController,
} from '../controllers/classification.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { classificationSchema } from '../schemas/classification.schema';

const router = Router();

router.use(verifyToken);

const classificationsRead = requirePermission('PROVIDERS.CLASSIFICATIONS.READ');
const classificationsManage = requirePermission('PROVIDERS.CLASSIFICATIONS.MANAGE');

router.get('/', classificationsRead, listClassificationsController);
router.post('/', classificationsManage, validate(classificationSchema), createClassificationController);
router.patch(
  '/:id',
  classificationsManage,
  validate(classificationSchema.partial()),
  updateClassificationController,
);
router.post('/:id/deactivate', classificationsManage, deactivateClassificationController);
router.delete('/:id', classificationsManage, deleteClassificationController);

export default router;
