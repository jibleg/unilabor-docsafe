import { Router } from 'express';
import {
  createAuthorizationLevelController,
  createOrganizationalLevelController,
  getAuthorizedPersonnelController,
  getAuthorizedPersonnelPdfController,
  getFormSignerImageController,
  listAuthorizationLevelsController,
  listFormSignersController,
  retireFormSignerController,
  setFormSignerController,
  listOrganizationalLevelsController,
  setAuthorizationLevelController,
  updateAuthorizationLevelController,
  updateOrganizationalLevelController,
} from '../controllers/rh-authorized-personnel.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { authorizationLevelSchema, authorizedPersonnelPdfSchema, formSignerBodySchema, organizationalLevelSchema } from '../schemas/rh-authorized-personnel.schema';
import { setCompetencyAuthorizationLevelSchema } from '../schemas/rh-competency-evaluation.schema';

/**
 * Listado de personal autorizado (REH-REG-026). Se monta en /api/rh.
 * Consulta: quien gestiona competencia. Catalogos: los leen tambien quienes
 * administran puestos; los editan RH / Direccion General (quienes autorizan).
 */
const router = Router();

router.use(verifyToken);

const READ_CATALOGS = ['RH.COMPETENCY.MANAGE', 'RH.INDUCTION.MANAGE'];

router.get('/authorized-personnel', requirePermission('RH.COMPETENCY.MANAGE'), getAuthorizedPersonnelController);
// POST: recibe las claves de las filas que muestra la pantalla (sin claves = listado completo).
router.post(
  '/authorized-personnel/pdf',
  requirePermission('RH.COMPETENCY.MANAGE'),
  validate(authorizedPersonnelPdfSchema),
  getAuthorizedPersonnelPdfController,
);
// Firmantes del pie del PDF (ELABORO / REVISO / AUTORIZO): consulta quien gestiona, edita quien autoriza.
router.get('/authorized-personnel/signers', requirePermission('RH.COMPETENCY.MANAGE'), listFormSignersController);
router.get('/authorized-personnel/signers/:slot/image', requirePermission('RH.COMPETENCY.MANAGE'), getFormSignerImageController);
router.put('/authorized-personnel/signers/:slot', requirePermission('RH.COMPETENCY.AUTHORIZE'), validate(formSignerBodySchema), setFormSignerController);
router.post('/authorized-personnel/signers/:slot/retire', requirePermission('RH.COMPETENCY.AUTHORIZE'), retireFormSignerController);
router.put(
  '/authorized-personnel/evaluations/:id/authorization-level',
  requirePermission('RH.COMPETENCY.AUTHORIZE'),
  validate(setCompetencyAuthorizationLevelSchema),
  setAuthorizationLevelController,
);

router.get('/organizational-levels', requirePermission(READ_CATALOGS), listOrganizationalLevelsController);
router.post('/organizational-levels', requirePermission('RH.COMPETENCY.AUTHORIZE'), validate(organizationalLevelSchema), createOrganizationalLevelController);
router.put('/organizational-levels/:id', requirePermission('RH.COMPETENCY.AUTHORIZE'), validate(organizationalLevelSchema), updateOrganizationalLevelController);

router.get('/authorization-levels', requirePermission(READ_CATALOGS), listAuthorizationLevelsController);
router.post('/authorization-levels', requirePermission('RH.COMPETENCY.AUTHORIZE'), validate(authorizationLevelSchema), createAuthorizationLevelController);
router.put('/authorization-levels/:id', requirePermission('RH.COMPETENCY.AUTHORIZE'), validate(authorizationLevelSchema), updateAuthorizationLevelController);

export default router;
