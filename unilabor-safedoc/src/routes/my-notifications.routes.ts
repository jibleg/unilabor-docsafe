import { Router } from 'express';
import {
  countMyNotificationsController,
  listMyNotificationsController,
  markAllMyNotificationsReadController,
  markMyNotificationReadController,
} from '../controllers/my-notifications.controller';
import { verifyToken } from '../middlewares/auth.middleware';

/** Mis notificaciones de Contigo+: solo sesion. Montado en /api/my/notifications. */
const router = Router();

router.use(verifyToken);

router.get('/', listMyNotificationsController);
router.get('/count', countMyNotificationsController);
router.post('/read-all', markAllMyNotificationsReadController);
router.post('/:id/read', markMyNotificationReadController);

export default router;
