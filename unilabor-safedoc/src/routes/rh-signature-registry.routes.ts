import { Router } from 'express';
import {
  createDisciplineController,
  getSignatureRegistryController,
  getSignatureRegistryPdfController,
  getSpecimenImageController,
  listDisciplinesController,
  listSpecimensController,
  proposeSigningScopeController,
  registerSpecimenController,
  retireSpecimenController,
  saveSignatureAuthorizationController,
  updateDisciplineController,
} from '../controllers/rh-signature-registry.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { disciplineSchema, signatureAuthorizationSchema, signatureRegistryPdfSchema, specimenSchema } from '../schemas/rh-signature-registry.schema';

/**
 * Registro de firmas autorizadas (REH-REG-027). Se monta en /api/rh. Todo lo
 * cubre un solo permiso: consulta, PDF, captura y especimenes.
 */
const router = Router();

router.use(verifyToken);
const manage = requirePermission('RH.SIGNATURE_REGISTRY.MANAGE');

router.get('/signature-registry', manage, getSignatureRegistryController);
// POST: recibe las claves de las filas que muestra la pantalla (sin claves = registro completo).
router.post('/signature-registry/pdf', manage, validate(signatureRegistryPdfSchema), getSignatureRegistryPdfController);

router.get('/signature-registry/disciplines', manage, listDisciplinesController);
router.post('/signature-registry/disciplines', manage, validate(disciplineSchema), createDisciplineController);
router.put('/signature-registry/disciplines/:id', manage, validate(disciplineSchema), updateDisciplineController);

router.get('/signature-registry/specimens/:id/image', manage, getSpecimenImageController);
router.post('/signature-registry/specimens/:id/retire', manage, retireSpecimenController);

router.get('/signature-registry/:employeeId/specimens', manage, listSpecimensController);
router.post('/signature-registry/:employeeId/specimens', manage, validate(specimenSchema), registerSpecimenController);

router.get('/signature-registry/:employeeId/:positionId/scope-proposal', manage, proposeSigningScopeController);
router.put('/signature-registry/:employeeId/:positionId', manage, validate(signatureAuthorizationSchema), saveSignatureAuthorizationController);

export default router;
