import { Router } from 'express';
import {
  assignReadersController,
  cancelReadingController,
  closePublicationController,
  getPublicationController,
  listAssignableAreasController,
  listPublicationsController,
  listRepublishCandidatesController,
  publishReadingController,
  republishController,
} from '../controllers/quality-reading.controller';
import {
  downloadSignedCopyController,
  getMyReadingController,
  listMyReadingsController,
  registerReadingProgressController,
  signReadingController,
  viewMyReadingSourceController,
} from '../controllers/quality-reading-self.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  assignReadersSchema,
  publishReadingSchema,
  republishSchema,
  readingProgressSchema,
  signReadingSchema,
} from '../schemas/quality-reading.schema';

const router = Router();

// El permiso va POR RUTA, nunca en un `router.use` sin prefijo: este router
// comparte el montaje /api/quality con otros y un guard general aqui alcanzaria
// tambien a los routers montados despues.
router.use(verifyToken);

const manageReading = requirePermission('QUALITY.READING.MANAGE');

// --- Gestion de la sala de lectura ------------------------------------------
router.get('/readings', manageReading, listPublicationsController);

router.post(
  '/readings',
  manageReading,
  validate(publishReadingSchema),
  publishReadingController,
);

router.get('/readings/areas', manageReading, listAssignableAreasController);

// Antes de /readings/:id para no ser opacada por el parametro.
router.get('/readings/republish-candidates', manageReading, listRepublishCandidatesController);

router.get('/readings/:id', manageReading, getPublicationController);

router.post(
  '/readings/:id/republish',
  manageReading,
  validate(republishSchema),
  republishController,
);

router.post(
  '/readings/:id/readers',
  manageReading,
  validate(assignReadersSchema),
  assignReadersController,
);

router.post('/readings/:id/close', manageReading, closePublicationController);

router.delete('/readings/:id/readers/:readingId', manageReading, cancelReadingController);

// El gestor puede consultar la evidencia firmada de cualquier lector.
router.get(
  '/readings/:id/readers/:readingId/signed',
  manageReading,
  downloadSignedCopyController({ manage: true }),
);

// --- Sala de lectura del colaborador ----------------------------------------
const selfReading = requirePermission('QUALITY.SELF.READING');

router.get('/me/readings', selfReading, listMyReadingsController);
router.get('/me/readings/:id', selfReading, getMyReadingController);
router.get('/me/readings/:id/view', selfReading, viewMyReadingSourceController);
router.get('/me/readings/:id/signed', selfReading, downloadSignedCopyController());

router.post(
  '/me/readings/:id/progress',
  selfReading,
  validate(readingProgressSchema),
  registerReadingProgressController,
);

router.post(
  '/me/readings/:id/sign',
  selfReading,
  validate(signReadingSchema),
  signReadingController,
);

export default router;
