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
import { formSignerBodySchema } from '../schemas/rh-authorized-personnel.schema';
import { createFormSignerControllers } from '../controllers/rh-form-signers.controller';
import { SIGNATURE_REGISTRY_FORM } from '../services/rh-signature-registry.pdf';

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

// Firmantes del pie del PDF (Responsable de elaboracion / Reviso / Aprobo).
const signers027 = createFormSignerControllers(SIGNATURE_REGISTRY_FORM.code);
router.get('/signature-registry/signers', manage, signers027.list);
router.get('/signature-registry/signers/:slot/image', manage, signers027.image);
router.put('/signature-registry/signers/:slot', manage, validate(formSignerBodySchema), signers027.set);
router.post('/signature-registry/signers/:slot/retire', manage, signers027.retire);

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
