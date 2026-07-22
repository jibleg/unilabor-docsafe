import { Router } from 'express';
import {
  assignReadersController,
  cancelReadingController,
  closePublicationController,
  getPublicationController,
  listAssignableAreasController,
  listPublicationsController,
  publishReadingController,
} from '../controllers/quality-reading.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { assignReadersSchema, publishReadingSchema } from '../schemas/quality-reading.schema';

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

router.get('/readings/:id', manageReading, getPublicationController);

router.post(
  '/readings/:id/readers',
  manageReading,
  validate(assignReadersSchema),
  assignReadersController,
);

router.post('/readings/:id/close', manageReading, closePublicationController);

router.delete('/readings/:id/readers/:readingId', manageReading, cancelReadingController);

export default router;
